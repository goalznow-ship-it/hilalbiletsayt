"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSession } from "@/components/session-provider";

type Exam = { id: string; title: string; code: string };
type Question = { id: string; question: string; variants: string; correct: number; points: number };
type Key = { id: string; variant: string; version: number; choiceCount: number; questionCount: number };
const TEST = process.env.NEXT_PUBLIC_OMR_TEST_UPLOAD_ENABLED === "true";

export default function KeysPage() {
  const { user, initializing, request } = useSession();
  const central = (user?.roles ?? (user?.role ? [user.role] : [])).some(x => ["SUPER_ADMIN", "CENTRAL_ADMIN"].includes(x));
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [keys, setKeys] = useState<Key[]>([]);
  const [variant, setVariant] = useState("A");
  const [choices, setChoices] = useState(4);
  const [penalties, setPenalties] = useState({ wrong: "0", unanswered: "0", multiple: "0" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const refresh = useCallback(async (id: string) => {
    setKeys(await request<Key[]>(`/omr/keys?examId=${encodeURIComponent(id)}`));
  }, [request]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    request<Exam[]>("/exams").then(data => { if (active) setExams(Array.isArray(data) ? data : []); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "İmtahanlar alınmadı."); });
    return () => { active = false; };
  }, [request, user]);

  useEffect(() => {
    setKeys([]); setQuestions([]); setSelected([]);
    if (!examId || !user) return;
    let active = true;
    void refresh(examId).catch(err => { if (active) setError(err instanceof Error ? err.message : "Açarlar alınmadı."); });
    if (central) {
      request<Question[]>(`/question/exam/${examId}`).then(items => {
        if (active) { const data = Array.isArray(items) ? items : []; setQuestions(data); setSelected(data.map(q => q.id)); }
      }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Suallar alınmadı."); });
    }
    return () => { active = false; };
  }, [examId, central, refresh, request, user]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setInfo("");
    if (!TEST || !central || !examId) return;
    if (!/^[A-Z0-9_-]{1,16}$/.test(variant)) { setError("Variant kodu düzgün deyil."); return; }
    if (selected.length < 1 || selected.length > 150) { setError("1–150 sual seçin."); return; }
    const chosen = questions.filter(q => selected.includes(q.id));
    if (chosen.some(q => q.variants.split("|").length !== choices || q.correct > choices || q.correct < 1)) {
      setError("Sualların variant sayı seçilmiş şablona uyğun deyil."); return;
    }
    const scoring = { wrong: Number(penalties.wrong), unanswered: Number(penalties.unanswered),
      multiple: Number(penalties.multiple), floorAtZero: true };
    if ([scoring.wrong, scoring.unanswered, scoring.multiple].some(n =>
      !Number.isFinite(n) || n > 0 || n < -1000 || Math.abs(n * 1000 - Math.round(n * 1000)) > 0.00001)) {
      setError("Cərimə -1000–0 arası, maksimum üç onluq rəqəm olmalıdır."); return;
    }
    setBusy(true);
    try {
      const created = await request<{ id: string }>("/omr/keys", { method: "POST",
        body: JSON.stringify({ examId, variant, choiceCount: choices,
          questionIds: chosen.map(q => q.id), scoring }) });
      setInfo(`Açar yaradıldı: ${created.id}`);
      await refresh(examId);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Yaratma alınmadı."); }
    finally { setBusy(false); }
  }

  if (initializing) return <p role="status">Yüklənir…</p>;
  if (!user) return <Link href="/login">Daxil olun</Link>;
  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <Link href="/dashboard/omr" className="text-sm text-[#7A0014]">OMR bölməsinə qayıt</Link>
    <h1 className="text-2xl font-bold">Cavab açarları</h1>
    <label className="block space-y-2 text-sm font-medium">İmtahan
      <select value={examId} onChange={e => setExamId(e.target.value)} className="block w-full rounded-lg border border-slate-300 bg-white p-3">
        <option value="">İmtahan seçin</option>
        {exams.map(exam => <option key={exam.id} value={exam.id}>{exam.code} — {exam.title}</option>)}
      </select>
    </label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {info && <p role="status" className="break-all text-sm text-green-700">{info}</p>}
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">Mövcud açarlar</h2>
      {keys.length ? keys.map(key => <div key={key.id} className="border-b border-slate-100 py-3 text-sm">
        <p>Variant {key.variant} · versiya {key.version} · {key.questionCount} sual · {key.choiceCount} seçim</p>
        <p className="break-all text-xs text-slate-500">ID: {key.id}</p>
      </div>) : <p className="mt-2 text-sm text-slate-500">Açar tapılmadı.</p>}
    </section>
    {central && <form onSubmit={create} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">Yeni cavab açarı yarat</h2>
      {!TEST && <p className="text-sm text-amber-700">Yaratma yalnız test mühitində aktivdir.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm">Variant kodu
          <input value={variant} maxLength={16} onChange={e => setVariant(e.target.value.toUpperCase())}
            className="block w-full rounded-lg border border-slate-300 p-3" /></label>
        <label className="space-y-2 text-sm">Cavab variantlarının sayı
          <select value={choices} onChange={e => setChoices(Number(e.target.value))}
            className="block w-full rounded-lg border border-slate-300 bg-white p-3">
            {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
          </select></label>
        {(["wrong", "unanswered", "multiple"] as const).map(field => <label key={field} className="space-y-2 text-sm">
          {field === "wrong" ? "Səhv" : field === "unanswered" ? "Boş" : "Çoxsaylı işarə"} cavab cəriməsi
          <input type="number" min={-1000} max={0} step="0.001" value={penalties[field]}
            onChange={e => setPenalties(p => ({ ...p, [field]: e.target.value }))}
            className="block w-full rounded-lg border border-slate-300 p-3" />
        </label>)}
      </div>
      <h3 className="font-medium">Suallar ({selected.length})</h3>
      <button type="button" className="text-sm text-[#7A0014] underline" onClick={() => setSelected(questions.map(q => q.id))}>Hamısını seç</button>
      <p className="text-xs text-slate-500">Suallar yaradılma sırası ilə saxlanır; düzgün cavablar yalnız mərkəzi administratora görünür.</p>
      <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {questions.map((q, i) => <label key={q.id} className="flex gap-3 p-3 text-sm">
          <input type="checkbox" checked={selected.includes(q.id)} onChange={e => setSelected(prev =>
            e.target.checked ? questions.filter(x => x.id === q.id || prev.includes(x.id)).map(x => x.id)
              : prev.filter(id => id !== q.id))} />
          <span className="flex-1">{i + 1}. {q.question}</span>
          <span className="shrink-0 text-xs text-slate-500">Cavab {q.correct} · {q.points} bal</span>
        </label>)}
      </div>
      <button type="submit" disabled={!TEST || !examId || !selected.length || busy}
        className="rounded-lg bg-[#7A0014] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">
        {busy ? "Yaradılır…" : "Açarı yarat"}
      </button>
    </form>}
  </main>;
}
