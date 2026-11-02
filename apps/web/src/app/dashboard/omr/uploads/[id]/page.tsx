"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";

type Answer = { question: number; state: string; selected: string | null; marked: string[]; confidence: number };
type PageData = { answers?: Answer[]; choiceCount?: number; reviewFlags?: string[];
  score?: number | null; provisionalScore?: number; maximumScore?: number;
  outcomes?: Array<{ question: number; outcome: string; points: number | null }>;
  manualReview?: { reviewedAt: string; questions: number[] } };
type ScanPage = { id: string; pageIndex: number; sheetId: string | null; status: string; data: PageData };
type Upload = { id: string; status: string; error?: string | null; pages: ScanPage[] };
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const TEST = process.env.NEXT_PUBLIC_OMR_TEST_UPLOAD_ENABLED === "true";

export default function OmrUploadStatus() {
  const { id } = useParams<{ id: string }>();
  const { user, initializing, request, downloadPdf } = useSession();
  const [upload, setUpload] = useState<Upload | null>(null);
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!UUID.test(id) || !user) return;
    setBusy(true); setError("");
    try { setUpload(await request<Upload>(`/omr/uploads/${id}`)); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : "Status alınmadı."); }
    finally { setBusy(false); }
  }, [id, request, user]);

  useEffect(() => {
    if (initializing || !user || !UUID.test(id)) return;

    let active = true;

    request<Upload>(`/omr/uploads/${id}`)
      .then((data) => {
        if (active) setUpload(data);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Status alınmadı."
          );
        }
      });

    return () => {
      active = false;
    };
  }, [id, initializing, request, user]);

  async function originalPdf() {
    if (!UUID.test(id)) return;
    setBusy(true); setError("");
    try {
      const blob = await downloadPdf(`/omr/uploads/${id}/original`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `omr-original-${id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Orijinal PDF alınmadı.");
    } finally { setBusy(false); }
  }

  async function saveReview(page: ScanPage) {
    if (!TEST || !user || !UUID.test(id) || !page.sheetId) return;
    const changesForPage = (page.data.answers ?? []).flatMap(answer => {
      const value = changes[`${page.id}:${answer.question}`];
      if (!value) return [];
      return [{ question: answer.question, selected: value === "BLANK" ? null : value }];
    });
    const note = (notes[page.id] ?? "").trim();
    if (!changesForPage.length || note.length < 5) {
      setError("Ən azı bir düzəliş və minimum 5 simvolluq izah daxil edin."); return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request<{ score: number }>(`/omr/uploads/${id}/pages/${page.id}/review`, {
        method: "PATCH", body: JSON.stringify({ note, changes: changesForPage }),
      });
      setNotice(`Səhifə təsdiqləndi. Bal: ${result.score}`);
      setChanges(previous => Object.fromEntries(Object.entries(previous).filter(([k]) => !k.startsWith(page.id + ":"))));
      await refresh();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Manual təsdiq alınmadı."); }
    finally { setBusy(false); }
  }

  if (initializing) return <p role="status">Yüklənir…</p>;
  if (!user) return <Link href="/login">Daxil olun</Link>;
  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <Link href="/dashboard/omr/results" className="text-sm text-[#7A0014]">Skan siyahısına qayıt</Link>
    <h1 className="text-2xl font-bold">OMR emal və yoxlama</h1>
    <p className="break-all text-xs text-slate-500">Yükləmə: {id}</p>
    <div className="flex items-center gap-4">
      <p className="font-medium">Status: {upload?.status ?? "—"}</p>
      <button type="button" onClick={() => void originalPdf()} disabled={busy}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40">
        Orijinal PDF-i endir və müqayisə et
      </button>
      <button type="button" onClick={() => void refresh()} disabled={busy}
        className="rounded-lg bg-[#7A0014] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        {busy ? "Yoxlanılır..." : "Yenilə"}
      </button>
    </div>
    {upload?.error && <p className="text-sm text-red-700">{upload.error}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
    {(upload?.pages ?? []).map(page => {
      const data = page.data ?? {};
      const options = "ABCDE".slice(0, data.choiceCount ?? 5).split("");
      const canReview = TEST && page.status === "REVIEW" && !!page.sheetId;
      const uncertain = (data.answers ?? []).filter(a => a.state === "UNCERTAIN" || a.state === "MULTIPLE" || a.confidence < .85);
      return <section key={page.id} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Səhifə {page.pageIndex + 1} · {page.status}</h2>
            <p className="text-xs text-slate-500">{page.sheetId ? "QR/bilet identifikatoru uyğunlaşdırılıb" : "Təsdiqlənmiş bilet bağlantısı yoxdur"}</p>
          </div>
          {typeof data.score === "number" && <span className="font-semibold text-[#7A0014]">{data.score} / {data.maximumScore ?? "?"} bal</span>}
        </header>
        {!!data.reviewFlags?.length && <p className="text-sm text-amber-800">Yoxlama səbəbləri: {data.reviewFlags.join(", ")}</p>}
        {page.status === "REVIEW" && !page.sheetId && <p className="text-sm text-red-700">
          QR və bilet məlumatı etibarlı uyğunlaşdırılmadığı üçün cavabları burada təsdiqləmək olmaz. Yenidən skan və şəxsiyyət yoxlaması tələb olunur.
        </p>}
        {data.manualReview && <p className="text-xs text-green-700">Manual yoxlanıb: {data.manualReview.reviewedAt}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="p-2">Sual</th><th className="p-2">Tanınan</th><th className="p-2">Etibar</th>
              <th className="p-2">Yoxlanmış cavab</th><th className="p-2">Nəticə</th>
            </tr></thead>
            <tbody>{(data.answers ?? []).map(answer => {
              const key = `${page.id}:${answer.question}`;
              const flagged = uncertain.some(a => a.question === answer.question);
              const outcome = data.outcomes?.find(a => a.question === answer.question);
              return <tr key={answer.question} className={`border-b border-slate-100 ${flagged ? "bg-amber-50" : ""}`}>
                <td className="p-2 font-medium">{answer.question}</td>
                <td className="p-2">{answer.selected ?? answer.state}</td>
                <td className="p-2">{Math.round(answer.confidence * 100)}%</td>
                <td className="p-2">{canReview ? <select value={changes[key] ?? ""}
                  onChange={e => setChanges(old => ({ ...old, [key]: e.target.value }))}
                  aria-label={`Sual ${answer.question} düzəlişi`}
                  className="w-full rounded border border-slate-300 bg-white p-2">
                  <option value="">Dəyişmə</option>
                  <option value="BLANK">Boş</option>
                  {options.map(value => <option key={value} value={value}>{value}</option>)}
                </select> : (answer.selected ?? "—")}</td>
                <td className="p-2">{outcome ? `${outcome.outcome} (${outcome.points ?? "?"})` : "—"}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {canReview && <div className="space-y-3 border-t border-slate-200 pt-4">
          <p className="text-sm text-amber-800">
            Qeyri-müəyyən bütün cavabları düzəldin ({uncertain.length} ədəd). Təsdiq nəticəni və audit qeydini saxlayır; geri dönüş yoxdur.
          </p>
          <label className="block space-y-2 text-sm">Manual yoxlamanın səbəbi
            <textarea value={notes[page.id] ?? ""} onChange={e => setNotes(old => ({ ...old, [page.id]: e.target.value }))}
              maxLength={500} rows={3} className="block w-full rounded-lg border border-slate-300 p-3" />
          </label>
          <button type="button" onClick={() => void saveReview(page)} disabled={busy}
            className="rounded-lg bg-[#7A0014] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">
            Manual düzəlişi təsdiqlə və balı yenidən hesabla
          </button>
        </div>}
      </section>;
    })}
  </main>;
}
