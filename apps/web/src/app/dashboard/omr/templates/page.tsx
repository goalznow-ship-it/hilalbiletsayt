"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import { useSession } from "@/components/session-provider";
import { OMR_ENABLED } from "@/lib/features";
import { prepareOmrFile } from "@/lib/omr-scan";
import { gridPoints, type Grid } from "@/lib/omr-template";

type Key = { id: string; variant: string; version: number; questionCount: number; choiceCount: number };
type Sample = { width: number; height: number; image: string };
const field = "w-full rounded-lg border border-slate-300 bg-white p-3 text-sm";
const button = "min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40";

export default function TemplatesPage() {
  const { user, request } = useSession();
  const central = (user?.roles ?? (user?.role ? [user.role] : [])).some(role => ["SUPER_ADMIN", "CENTRAL_ADMIN"].includes(role));
  const [exams, setExams] = useState<Array<{ id: string; title: string; code: string }>>([]);
  const [examId, setExamId] = useState("");
  const [keys, setKeys] = useState<Key[]>([]);
  const [keyId, setKeyId] = useState("");
  const key = keys.find(item => item.id === keyId);
  const [name, setName] = useState("");
  const [sample, setSample] = useState<Sample | null>(null);
  const [answers, setAnswers] = useState<Grid[]>([]);
  const [workNumber, setWorkNumber] = useState<Grid | null>(null);
  const [kind, setKind] = useState("answers");
  const [rows, setRows] = useState(20);
  const [radius, setRadius] = useState(.6);
  const [first, setFirst] = useState<{ x: number; y: number } | null>(null);
  const [last, setLast] = useState<{ x: number; y: number } | null>(null);
  const [cursor, setCursor] = useState({ x: .5, y: .5 });
  const [zoom, setZoom] = useState(100);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const count = answers.reduce((sum, grid) => sum + grid.rows, 0);
  const grid: Grid | null = first && last && key ? {
    left: first.x, top: first.y, right: last.x, bottom: kind === "answers" && rows === 1 ? first.y : last.y,
    rows: kind === "answers" ? rows : 10, columns: kind === "answers" ? key.choiceCount : 8, radius: radius / 100,
  } : null;

  useEffect(() => {
    if (!user || !central) return;
    let active = true;
    request<typeof exams>("/exams").then(data => { if (active) setExams(Array.isArray(data) ? data : []); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [request, user, central]);
  useEffect(() => {
    if (!user || !examId || !central) return;
    let active = true;
    request<Key[]>(`/omr/keys?examId=${examId}`).then(data => { if (active) setKeys(Array.isArray(data) ? data : []); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [request, user, central, examId]);

  function clearFields() { setAnswers([]); setWorkNumber(null); setFirst(null); setLast(null); setSaved(""); setError(""); }
  async function upload(file: File) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setSample(null); clearFields();
    try {
      const prepared = await prepareOmrFile(file);
      const body = new FormData(); body.append("file", prepared, prepared.name);
      setSample(await request<Sample>("/omr/templates/preview", { method: "POST", body }));
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
    } catch (err) { setError(err instanceof Error ? err.message : "Boş kart açılmadı."); }
    finally { pending.current = false; setBusy(false); }
  }
  function selectPoint(point: { x: number; y: number }) {
    if (busy || saved) return;
    if (!first || last) { setFirst(point); setLast(null); }
    else setLast(point);
  }
  function addGrid() {
    setError("");
    if (!grid || !key || !Number.isInteger(grid.rows) || grid.rows < 1 || grid.right <= grid.left ||
        (grid.rows > 1 && grid.bottom <= grid.top) || radius < .2 || radius > 3 ||
        kind === "answers" && (count + grid.rows > key.questionCount || answers.length >= 10)) {
      setError("Əvvəl sol yuxarı, sonra sağ aşağı dairənin mərkəzini seçin. Sual sayı və dairə ölçüsünü yoxlayın."); return;
    }
    if (kind === "answers") setAnswers([...answers, grid]); else setWorkNumber(grid);
    setFirst(null); setLast(null);
  }
  async function save() {
    if (!sample || !key || !workNumber || !name.trim() || count !== key.questionCount || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const bytes = Uint8Array.from(atob(sample.image), char => char.charCodeAt(0));
      const body = new FormData(); body.append("file", new Blob([bytes], { type: "image/png" }), "model.png");
      body.append("config", JSON.stringify({ name: name.trim(), answerKeyId: key.id,
        layout: { width: sample.width, height: sample.height, answers, workNumber } }));
      const result = await request<{ id: string }>("/omr/templates", { method: "POST", body });
      setSaved(result.id);
    } catch (err) { setError(err instanceof Error ? err.message : "Model saxlanmadı."); }
    finally { pending.current = false; setBusy(false); }
  }

  return <main className="omr-workspace mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <Link href="/dashboard/omr" className="text-sm text-primary underline">OMR bölməsinə qayıt</Link>
    <header><h1 className="text-2xl font-bold">Öz cavab kartımı əlavə et</h1>
      <p className="mt-2 text-sm text-slate-600">İlk boş kartı model kimi yükləyin. Sahələri bir dəfə tanıtdıqdan sonra doldurulmuş kartları bu modellə skan edin.</p></header>
    {!central ? <p role="status">Modeli mərkəzi administrator əlavə edir. Hazır modeli skan səhifəsindən seçə bilərsiniz.</p> :
    <>
      <fieldset disabled={busy || !!saved || !OMR_ENABLED} className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
        <legend className="px-2 font-semibold">1. İmtahan və boş kart</legend>
        <label className="space-y-2 text-sm">İmtahan<select className={field} value={examId} onChange={e => { setExamId(e.target.value); setKeys([]); setKeyId(""); clearFields(); }}>
          <option value="">İmtahan seçin</option>{exams.map(e => <option key={e.id} value={e.id}>{e.code} — {e.title}</option>)}
        </select></label>
        <label className="space-y-2 text-sm">Cavab açarı<select className={field} value={keyId} onChange={e => { setKeyId(e.target.value); clearFields(); setRows(Math.min(50, keys.find(k => k.id === e.target.value)?.questionCount ?? 20)); }}>
          <option value="">Cavab açarını seçin</option>{keys.map(k => <option key={k.id} value={k.id}>{k.variant} · v{k.version} · {k.questionCount} sual · {k.choiceCount} variant</option>)}
        </select></label>
        {examId && keys.length === 0 && <Link href="/dashboard/omr/keys" className="text-sm text-primary underline">Əvvəl düzgün cavabları və bal qaydalarını əlavə edin</Link>}
        <label className="space-y-2 text-sm">Modelin adı<input maxLength={100} className={field} value={name} onChange={e => setName(e.target.value)} placeholder="Məsələn: 9-cu sinif cavab kartım" /></label>
        <label className="space-y-2 text-sm">Boş cavab kartının skanı<input type="file" disabled={!key} accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className={field}
          onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} /></label>
        <p className="text-sm text-slate-600 sm:col-span-2">Tək səhifəli PDF, PNG və ya JPEG (25 MB-a qədər). Boş, düz, aydın kart yükləyin; kənar fonu əvvəlcədən kəsin.
          Cavablar A–E dairələri ilə, iş nömrəsi 8 sütunda, rəqəmlər yuxarıdan aşağı 0–9 şəklində olmalıdır. QR tələb olunmur.</p>
      </fieldset>
      {sample && key && <section className="space-y-4 rounded-xl border bg-white p-5">
        <h2 className="font-semibold">2. Oxunacaq sahələri tanıt</h2>
        <p className="text-sm text-slate-600">Hər cavab blokunda ilk sualın A dairəsinin mərkəzinə, sonra son sualın son variant dairəsinin mərkəzinə toxunun.
          Yaşıl dairələr çapdakı dairələrlə üst-üstə düşməlidir. Blokları sual sırası ilə əlavə edin.</p>
        <fieldset disabled={busy || !!saved} className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-2 text-sm">Sahə<select className={field} value={kind} onChange={e => { setKind(e.target.value); setFirst(null); setLast(null); }}>
            <option value="answers">Cavab bloku</option><option value="workNumber">İş nömrəsi</option></select></label>
          {kind === "answers" ? <label className="space-y-2 text-sm">Bu blokda sual sayı<input className={field} type="number" min={1} max={150} value={rows} onChange={e => setRows(Number(e.target.value))} /></label>
            : <p className="text-sm">İlk sütundakı 0 və son sütundakı 9 dairəsinin mərkəzini seçin. Nömrə soldan sağa oxunacaq.</p>}
          <label className="space-y-2 text-sm">Dairə radiusu (%)<input className={field} type="number" min={.2} max={3} step={.05} value={radius} onChange={e => setRadius(Number(e.target.value))} /></label>
        </fieldset>
        <label className="flex items-center gap-3 text-sm">Şəkli böyüt<input type="range" min={100} max={300} step={25} value={zoom} onChange={e => setZoom(Number(e.target.value))} />{zoom}%</label>
        <p className="text-sm" role="status">{first ? last ? "Dairələri yoxlayın, sonra sahəni əlavə edin." : "İndi sağ aşağı dairənin mərkəzini seçin." : "Sol yuxarı dairənin mərkəzini seçin."}</p>
        <div className="max-h-[70vh] overflow-auto rounded border bg-slate-100">
          <div style={{ width: `${zoom}%`, position: "relative" }}>
            <Image src={`data:image/png;base64,${sample.image}`} alt="Yüklədiyiniz boş cavab kartı" width={sample.width} height={sample.height} unoptimized className="h-auto w-full" />
            <svg viewBox={`0 0 ${sample.width} ${sample.height}`} className="absolute inset-0 h-full w-full cursor-crosshair"
              role="button" tabIndex={0} aria-label="Kartda dairələrin mərkəzlərini seçin. Ox düymələri ilə hərəkət edin, Enter ilə seçin."
              onClick={e => { const box = e.currentTarget.getBoundingClientRect(); selectPoint({ x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height }); }}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectPoint(cursor); }
                if (e.key.startsWith("Arrow")) { e.preventDefault(); const step = e.shiftKey ? .001 : .01;
                  setCursor({ x: Math.max(0, Math.min(1, cursor.x + (e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0))),
                    y: Math.max(0, Math.min(1, cursor.y + (e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0))) }); }
              }}>
              {[...answers, ...(workNumber ? [workNumber] : []), ...(grid ? [grid] : [])].map((g, i) => <g key={i} fill="none" stroke={i < answers.length ? "#0369a1" : "#15803d"} strokeWidth={2}>
                {gridPoints(g).map((p, j) => <circle key={j} cx={p.x * sample.width} cy={p.y * sample.height} r={g.radius * sample.width} />)}
              </g>)}
              {first && <circle cx={first.x * sample.width} cy={first.y * sample.height} r={5} fill="#be123c" />}
              <path d={`M${cursor.x * sample.width - 8},${cursor.y * sample.height}h16 M${cursor.x * sample.width},${cursor.y * sample.height - 8}v16`} stroke="#be123c" strokeWidth={2} />
            </svg>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={button} disabled={!grid || busy || !!saved} onClick={addGrid}>Sahəni əlavə et</button>
          <button type="button" className={button} disabled={busy || !!saved} onClick={() => { setFirst(null); setLast(null); }}>Seçimi yenilə</button>
          <button type="button" className={button} disabled={busy || !!saved || !answers.length} onClick={() => setAnswers(answers.slice(0, -1))}>Son cavab blokunu sil</button>
        </div>
        <p className="text-sm font-semibold">{count} / {key.questionCount} sual tanıdılıb · İş nömrəsi: {workNumber ? "tanıdılıb" : "sahə seçilməyib"}</p>
        <ol className="list-inside list-decimal text-sm">{answers.map((g, i) => <li key={i}>Sual {1 + answers.slice(0, i).reduce((n, b) => n + b.rows, 0)}–{answers.slice(0, i + 1).reduce((n, b) => n + b.rows, 0)} · {g.columns} variant</li>)}</ol>
        <p className="text-sm text-slate-600">Ad və soyad oxunan iş nömrəsinə uyğun biletdən götürülür. Əlyazma adlar avtomatik oxunmur.</p>
      </section>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {busy && <p role="status">Kart yoxlanılır… Səhifəni açıq saxlayın.</p>}
      {saved ? <div role="status" className="space-y-3 rounded-xl bg-emerald-50 p-5 text-emerald-900"><p>Model saxlanıldı. Doldurulmuş kartları bu modellə skan edə bilərsiniz.</p>
        <Link className="inline-flex min-h-11 items-center font-semibold underline" href={`/dashboard/omr/upload?examId=${examId}&templateId=${saved}`}>Bu modellə skan et</Link></div>
        : <button type="button" className="min-h-11 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground disabled:opacity-40"
          disabled={busy || !OMR_ENABLED || !sample || !name.trim() || !key || count !== key.questionCount || !workNumber} onClick={() => void save()}>Modeli yoxla və saxla</button>}
      {!OMR_ENABLED && <p role="status">OMR bu saytda deaktivdir.</p>}
    </>}
  </main>;
}
