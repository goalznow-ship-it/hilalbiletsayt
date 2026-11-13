"use client";
import Link from "next/link";
import Image from "next/image";
import { OMR_ENABLED } from "@/lib/features";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";

type Answer = { question: number; state: string; selected: string | null; marked: string[]; confidence: number };
type PageData = { answers?: Answer[]; choiceCount?: number; reviewFlags?: string[];
  recognizedAnswers?: Answer[];
  score?: number | null; provisionalScore?: number; maximumScore?: number;
  outcomes?: Array<{ question: number; outcome: string; points: number | null }>;
  manualReview?: { reviewedAt: string; questions: number[] } };
type ScanPage = { id: string; pageIndex: number; sheetId: string | null; status: string; data: PageData };
type Upload = { id: string; status: string; mime: string; error?: string | null; pages: ScanPage[] };
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const TEST = OMR_ENABLED;
const statuses: Record<string, string> = { COMPLETED: "Tamamlandı", REVIEW: "Yoxlama gözləyir", DUPLICATE: "Təkrar skan",
  PENDING: "Növbədə", PROCESSING: "Emal olunur", FAILED: "Emal alınmadı", REJECTED: "Fayl oxunmadı" };
const reviewReasons: Record<string, string> = {
  UNCERTAIN: "Bəzi işarələr aydın deyil.", LOW_CONFIDENCE: "Bəzi cavablar əminliklə oxunmayıb.",
  MULTIPLE: "Bir sualda birdən çox variant işarələnib.", ALL_BLANK: "Vərəqdə işarələnmiş cavab tapılmayıb.",
  IMAGE_BLURRED: "Şəkil bulanıqdır; aydın foto ilə yenidən skan etmək məsləhətdir.",
  ALIGNMENT_MARKERS_MISSING_OR_DUPLICATED: "Dörd künc nişanı tam görünmür. Vərəqi yenidən çəkin.",
  PAGE_CROPPED: "Vərəqin kənarları kəsilib. Bütün vərəqi göstərin.",
  IDENTIFIER_REQUIRED: "QR kod oxunmayıb. QR aydın görünəcək şəkildə yenidən çəkin.",
  IDENTITY_NOT_AUTHORIZED_FOR_EXAM: "QR kod bu imtahan və filial üçün təsdiqlənməyib.",
  TICKET_IDENTITY_OR_STATUS_CHANGED: "Biletin namizəd və ya ödəniş məlumatlarını administrator yoxlamalıdır.",
  TEMPLATE_KEY_MISMATCH: "Vərəqin sual sayı və cavab açarı uyğun deyil.",
  RECOGNITION_REVIEW: "Skan orijinal vərəqlə müqayisə olunmalıdır.",
};

export default function OmrUploadStatus() {
  const { id } = useParams<{ id: string }>();
  const { user, initializing, request, downloadFile } = useSession();
  const [upload, setUpload] = useState<Upload | null>(null);
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [onlyUncertain, setOnlyUncertain] = useState(false);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function showOriginal() {
    if (preview) { setPreview(""); return; }
    if (!upload || !["image/jpeg", "image/png"].includes(upload.mime)) return;
    setBusy(true); setError("");
    try { setPreview(URL.createObjectURL(await downloadFile(`/omr/uploads/${id}/original`, upload.mime))); }
    catch (err) { setError(err instanceof Error ? err.message : "Şəkil açılmadı."); }
    finally { setBusy(false); }
  }

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

  async function originalScan() {
    if (!UUID.test(id) || !upload) return;
    setBusy(true); setError("");
    try {
      const extension = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" }[upload.mime];
      if (!extension) throw new Error("Skanın formatı dəstəklənmir.");
      const blob = await downloadFile(`/omr/uploads/${id}/original`, upload.mime);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `omr-original-${id}.${extension}`;
      document.body.appendChild(anchor);
      anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Orijinal skan alınmadı.");
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
    if (note.length < 5) {
      setError("Yoxlamanın səbəbini minimum 5 simvolla yazın."); return;
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
  return <main className="omr-workspace mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <Link href="/dashboard/omr/results" className="text-sm text-[#7A0014]">Skan siyahısına qayıt</Link>
    <h1 className="text-2xl font-bold">OMR emal və yoxlama</h1>
    <p className="break-all text-xs text-slate-500">Yükləmə: {id}</p>
    <div className="flex flex-wrap items-center gap-4">
      <p className="font-medium">Status: {upload ? statuses[upload.status] ?? upload.status : "—"}</p>
      {upload && ["image/jpeg", "image/png"].includes(upload.mime) && <button type="button" onClick={() => void showOriginal()} disabled={busy}
        className="rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary disabled:opacity-40">
        {preview ? "Şəkli gizlət" : "Orijinal şəkli aç"}
      </button>}
      <button type="button" onClick={() => void originalScan()} disabled={busy || !upload}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40">
        Orijinal skanı endir və müqayisə et
      </button>
      <button type="button" onClick={() => void refresh()} disabled={busy}
        className="rounded-lg bg-[#7A0014] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        {busy ? "Yoxlanılır..." : "Yenilə"}
      </button>
    </div>
    {upload?.error && <p className="text-sm text-red-700">{upload.error}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
    {preview && <figure className="rounded-xl border border-border bg-card p-3">
      <figcaption className="mb-3 text-sm font-medium">Orijinal cavab vərəqi — aşağıdakı cavablarla müqayisə edin</figcaption>
      <a href={preview} target="_blank" rel="noopener noreferrer" aria-label="Orijinal şəkli tam ölçüdə aç">
        <Image src={preview} alt="Orijinal cavab vərəqi" width={1260} height={1782} unoptimized className="max-h-[70dvh] w-full object-contain" />
      </a>
    </figure>}
    <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" checked={onlyUncertain}
      onChange={event => setOnlyUncertain(event.target.checked)} className="size-5 accent-primary" />Yalnız şübhəli cavabları göstər</label>
    {(upload?.pages ?? []).map(page => {
      const data = page.data ?? {};
      const options = "ABCDE".slice(0, data.choiceCount ?? 5).split("");
      const canReview = TEST && page.status === "REVIEW" && !!page.sheetId;
      const uncertain = (data.answers ?? []).filter(a => a.state === "UNCERTAIN" || a.state === "MULTIPLE" || a.confidence < .85);
      const remaining = uncertain.filter(answer => !changes[`${page.id}:${answer.question}`]).length;
      const displayed = onlyUncertain ? uncertain : data.answers ?? [];
      return <section key={page.id} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Səhifə {page.pageIndex + 1} · {statuses[page.status] ?? page.status}</h2>
            <p className="text-xs text-slate-500">{page.sheetId ? "QR/bilet identifikatoru uyğunlaşdırılıb" : "Təsdiqlənmiş bilet bağlantısı yoxdur"}</p>
          </div>
          {typeof data.score === "number" && <span className="font-semibold text-[#7A0014]">{data.score} / {data.maximumScore ?? "?"} bal</span>}
        </header>
        {!!data.reviewFlags?.length && <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
          {data.reviewFlags.map(flag => <li key={flag}>{reviewReasons[flag] ?? "Skan orijinal vərəqlə müqayisə olunmalıdır."}</li>)}
        </ul>}
        {page.status === "REVIEW" && !page.sheetId && <p className="text-sm text-red-700">
          QR və bilet məlumatı etibarlı uyğunlaşdırılmadığı üçün cavabları burada təsdiqləmək olmaz. Yenidən skan və şəxsiyyət yoxlaması tələb olunur.
        </p>}
        {data.manualReview && <p className="text-xs text-green-700">Manual yoxlanıb: {data.manualReview.reviewedAt}</p>}
        <div className="overflow-x-auto">
          <table className="omr-review-table w-full text-left text-sm">
            <caption className="sr-only">Səhifə {page.pageIndex + 1} cavablarının yoxlanması</caption>
            <thead><tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="p-2">Sual</th><th className="p-2">Tanınan</th><th className="p-2">Etibar</th>
              <th className="p-2">Yoxlanmış cavab</th><th className="p-2">Nəticə</th>
            </tr></thead>
            <tbody>{displayed.map(answer => {
              const key = `${page.id}:${answer.question}`;
              const flagged = uncertain.some(a => a.question === answer.question);
              const outcome = data.outcomes?.find(a => a.question === answer.question);
              const original = data.recognizedAnswers?.find(a => a.question === answer.question) ?? answer;
              return <tr key={answer.question} className={`border-b border-slate-100 ${flagged ? "bg-amber-50" : ""}`}>
                <td data-label="Sual" className="p-2 font-medium">{answer.question}</td>
                <td data-label="Tanınan" className="p-2">{original.selected ?? (original.marked.length ? original.marked.join(", ") : "Boş")}</td>
                <td data-label="Etibar" className="p-2">{Math.round(original.confidence * 100)}%</td>
                <td data-label="Yoxlanmış cavab" className="p-2">{canReview ? <select value={changes[key] ?? ""}
                  onChange={e => setChanges(old => ({ ...old, [key]: e.target.value }))}
                  aria-label={`Sual ${answer.question} düzəlişi`}
                  className="w-full rounded border border-slate-300 bg-white p-2">
                  <option value="">Dəyişmə</option>
                  <option value="BLANK">Boş</option>
                  {options.map(value => <option key={value} value={value}>{value}</option>)}
                </select> : (answer.selected ?? "—")}</td>
                <td data-label="Nəticə" className="p-2">{outcome ? `${({ CORRECT: "Düzgün", WRONG: "Səhv", BLANK: "Boş", MULTIPLE: "Çoxlu işarə", UNCERTAIN: "Şübhəli" } as Record<string, string>)[outcome.outcome] ?? outcome.outcome} (${outcome.points ?? "?"})` : "—"}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {onlyUncertain && !uncertain.length && <p className="text-sm text-muted-foreground">Şübhəli cavab yoxdur. Bütün cavablara baxmaq üçün süzgəci söndürün.</p>}
        {canReview && <div className="space-y-3 border-t border-slate-200 pt-4">
          <p className="text-sm text-amber-800">
            {remaining ? `${remaining} şübhəli cavab qalıb. Hər birini orijinal vərəqlə yoxlayıb düzgün seçimi qeyd edin.` : "Şübhəli cavab qalmayıb. Vərəqlə müqayisəni tamamlayıb təsdiqləyin."}
            {" "}Təsdiq nəticəni və yoxlama tarixçəsini saxlayır.
          </p>
          <label className="block space-y-2 text-sm">Manual yoxlamanın səbəbi
            <textarea value={notes[page.id] ?? ""} onChange={e => setNotes(old => ({ ...old, [page.id]: e.target.value }))}
              maxLength={500} rows={3} className="block w-full rounded-lg border border-slate-300 p-3" />
          </label>
          <button type="button" onClick={() => void saveReview(page)} disabled={busy || remaining > 0 || (notes[page.id] ?? "").trim().length < 5}
            className="rounded-lg bg-[#7A0014] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">
            Manual düzəlişi təsdiqlə və balı yenidən hesabla
          </button>
        </div>}
      </section>;
    })}
    <Link href="/dashboard/results" className="inline-flex min-h-11 items-center font-medium text-primary underline">Nəticələrin dərcinə keç</Link>
  </main>;
}
