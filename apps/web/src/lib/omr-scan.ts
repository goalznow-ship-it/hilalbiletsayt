const MAX_SIZE = 25 * 1024 * 1024;
const TYPES: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

export async function prepareOmrFile(file: File): Promise<File> {
  if (!file.size || file.size > MAX_SIZE)
    throw new Error('Fayl boş olmamalı və 25 MB-ı keçməməlidir.');
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = TYPES[ext];
  if (!type || (file.type && file.type !== type))
    throw new Error('PDF, JPEG və ya PNG seçin. HEIC şəkli üçün canlı kameradan istifadə edin və ya JPEG kimi saxlayın.');
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const signature = type === 'application/pdf' ? [37, 80, 68, 70, 45] :
    type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10] : [255, 216, 255];
  if (!signature.every((byte, index) => bytes[index] === byte))
    throw new Error('Faylın məzmunu formatına uyğun deyil. Orijinal PDF və ya şəkli seçin.');
  // Phone galleries can return 48 MP originals; keep the whole oriented page within worker limits.
  if (type !== 'application/pdf' && typeof Image !== 'undefined') {
    const url = URL.createObjectURL(file);
    try {
      const photo = new Image();
      photo.src = url;
      await photo.decode();
      const scale = Math.min(1, 2560 / Math.max(photo.naturalWidth, photo.naturalHeight));
      if (scale < 1) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(photo.naturalWidth * scale);
        canvas.height = Math.round(photo.naturalHeight * scale);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(photo, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .95));
        if (!blob) throw new Error('Image conversion failed');
        return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
      }
    } catch {
      throw new Error('Şəkil oxunmadı. Orijinal JPEG/PNG seçin və ya kartı yenidən çəkin.');
    } finally { URL.revokeObjectURL(url); }
  }
  // Some mobile file pickers omit the MIME; the server still checks the signature.
  return file.type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
}

export function omrUploadFeedback(status: string): { kind: 'success' | 'review' | 'error' | 'pending'; message: string } {
  switch (status) {
    case 'COMPLETED': return { kind: 'success', message: 'Skan tamamlandı. Cavablar tanındı və nəticə hesablandı.' };
    case 'REVIEW': return { kind: 'review', message: 'Skan emal edildi. Nəticə manual yoxlama tələb edir; səbəblərə baxın.' };
    case 'PENDING':
    case 'PROCESSING': return { kind: 'pending', message: 'Skan emal olunur. Nəticə səhifəsindən statusu izləyin.' };
    case 'REJECTED': return { kind: 'error', message: 'Fayl oxunmadı. Dəstəklənən, aydın PDF/şəkil seçin; şəkil 20 meqapikseli keçməməlidir.' };
    case 'FAILED': return { kind: 'error', message: 'Skan emalı tamamlanmadı. Eyni faylla yenidən cəhd edin; davam edərsə administratora bildirin.' };
    default: return { kind: 'error', message: 'Skanın nəticəsi təsdiqlənmədi. Yükləmə siyahısından statusu yoxlayın.' };
  }
}

/** Thresholds for the hands-free phone camera. */
export const AUTO_CAPTURE = { minBrightness: 60, maxMotion: 6, minContrast: 15, steadyFrames: 6 } as const;

export type FrameAnalysis = {
  /** Mean luminance, 0–255. */
  brightness: number;
  /** Mean difference from the previous frame, 0–255; 255 when there is none. */
  motion: number;
  /** Luminance spread, 0–255; a blank wall is low, a printed sheet is high. */
  contrast: number;
  /** Downsampled luminance reused as the previous frame. */
  gray: Uint8ClampedArray;
};

/**
 * Sample RGBA video pixels, measure light and movement. Cheap enough to run on
 * a phone every 200 ms; the worker still performs the real OMR detection.
 */
export function analyzeFrame(rgba: Uint8ClampedArray, previous?: Uint8ClampedArray): FrameAnalysis {
  const step = 4; // every fourth pixel
  const gray = new Uint8ClampedArray(Math.ceil(rgba.length / 4 / step));
  let brightness = 0;
  let squares = 0;
  let motion = 0;
  for (let pixel = 0, index = 0; pixel < rgba.length; pixel += 4 * step, index += 1) {
    const value = (rgba[pixel] * 299 + rgba[pixel + 1] * 587 + rgba[pixel + 2] * 114) / 1000;
    gray[index] = value;
    brightness += value;
    squares += value * value;
    motion += Math.abs(value - (previous?.[index] ?? value));
  }
  if (!gray.length) return { brightness: 0, motion: 255, contrast: 0, gray };
  const mean = brightness / gray.length;
  return {
    brightness: mean,
    motion: previous ? motion / gray.length : 255,
    contrast: Math.sqrt(Math.max(0, squares / gray.length - mean * mean)),
    gray,
  };
}

/** dark: too little light; move: the phone is shaking; flat: no sheet is framed; steady: safe to capture. */
export function frameGuidance(frame: Pick<FrameAnalysis, 'brightness' | 'motion' | 'contrast'>): 'dark' | 'move' | 'flat' | 'steady' {
  if (frame.brightness < AUTO_CAPTURE.minBrightness) return 'dark';
  if (frame.motion > AUTO_CAPTURE.maxMotion) return 'move';
  if (frame.contrast < AUTO_CAPTURE.minContrast) return 'flat';
  return 'steady';
}

export type SheetFrame = { corners: Array<{ x: number; y: number }>; ready: boolean };

/** Locate four isolated marker-shaped components. QR identity and ArUco IDs remain worker-authoritative. */
export function detectSheetFrame(rgba: Uint8ClampedArray, width: number, height: number): SheetFrame {
  const missing: SheetFrame = { corners: [], ready: false };
  if (width < 80 || height < 80 || rgba.length !== width * height * 4) return missing;
  const dark = new Uint8Array(width * height);
  for (let i = 0; i < dark.length; i++) dark[i] = (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) < 300 ? 1 : 0;
  const stack = new Int32Array(dark.length);
  const candidates: Array<{ x: number; y: number; size: number }> = [];
  const minSide = Math.max(4, Math.min(width, height) * .014);
  const maxSide = Math.min(width, height) * .085;
  for (let start = 0; start < dark.length; start++) {
    if (!dark[start]) continue;
    let length = 1, count = 0;
    stack[0] = start; dark[start] = 0;
    let minX = width, maxX = 0, minY = height, maxY = 0;
    while (length) {
      const index = stack[--length], x = index % width, y = Math.floor(index / width);
      count++;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const next of [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1, y < height - 1 ? index + width : -1]) {
        if (next >= 0 && dark[next]) { dark[next] = 0; stack[length++] = next; }
      }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const fill = count / (w * h);
    if (w < minSide || h < minSide || w > maxSide || h > maxSide || w / h < .6 || w / h > 1.65 || fill < .4 || fill > .95) continue;
    if (minX < 2 || minY < 2 || maxX >= width - 2 || maxY >= height - 2) continue;
    candidates.push({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, size: (w + h) / 2 });
  }
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([right, bottom]) => candidates
    .filter(p => (right ? p.x > width * .6 : p.x < width * .4) && (bottom ? p.y > height * .6 : p.y < height * .4))
    .sort((a, b) => Math.hypot(a.x / width - right, a.y / height - bottom) - Math.hypot(b.x / width - right, b.y / height - bottom))[0]);
  if (corners.some(corner => !corner)) return missing;
  const [tl, tr, br, bl] = corners;
  const horizontal = (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(br.x - bl.x, br.y - bl.y)) / 2;
  const vertical = (Math.hypot(bl.x - tl.x, bl.y - tl.y) + Math.hypot(br.x - tr.x, br.y - tr.y)) / 2;
  const ratio = Math.min(horizontal, vertical) / Math.max(horizontal, vertical);
  const sizes = corners.map(corner => corner.size);
  const ready = horizontal * vertical > width * height * .35 && ratio > .52 && ratio < .85 &&
    Math.max(...sizes) / Math.min(...sizes) < 1.8 &&
    Math.abs(tl.y - tr.y) < height * .13 && Math.abs(bl.y - br.y) < height * .13 &&
    Math.abs(tl.x - bl.x) < width * .13 && Math.abs(tr.x - br.x) < width * .13;
  return { corners: corners.map(({ x, y }) => ({ x: x / width, y: y / height })), ready };
}
