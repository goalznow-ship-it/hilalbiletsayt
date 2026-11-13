"use client";
import Link from "next/link";
import { OMR_ENABLED } from "@/lib/features";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSession } from "@/components/session-provider";
import { parseAnswerKey } from "@/lib/omr-key";

type Exam = { id: string; title: string; code: string };
type Question = { id: string; question: string; variants: string; correct: number; points: number };
type Key = { id: string; variant: string; version: number; choiceCount: number; questionCount: number;
  answers?: Array<{ correct: string; points: number }> };
const TEST = OMR_ENABLED;

export default function KeysPage() {
  const { user, initializing, request } = useSession();
  const central = (user?.roles ?? (user?.role ? [user.role] : [])).some(x => ["SUPER_ADMIN", "CENTRAL_ADMIN"].includes(x));
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [randomCount, setRandomCount] = useState(10);
  const [keys, setKeys] = useState<Key[]>([]);
  const [variant, setVariant] = useState("A");
  const [choices, setChoices] = useState(4);
  const [mode, setMode] = useState<"direct" | "bank">("direct");
  const [count, setCount] = useState(20);
  const [answers, setAnswers] = useState<string[]>(Array(150).fill(""));
  const [points, setPoints] = useState<number[]>(Array(150).fill(1));
  const [paste, setPaste] = useState("");
  const [loading, setLoading] = useState(false);
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
    if (!examId || !user) return;
    let active = true;
    request<Key[]>(`/omr/keys?examId=${encodeURIComponent(examId)}`)
      .then(data => {
        if (active) setKeys(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        if (active) {
          setError(err instanceof Error ? err.message : "Açarlar alınmadı.");
        }
      }).finally(() => { if (active) setLoading(false); });
    if (central) {
      request<Question[]>(`/question/exam/${examId}`).then(items => {
        if (active) { const data = Array.isArray(items) ? items : []; setQuestions(data); setSelected(data.map(q => q.id)); }
      }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Suallar alınmadı."); });
    }
    return () => { active = false; };
  }, [examId, central, request, user]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setInfo("");
    if (!TEST || !central || !examId) return;
    if (!/^[A-Z0-9_-]{1,16}$/.test(variant)) { setError("Variant kodu düzgün deyil."); return; }
    if (mode === "bank" && (selected.length < 1 || selected.length > 150)) { setError("1–150 sual seçin."); return; }
    if (mode === "direct" && (!Number.isInteger(count) || count < 1 || count > 150 ||
      answers.slice(0, count).some(answer => !answer || !"ABCDE".slice(0, choices).includes(answer)) ||
      points.slice(0, count).some(point => !Number.isInteger(point) || point < 1 || point > 1000))) {
      setError("Hər sualın düzgün cavabını və 1–1000 arası tam balını qeyd edin."); return;
    }
    const chosen = questions.filter(q => selected.includes(q.id));
    if (mode === "bank" && chosen.some(q => q.variants.split("|").length !== choices || q.correct > choices || q.correct < 1)) {
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
      await request<{ id: string }>("/omr/keys", { method: "POST",
        body: JSON.stringify({ examId, variant, choiceCount: choices,
          ...(mode === "direct" ? { answers: answers.slice(0, count).map((correct, index) => ({ correct, points: points[index] })) }
            : { questionIds: chosen.map(q => q.id) }), scoring }) });
      setInfo(`Variant ${variant} üçün cavab açarı saxlanıldı. İndi cavab vərəqlərini hazırlaya bilərsiniz.`);
      await refresh(examId);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Yaratma alınmadı."); }
    finally { setBusy(false); }
  }

  if (initializing) return <p role="status">Yüklənir…</p>;
  if (!user) return <Link href="/login">Daxil olun</Link>;
  const filled = answers.slice(0, count).filter(answer => answer && "ABCDE".slice(0, choices).includes(answer)).length;
  return <main className="omr-workspace mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <Link href="/dashboard/omr" className="text-sm text-[#7A0014]">OMR bölməsinə qayıt</Link>
    <h1 className="text-2xl font-bold">Cavab açarları</h1>
    <p className="max-w-prose text-sm text-muted-foreground">İmtahanı seçin və hər sualın düzgün cavabına toxunun. Açarı vərəqləri çap etməzdən əvvəl hazırlayın.</p>
    <label className="block space-y-2 text-sm font-medium">İmtahan
      <select value={examId} onChange={e => {
        const nextId = e.target.value;
        setExamId(nextId);
        setLoading(!!nextId);
        setKeys([]);
        setQuestions([]);
        setSelected([]);
        setError("");
        setInfo("");
        setAnswers(Array(150).fill("")); setPoints(Array(150).fill(1)); setPaste("");
      }} disabled={busy} className="block w-full rounded-lg border border-slate-300 bg-white p-3">
        <option value="">İmtahan seçin</option>
        {exams.map(exam => <option key={exam.id} value={exam.id}>{exam.code} — {exam.title}</option>)}
      </select>
    </label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {info && <p role="status" className="break-all text-sm text-green-700">{info}</p>}
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">Mövcud açarlar</h2>
      {loading ? <p role="status" className="py-3 text-sm">Açarlar yüklənir…</p> : keys.length ? keys.map(key => <div key={key.id} className="border-b border-slate-100 py-3 text-sm">
        <p>Variant {key.variant} · versiya {key.version} · {key.questionCount} sual · {key.choiceCount} seçim</p>
        {key.answers && <details className="mt-2"><summary className="cursor-pointer py-2 text-primary">Düzgün cavablara bax</summary>
          <ol className="flex flex-wrap gap-2 py-2">{key.answers.map((answer, index) => <li key={index} className="rounded-lg bg-muted px-3 py-2">
            {index + 1}. <strong>{answer.correct}</strong> <span className="text-muted-foreground">· {answer.points} bal</span>
          </li>)}</ol>
        </details>}
      </div>) : <p className="mt-2 text-sm text-slate-500">{examId ? "Bu imtahan üçün ilk cavab açarını aşağıda yaradın." : "Açarları görmək üçün imtahan seçin."}</p>}
      {!!keys.length && <Link className="mt-4 inline-flex min-h-11 items-center font-medium text-primary underline" href="/dashboard/omr/sheets">Cavab vərəqi hazırla</Link>}
    </section>
    {central && <form onSubmit={create} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">Yeni cavab açarı yarat</h2>
      {!TEST && <p className="text-sm text-amber-700">OMR bu saytda deaktivdir.</p>}
      <fieldset disabled={busy || !examId || !TEST} className="space-y-5 disabled:opacity-60">
      <legend className="sr-only">Cavab açarının məlumatları</legend>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Cavabların daxil edilməsi">
        <button type="button" aria-pressed={mode === "direct"} onClick={() => setMode("direct")} className="omr-mode">Cavabları qeyd et</button>
        <button type="button" aria-pressed={mode === "bank"} onClick={() => setMode("bank")} className="omr-mode">Sual bankından seç</button>
      </div>
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
      {mode === "direct" ? <div className="space-y-5">
        <label className="block space-y-2 text-sm">Sual sayı
          <input type="number" min={1} max={150} value={count || ""} onChange={event => setCount(Math.min(150, Math.max(0, Number(event.target.value))))}
            className="block w-32 rounded-lg border border-border p-3" />
        </label>
        <details className="border-y border-border py-2"><summary className="cursor-pointer py-2 text-sm font-medium">Hazır cavab siyahısını yapışdır</summary>
          <label className="mt-3 block space-y-2 text-sm">Cavab siyahısı
            <textarea value={paste} onChange={event => setPaste(event.target.value)} maxLength={3000} rows={3}
              placeholder="ABCD və ya 1:A 2:B 3:C 4:D" className="block w-full rounded-lg border border-border p-3" />
          </label>
          <button type="button" className="mt-2 rounded-lg border border-border px-4 py-3 text-sm" onClick={() => {
            try {
              const parsed = parseAnswerKey(paste, choices);
              setAnswers([...parsed, ...Array(150 - parsed.length).fill("")]); setCount(parsed.length); setError("");
              setInfo(`${parsed.length} cavab yerləşdirildi. Yoxlayıb açarı saxlayın.`);
            } catch (err) { setError(err instanceof Error ? err.message : "Cavablar oxunmadı."); }
          }}>Cavabları yerləşdir</button>
        </details>
        <div className="flex flex-wrap justify-between gap-2 text-sm" aria-live="polite">
          <strong>{filled} / {count} cavab qeyd edilib</strong>
          <span>Maksimum: {points.slice(0, count).reduce((sum, point) => sum + point, 0)} bal</span>
        </div>
        <div className="omr-answer-editor divide-y divide-border">
          {Array.from({ length: count }, (_, index) => <fieldset key={index} className="py-4">
            <legend className="sr-only">Sual {index + 1}</legend>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">Sual {index + 1}</span>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">Bal
                <input aria-label={`Sual ${index + 1} balı`} type="number" min={1} max={1000} value={points[index] || ""}
                  onChange={event => setPoints(old => old.map((point, i) => i === index ? Number(event.target.value) : point))}
                  className="w-20 rounded-lg border border-border bg-background p-2 text-foreground" />
              </label>
            </div>
            <div className="flex gap-2">{"ABCDE".slice(0, choices).split("").map(choice => <label key={choice} className="omr-answer-choice">
              <input type="radio" name={`answer-${index}`} value={choice} checked={answers[index] === choice}
                aria-label={`Sual ${index + 1}: ${choice}`}
                onChange={() => setAnswers(old => old.map((answer, i) => i === index ? choice : answer))} />
              <span>{choice}</span>
            </label>)}</div>
          </fieldset>)}
        </div>
      </div> : <>
      <h3 className="font-medium">Suallar ({selected.length})</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Təsadüfi sual sayı
          <input type="number" min={1} max={150} value={randomCount} onChange={e => setRandomCount(Number(e.target.value))}
            className="block w-28 rounded border border-slate-300 p-2" />
        </label>
        <button type="button" disabled={busy || !examId} className="rounded border border-slate-300 p-2 text-sm disabled:opacity-40"
          onClick={async () => {
            setBusy(true); setError(""); setInfo("");
            try {
              const rows = await request<Question[]>(`/question/random?${new URLSearchParams({ examId, count: String(randomCount), choiceCount: String(choices) })}`);
              setSelected(rows.map(row => row.id));
              setInfo(`${rows.length} sual təsadüfi seçildi. Açarı yaratmaqla seçimi saxlayın.`);
            } catch (err) { setError(err instanceof Error ? err.message : "Suallar seçilmədi."); }
            finally { setBusy(false); }
          }}>Təsadüfi seç</button>
      </div>
      <button type="button" className="text-sm text-[#7A0014] underline" onClick={() => setSelected(questions.map(q => q.id))}>Hamısını seç</button>
      <p className="text-xs text-slate-500">Suallar yaradılma sırası ilə saxlanır; düzgün cavablar yalnız mərkəzi administratora görünür.</p>
      <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {questions.map((q, i) => <label key={q.id} className="flex gap-3 p-3 text-sm">
          <input type="checkbox" checked={selected.includes(q.id)} onChange={e => setSelected(prev =>
            e.target.checked ? questions.filter(x => x.id === q.id || prev.includes(x.id)).map(x => x.id)
              : prev.filter(id => id !== q.id))} />
          <span className="flex-1">{i + 1}. {q.question}</span>
          <span className="shrink-0 text-xs text-slate-500">Cavab {"ABCDE"[q.correct - 1]} · {q.points} bal</span>
        </label>)}
      </div>
      {!questions.length && <p className="text-sm text-muted-foreground">Sual bankı boşdur. “Cavabları qeyd et” bölməsində açarı birbaşa hazırlaya bilərsiniz.</p>}
      </>}
      <p className="text-sm text-muted-foreground">Hər saxlama yeni versiya yaradır. Əvvəl çap edilmiş vərəqlər öz cavab açarı ilə yoxlanır.</p>
      </fieldset>
      <button type="submit" disabled={!TEST || !examId || (mode === "bank" ? !selected.length : !count || filled !== count) || busy || loading}
        className="rounded-lg bg-[#7A0014] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">
        {busy ? "Saxlanılır…" : "Cavab açarını saxla"}
      </button>
    </form>}
  </main>;
}
