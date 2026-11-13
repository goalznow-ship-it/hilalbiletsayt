"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/components/session-provider";

type Exam = { id: string; title: string; code: string };
type Upload = { id: string; status: string; createdAt: string; pageCount: number; error: string | null };
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function OmrResultsList() {
  const { user, initializing, request, downloadFile } = useSession();
  const params = useSearchParams();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState(() => UUID.test(params.get("examId") ?? "") ? params.get("examId")! : "");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!examId);
  const [status, setStatus] = useState(params.get("status") === "REVIEW" ? "REVIEW" : "all");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;
    request<Exam[]>("/exams").then(data => { if (active) setExams(Array.isArray(data) ? data : []); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "İmtahanlar alınmadı."); });
    return () => { active = false; };
  }, [request, user]);

  useEffect(() => {
    if (!UUID.test(examId) || !user) return;
    let active = true;
    request<Upload[]>(`/omr/exams/${examId}/uploads`).then(data => {
      if (active) setUploads(Array.isArray(data) ? data : []);
      if (active) setError("");
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Skanlar alınmadı."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [examId, user, request, reload]);

  async function download(format: "csv" | "xlsx" | "pdf") {
    if (!UUID.test(examId)) return;
    setBusy(true); setError("");
    try {
      const blob = await downloadFile(`/omr/exams/${examId}/results.${format}`,
        format === "csv" ? "text/csv" : format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `omr-results-${examId}.${format}`;
      document.body.appendChild(anchor);
      anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "İxrac alınmadı."); }
    finally { setBusy(false); }
  }

  const statusNames: Record<string, string> = { COMPLETED: "Tamamlandı", REVIEW: "Yoxlama gözləyir", FAILED: "Emal alınmadı", REJECTED: "Fayl oxunmadı", PENDING: "Növbədə", PROCESSING: "Emal olunur" };
  const visible = uploads.filter(upload => status === "all" || (status === "FAILED" ? ["FAILED", "REJECTED"].includes(upload.status) : upload.status === status));
  if (initializing) return <p role="status">Yüklənir…</p>;
  if (!user) return <Link href="/login">Daxil olun</Link>;
  return <main className="omr-workspace mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <Link href="/dashboard/omr" className="text-sm text-[#7A0014]">OMR bölməsinə qayıt</Link>
    <h1 className="text-2xl font-bold">Skan nəticələri və ixrac</h1>
    <p className="text-sm text-slate-500">İcazəniz olan yükləmələr göstərilir. İxrac yalnız təsdiqlənmiş səhifələri daxil edir (maksimum 5000).</p>
    <label className="block space-y-2 text-sm font-medium">İmtahan
      <select value={examId} onChange={e => {
          setExamId(e.target.value);
          setLoading(!!e.target.value);
          setUploads([]);
          setError("");
        }}
        className="block w-full rounded-lg border border-slate-300 bg-white p-3">
        <option value="">İmtahan seçin</option>
        {exams.map(item => <option key={item.id} value={item.id}>{item.code} — {item.title}</option>)}
      </select></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-2 text-sm">Skanın vəziyyəti
        <select value={status} onChange={event => setStatus(event.target.value)} className="block rounded-lg border border-border bg-card px-3">
          <option value="all">Bütün skanlar ({uploads.length})</option><option value="REVIEW">Yoxlanacaq skanlar</option>
          <option value="COMPLETED">Tamamlanan skanlar</option><option value="FAILED">Uğursuz skanlar</option>
        </select>
      </label>
      <button type="button" disabled={!examId || loading} onClick={() => { setLoading(true); setReload(value => value + 1); }} className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-40">{loading ? "Yenilənir…" : "Siyahını yenilə"}</button>
      <Link href={`/dashboard/omr/upload${examId ? `?examId=${examId}` : ""}`} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Yeni kart skan et</Link>
      <Link href="/dashboard/results" className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-primary underline">Nəticələri açıqlamaq</Link>
    </div>
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={() => void download("csv")} disabled={!UUID.test(examId) || busy}
        className="rounded-lg border border-[#7A0014] px-4 py-2 text-sm font-semibold text-[#7A0014] disabled:opacity-40">CSV ixrac et</button>
      <button type="button" onClick={() => void download("xlsx")} disabled={!UUID.test(examId) || busy}
        className="rounded-lg bg-[#7A0014] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Excel (.xlsx) ixrac et</button>
      <button type="button" onClick={() => void download("pdf")} disabled={!UUID.test(examId) || busy}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40">PDF hesabat ixrac et</button>
    </div>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold">Son yükləmələr ({visible.length})</h2>
      {loading ? <p role="status" className="py-4 text-sm text-muted-foreground">Skanlar yüklənir…</p> : visible.length ? visible.map(upload => <div key={upload.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-4">
        <div><p className="text-sm font-medium">{statusNames[upload.status] ?? upload.status} · {upload.pageCount} səhifə</p>
          <p className="text-xs text-slate-500">{new Date(upload.createdAt).toLocaleString("az-AZ")}</p>
          {upload.error && <p className="text-sm text-amber-700">Skan tamamlanmayıb. Səbəbə baxıb yenidən cəhd edin.</p>}
        </div>
        <Link href={`/dashboard/omr/uploads/${upload.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">{upload.status === "REVIEW" ? "Cavabları yoxla" : "Ətraflı bax"}</Link>
      </div>) : <p className="mt-3 text-sm text-slate-500">{examId ? "Bu seçimə uyğun skan yoxdur." : "Skanları görmək üçün imtahan seçin."}</p>}
    </section>
  </main>;
}

export default function OmrResultsPage() {
  return <Suspense fallback={<p role="status">Yüklənir…</p>}><OmrResultsList /></Suspense>;
}
