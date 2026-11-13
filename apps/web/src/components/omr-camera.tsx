"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeFrame, frameGuidance, detectSheetFrame, AUTO_CAPTURE } from '@/lib/omr-scan';

export type CaptureSource = 'auto' | 'manual';

export function OmrCamera({ onCapture, autoStart = false }: { onCapture: (file: File, source: CaptureSource) => void; autoStart?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const nativeInput = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const attempt = useRef(0);
  const capturing = useRef(false);
  const handler = useRef(onCapture);
  const autoPref = useRef<boolean | null>(null);
  const [opening, setOpening] = useState(false);
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [auto, setAuto] = useState(false);
  const [guide, setGuide] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);

  useEffect(() => { handler.current = onCapture; }, [onCapture]);

  const release = useCallback(() => {
    attempt.current += 1;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  const close = useCallback(() => {
    release();
    capturing.current = false;
    setOpening(false); setActive(false); setReady(false); setBusy(false); setGuide(''); setProgress(0);
  }, [release]);

  useEffect(() => {
    const hide = () => { if (document.hidden) close(); };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); release(); };
  }, [close, release]);

  const open = useCallback(async () => {
    close(); setError('');
    // Hands-free capture is the default on phones; desktop operators keep the shutter.
    if (autoPref.current === null)
      autoPref.current = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    setAuto(autoPref.current);
    if (!window.isSecureContext) {
      setError('Canlı kamera üçün saytı HTTPS ilə açın. Hazırda “Telefonla şəkil çək” və ya fayl seçimi ilə davam edə bilərsiniz.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Brauzer canlı kameranı dəstəkləmir. “Telefonla şəkil çək” seçin və ya saytı Safari/Chrome-da açın.');
      return;
    }
    const current = attempt.current;
    setOpening(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 2560 } },
      });
      // Permission can resolve after cancel, navigation, or switching apps.
      if (current !== attempt.current || !video.current) {
        media.getTracks().forEach(track => track.stop());
        return;
      }
      stream.current = media;
      media.getVideoTracks().forEach(track => track.addEventListener('ended', close, { once: true }));
      video.current.srcObject = media;
      await video.current.play();
      if (current === attempt.current) { setActive(true); setOpening(false); }
    } catch (err) {
      if (current !== attempt.current) return;
      close();
      const name = err instanceof Error ? err.name : '';
      setError(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Kameraya icazə verilməyib. Brauzerin sayt ayarlarında kamera icazəsini açın və yenidən cəhd edin.'
        : name === 'NotFoundError'
          ? 'Kamera tapılmadı. Fayl seçimi ilə skanı yükləyə bilərsiniz.'
          : 'Kamera açıla bilmədi. Kameranı istifadə edən başqa tətbiqi bağlayın və ya “Telefonla şəkil çək” seçin.');
    }
  }, [close]);

  useEffect(() => {
    if (!autoStart) return;
    // Allow the new video element to mount; cancel before requesting permission if it unmounts.
    const timer = window.setTimeout(() => void open(), 0);
    return () => window.clearTimeout(timer);
  }, [autoStart, open]);

  const capture = useCallback(async (source: CaptureSource) => {
    const element = video.current;
    if (!element || !ready || capturing.current) return;
    setError('');
    if (Math.min(element.videoWidth, element.videoHeight) < 600) {
      setError('Kamera görüntüsü çox kiçikdir. Daha aydın şəkil üçün “Telefonla şəkil çək” seçin.');
      return;
    }
    const current = attempt.current;
    capturing.current = true;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 2560 / Math.max(element.videoWidth, element.videoHeight));
      canvas.width = Math.round(element.videoWidth * scale);
      canvas.height = Math.round(element.videoHeight * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      // Preserve the entire frame, including the four alignment markers.
      context.drawImage(element, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .95));
      if (current !== attempt.current) return;
      if (!blob) throw new Error('Capture failed');
      navigator.vibrate?.(source === 'auto' ? 40 : 20);
      close();
      handler.current(new File([blob], `cavab-karti-${Date.now()}.jpg`, { type: 'image/jpeg' }), source);
    } catch {
      if (current === attempt.current) {
        capturing.current = false;
        setBusy(false);
        setError('Şəkil çəkilmədi. Yenidən cəhd edin və ya telefonla şəkil çəkib yükləyin.');
      }
    }
  }, [close, ready]);

  // Automatic shutter: the frame must be light enough and still for one second.
  // Four marker-shaped corners must also remain in view; the worker verifies their identities.
  useEffect(() => {
    if (!active || !ready || !auto) return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    let previous: Uint8ClampedArray | undefined;
    let stable = 0;
    const timer = window.setInterval(() => {
      const element = video.current;
      if (!element || !element.videoWidth || capturing.current) return;
      const scale = 480 / Math.max(element.videoWidth, element.videoHeight);
      const width = Math.round(element.videoWidth * scale);
      const height = Math.round(element.videoHeight * scale);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.drawImage(element, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      const frame = analyzeFrame(pixels, previous);
      previous = frame.gray;
      const guidance = frameGuidance(frame);
      if (guidance !== 'steady') {
        stable = 0;
        setProgress(0);
        setGuide(guidance === 'dark'
          ? 'İşıq azdır. Kartı işıqlı yerə qoyun.'
          : guidance === 'flat'
            ? 'Kartı çərçivəyə tam sığdırın.'
            : 'Kartı sabit saxlayın.');
        return;
      }
      const sheet = detectSheetFrame(pixels, width, height);
      if (!sheet.ready) {
        stable = 0; setProgress(0);
        setGuide('Dörd künc nişanını tam göstərin. Telefonu vərəqə paralel tutun və kartı yaxınlaşdırın.');
        return;
      }
      stable += 1;
      setProgress(Math.min(stable, AUTO_CAPTURE.steadyFrames));
      if (stable < AUTO_CAPTURE.steadyFrames) {
        setGuide('Kart görünür. Sabit saxlayın…');
        return;
      }
      setGuide('Kart sabitdir. Şəkil çəkilir…');
      void capture('auto');
    }, 200);
    return () => window.clearInterval(timer);
  }, [active, ready, auto, capture]);

  return <div className="space-y-3 rounded-lg border border-slate-200 p-3 sm:p-4">
    <p className="font-medium text-slate-800">Telefonla cavab kartını skan et</p>
    <p className="text-sm text-slate-600">Kartı düz və işıqlı səthə qoyun. Dörd künc nişanı və QR tam görünsün. Avtomatik rejimdə künclər görünəndə və görüntü sabitləşəndə skan başlayır.</p>
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={auto} disabled={!active}
        onChange={event => { autoPref.current = event.target.checked; setAuto(event.target.checked); setGuide(''); }}
        className="mt-0.5 h-5 w-5 accent-[#7A0014]" />
      <span>Avtomatik çəkim — kart hazır olanda özü çəkir</span>
    </label>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => void open()} disabled={opening || active}
        className="rounded-lg bg-[#7A0014] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
        {opening ? 'Kamera açılır…' : 'Kameranı aç'}
      </button>
      <button type="button" onClick={() => { close(); setError(''); nativeInput.current?.click(); }}
        className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold">Telefonla şəkil çək</button>
      {(opening || active) && <button type="button" onClick={close}
        className="rounded-lg border border-slate-300 px-4 py-3 text-sm">Kameranı bağla</button>}
    </div>
    <input ref={nativeInput} id="omr-camera-file" type="file" accept="image/jpeg,image/png" capture="environment" className="hidden"
      aria-label="Telefon kamerasından şəkil" onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) handler.current(file, 'manual');
      }} />
    <div hidden={!opening && !active} className="space-y-3">
      <div className="relative">
        <video ref={video} muted playsInline autoPlay aria-label="Cavab kartının canlı kamera görüntüsü"
          onLoadedData={() => setReady(true)} className="max-h-[65vh] w-full rounded-lg bg-slate-900 object-contain" />
        {auto && active && <div aria-hidden="true"
          className="pointer-events-none absolute inset-3 rounded-lg border-2 border-dashed border-white/70" />}
      </div>
      {opening && <p role="status" className="text-sm text-slate-600">Brauzerdə kamera icazəsini təsdiqləyin. İstəsəniz kameranı bağlayıb fayl seçə bilərsiniz.</p>}
      {auto && active && <p role="status" aria-live="polite" className="text-sm text-slate-600">
        {guide || 'Kartı çərçivəyə tam sığdırın. Şəkil avtomatik çəkiləcək.'}
      </p>}
      {auto && active && <progress max={AUTO_CAPTURE.steadyFrames} value={progress} aria-label="Avtomatik çəkilişə hazırlıq" className="h-2 w-full accent-primary" />}
      <button type="button" onClick={() => void capture('manual')} disabled={!active || !ready || busy}
        className="w-full rounded-lg bg-[#7A0014] px-4 py-3 font-semibold text-white disabled:opacity-40">
        {busy ? 'Çəkilir…' : 'Kartı çək'}
      </button>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
