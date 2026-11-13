"use client";

import Link from "next/link";
import Image from "next/image";
import { OMR_ENABLED } from "@/lib/features";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/components/session-provider";
import { OmrCamera, type CaptureSource } from "@/components/omr-camera";
import { prepareOmrFile, omrUploadFeedback } from "@/lib/omr-scan";

type Exam = {
  id: string;
  title: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Real upload yalnız ayrıca test worker təsdiqləndikdən
// sonra aktivləşdirilməlidir.
const UPLOAD_ENABLED = OMR_ENABLED;

function parseExams(payload: unknown): Exam[] {
  let items: unknown = payload;

  if (!Array.isArray(items) && payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    items = obj.items ?? obj.data ?? obj.exams ?? [];
  }

  if (!Array.isArray(items)) return [];

  return items.flatMap((item): Exam[] => {
    if (!item || typeof item !== "object") return [];

    const obj = item as Record<string, unknown>;
    if (typeof obj.id !== "string") return [];

    const name =
      typeof obj.name === "string" ? obj.name :
      typeof obj.title === "string" ? obj.title :
      obj.id;

    const code =
      typeof obj.code === "string" ? obj.code : "";

    return [{
      id: obj.id,
      title: code ? `${code} — ${name}` : name,
    }];
  });
}

function OmrUploadForm() {
  const { request, user, initializing } = useSession();
  const params = useSearchParams();

  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState(() => UUID_RE.test(params.get("examId") ?? "") ? params.get("examId")! : "");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastUploadId, setLastUploadId] = useState("");
  const [noticeKind, setNoticeKind] = useState("pending");
  const [preview, setPreview] = useState("");
  const previewUrl = useRef("");
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const autoSubmit = useRef(false);
  const [resumeCamera, setResumeCamera] = useState(false);
  const [processed, setProcessed] = useState(0);
  const processedIds = useRef(new Set<string>());

  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  function selectFile(next: File | null, source: CaptureSource = "manual") {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = next && /\.(jpe?g|png)$/i.test(next.name) ? URL.createObjectURL(next) : "";
    setPreview(previewUrl.current);
    autoSubmit.current = source === "auto";
    setFile(next); setNotice(""); setError(""); setLastUploadId("");
  }

  // Hands-free phone capture goes straight to recognition once an exam is chosen.
  useEffect(() => {
    if (!autoSubmit.current || !file || !examId || uploading) return;
    autoSubmit.current = false;
    formRef.current?.requestSubmit();
  }, [file, examId, uploading]);

  useEffect(() => {
    if (initializing) return;

    if (!user) return;

    let active = true;

    request<unknown>("/exams")
      .then((data) => {
        if (active) setExams(parseExams(data));
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "İmtahanlar yüklənmədi."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [initializing, user, request]);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    setNotice("");

    if (!UPLOAD_ENABLED) {
      setError("OMR bu saytda deaktivdir. Administratora müraciət edin.");
      return;
    }

    if (!UUID_RE.test(examId.trim())) {
      setError("Düzgün imtahan ID-si seçin.");
      return;
    }

    if (!file) {
      setError("Cavab kartını çəkin və ya PDF/şəkil seçin.");
      return;
    }
    submitting.current = true;
    setUploading(true);
    setLastUploadId("");

    try {
      const prepared = await prepareOmrFile(file);
      const body = new FormData();
      // Backend FilesInterceptor("files") gözləyir.
      // Əlavə form field göndərmirik.
      body.append("files", prepared, prepared.name);
      const response = await request<unknown>(
        `/omr/exams/${examId.trim()}/uploads`,
        {
          method: "POST",
          body,
        }
      );

      const first = Array.isArray(response) ? response[0] : response;
      if (!first || typeof first !== "object" || !("id" in first) ||
          typeof first.id !== "string" || !UUID_RE.test(first.id) ||
          !("status" in first) || typeof first.status !== "string")
        throw new Error("Skanın cavabı təsdiqlənmədi. Skan siyahısından statusu yoxlayın.");
      const restricted = "detailsRestricted" in first && first.detailsRestricted === true;
      setLastUploadId(restricted ? "" : first.id);
      const feedback = omrUploadFeedback(first.status);
      setNoticeKind(feedback.kind);
      if (feedback.kind === "error") setError(feedback.message);
      else if (restricted && first.status === "REVIEW") {
        setNotice("reviewReason" in first && first.reviewReason === "SHEET_ALREADY_PROCESSED"
          ? "Bu cavab kartı artıq emal edilib. Təkrar skan əvvəlki nəticəni dəyişmir."
          : "Kartın QR və filial əlaqəsi təsdiqlənmədi. QR və dörd künc tam görünəcək şəkildə yenidən çəkin. Detalları mərkəzi administrator yoxlaya bilər.");
      } else setNotice(restricted && feedback.kind === "pending"
        ? "Skan hələ emal olunur. Bir qədər sonra eyni faylla yenidən yoxlayın."
        : feedback.message);
      if ((feedback.kind === "success" || feedback.kind === "review") && !processedIds.current.has(first.id)) {
        processedIds.current.add(first.id);
        setProcessed(processedIds.current.size);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Fayl yüklənərkən xəta yarandı."
      );
    } finally {
      submitting.current = false;
      setUploading(false);
    }
  }

  return (
    <div className="omr-workspace mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">
            OMR / Cavab vərəqləri
          </p>
          <h1 className="text-2xl font-bold text-slate-900">
            Skan yükləmə
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            İmtahanı seçin, cavab kartını telefonla çəkin və ya PDF/şəkil yükləyin.
          </p>
          {processed > 0 && <p className="mt-2 text-sm font-medium text-primary">Bu sessiyada {processed} skan emal edilib.</p>}
        </div>

        <Link
          href="/dashboard/omr"
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Geri qayıt
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="mb-5 text-lg font-semibold text-slate-900">
          Cavab vərəqinin yüklənməsi
        </h2>

        <form ref={formRef} onSubmit={handleUpload} className="space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="omr-exam"
              className="block text-sm font-medium text-slate-700"
            >
              İmtahan
            </label>

            <select
              id="omr-exam"
              value={examId}
              onChange={(e) => { setExamId(e.target.value); selectFile(null); setResumeCamera(false); processedIds.current.clear(); setProcessed(0); }}
              disabled={loading || !user || uploading}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-[#7A0014]"
            >
              <option value="">
                {loading ? "Yüklənir..." : "İmtahan seçin"}
              </option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.title}
                </option>
              ))}
            </select>

            {!loading && exams.length === 0 && (
              <p className="text-xs text-slate-500">
                İmtahan siyahısı boşdur və ya bu hesab üçün əlçatan deyil.
              </p>
            )}
          </div>

          {!examId && <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Başlamaq üçün imtahanı seçin. Kamera və fayl yükləmə bundan sonra açılacaq.</p>}
          {UPLOAD_ENABLED && user && examId && !uploading && !file && <OmrCamera key={examId} autoStart={resumeCamera} onCapture={(next, source) => selectFile(next, source)} />}

          <div className="space-y-2">
            <label
              htmlFor="omr-file"
              className="block text-sm font-medium text-slate-700"
            >
              Cavab vərəqi (PDF, JPEG, PNG)
            </label>

            <input
              id="omr-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              disabled={uploading || !user || !UPLOAD_ENABLED || !examId}
              onChange={(e) => {
                const next = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (next) selectFile(next);
              }}
              className="block w-full rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:font-medium"
            />

            <p className="text-xs text-slate-500">
              PDF, JPEG və PNG: maksimum 25 MB. Böyük telefon şəkilləri avtomatik kiçildilir. Yalnız sistemdə yaradılmış QR-li cavab kartları tanınır.
            </p>
          </div>

          {file && (
            <div className="space-y-3 break-words rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              Seçilmiş fayl: <strong>{file.name}</strong>
              {preview && <Image src={preview} alt="Çəkilmiş cavab kartı" width={1260} height={1782} unoptimized
                className="max-h-[60vh] w-full rounded border border-slate-200 object-contain" />}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setResumeCamera(false); selectFile(null); }} disabled={uploading}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-3 disabled:opacity-40">Yeni kart</button>
                <button type="button" onClick={() => { setResumeCamera(true); selectFile(null); }} disabled={uploading}
                  className="rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-40">
                  {noticeKind === "success" && lastUploadId ? "Növbəti kartı skan et" : "Kamera ilə yenidən çək"}
                </button>
              </div>
            </div>
          )}

          {!UPLOAD_ENABLED && (
            <div
              role="status"
              className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            >
              OMR bu saytda deaktivdir. Aktivləşdirmək üçün administratora müraciət edin.
            </div>
          )}

          {!initializing && !user && (
            <p className="text-sm text-amber-800">
              Davam etmək üçün hesabınıza daxil olun.
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          {notice && (
            <p role="status" className={`text-sm ${noticeKind === "success" ? "text-emerald-700" : "text-amber-800"}`}>
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={
              !UPLOAD_ENABLED ||
              !user ||
              !examId ||
              !file ||
              uploading || (noticeKind === "success" || noticeKind === "review") && !!notice
            }
            className="rounded-lg bg-[#7A0014] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#59000f] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {uploading ? "Skan emal olunur…" : "Skan et"}
          </button>
          {uploading && <p role="status" className="text-sm text-slate-600">Fayl yüklənir və cavablar tanınır. Bu, 2 dəqiqəyə qədər çəkə bilər; səhifəni açıq saxlayın.</p>}
        </form>
      </div>

      {lastUploadId && (
        <Link href={`/dashboard/omr/uploads/${lastUploadId}`}
          className="inline-block text-sm font-semibold text-[#7A0014] underline">
          Yüklənmiş skanın emal statusuna bax
        </Link>
      )}

      <Link
        href={`/dashboard/omr/results${examId ? `?examId=${examId}` : ""}`}
        className="inline-block text-sm font-medium text-[#7A0014] hover:underline"
      >
        Skan siyahısına və nəticələrə bax
      </Link>
    </div>
  );
}

export default function OmrUploadPage() {
  return <Suspense fallback={<p role="status">Yüklənir…</p>}><OmrUploadForm /></Suspense>;
}
