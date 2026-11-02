"use client";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";

type Exam = { id: string; title: string; code: string };
type Upload = { id: string; status: string; createdAt: string; pageCount: number; error: string | null };
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export default function OmrResultsPage() {
  const { user, initializing, request, downloadFile } = useSession();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    request<Exam[]>("/exams").then(data => { if (active) setExams(Array.isArray(data) ? data : []); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "İmtahanlar alınmadı."); });
    return () => { active = false; };
  }, [request, user]);

  useEffect(() => {
    setUploads([]);
    if (!UUID.test(examId) || !user) return;
    let active = true;
    request<Upload[]>(`/omr/exams/${examId}/uploads`).then(data => {
      if (active) setUploads(Array.isArray(data) ? data : []);
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Skanlar alınmadı."); });
    return () => { active = false; };
  }, [examId, user, request]);

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

  const clientReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  if (!clientReady || initializing) return <p role="status">Yüklənir…</p>;
  if (!user) return <Link href="/login">Daxil olun</Link>;
  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <Link href="/dashboard/omr" className="text-sm text-[#7A0014]">OMR bölməsinə qayıt</Link>
    <h1 className="text-2xl font-bold">Skan nəticələri və ixrac</h1>
    <p className="text-sm text-slate-500">İcazəniz olan yükləmələr göstərilir. İxrac yalnız təsdiqlənmiş səhifələri daxil edir (maksimum 5000).</p>
    <label className="block space-y-2 text-sm font-medium">İmtahan
      <select value={examId} onChange={e => { setExamId(e.target.value); setError(""); }}
        className="block w-full rounded-lg border border-slate-300 bg-white p-3">
        <option value="">İmtahan seçin</option>
        {exams.map(item => <option key={item.id} value={item.id}>{item.code} — {item.title}</option>)}
      </select></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={() => void download("csv")} disabled={!UUID.test(examId) || busy}
        className="rounded-lg border border-[#7A0014] px-4 py-2 text-sm font-semibold text-[#7A0014] disabled:opacity-40">CSV ixrac et</button>
      <button type="button" onClick={() => void download("xlsx")} disabled={!UUID.test(examId) || busy}
        className="rounded-lg bg-[#7A0014] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Excel (.xlsx) ixrac et</button>
      <button type="button" onClick={() => void download("pdf")} disabled={!UUID.test(examId) || busy}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40">PDF hesabat ixrac et</button>
    </div>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold">Son yükləmələr ({uploads.length})</h2>
      {uploads.length ? uploads.map(upload => <div key={upload.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-4">
        <div><p className="text-sm font-medium">{upload.status} · {upload.pageCount} səhifə</p>
          <p className="text-xs text-slate-500">{new Date(upload.createdAt).toLocaleString("az-AZ")}</p>
          <p className="break-all text-xs text-slate-500">{upload.id}</p>
          {upload.error && <p className="text-sm text-amber-700">{upload.error}</p>}
        </div>
        <Link href={`/dashboard/omr/uploads/${upload.id}`} className="text-sm font-semibold text-[#7A0014] underline">Ətraflı bax</Link>
      </div>) : <p className="mt-3 text-sm text-slate-500">Yükləmə yoxdur və ya imtahan seçilməyib.</p>}
    </section>
  </main>;
}
