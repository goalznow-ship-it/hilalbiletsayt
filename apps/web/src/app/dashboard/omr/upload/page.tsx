"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "@/components/session-provider";

type Exam = {
  id: string;
  title: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_SIZE = 25 * 1024 * 1024;

// Real upload yalnız ayrıca test worker təsdiqləndikdən
// sonra aktivləşdirilməlidir.
const UPLOAD_ENABLED =
  process.env.NEXT_PUBLIC_OMR_TEST_UPLOAD_ENABLED === "true";

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

export default function OmrUploadPage() {
  const { request, user, initializing } = useSession();

  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastUploadId, setLastUploadId] = useState("");

  useEffect(() => {
    if (initializing) return;

    if (!user) {
      setLoading(false);
      return;
    }

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
    setError("");
    setNotice("");

    if (!UPLOAD_ENABLED) {
      setError("Təhlükəsiz test Worker hələ aktiv deyil.");
      return;
    }

    if (!UUID_RE.test(examId.trim())) {
      setError("Düzgün imtahan ID-si seçin.");
      return;
    }

    if (!file) {
      setError("PDF faylı seçin.");
      return;
    }

    if (
      !file.name.toLowerCase().endsWith(".pdf") ||
      (file.type && file.type !== "application/pdf")
    ) {
      setError("Yalnız PDF faylı yüklənə bilər.");
      return;
    }

    if (file.size === 0 || file.size > MAX_SIZE) {
      setError("PDF faylı boş olmamalı və 25 MB-ı keçməməlidir.");
      return;
    }

    const body = new FormData();

    // Backend FilesInterceptor("files") gözləyir.
    // Əlavə form field göndərmirik.
    body.append("files", file, file.name);

    setUploading(true);

    try {
      const response = await request<unknown>(
        `/omr/exams/${examId.trim()}/uploads`,
        {
          method: "POST",
          body,
        }
      );

      const first = Array.isArray(response) ? response[0] : response;
      setLastUploadId(
        first && typeof first === "object" &&
        "id" in first && typeof first.id === "string"
          ? first.id
          : ""
      );

      setNotice(
        "Fayl API tərəfindən qəbul edildi. " +
        "OMR emalının nəticəsi ayrıca yoxlanmalıdır."
      );
      setFile(null);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Fayl yüklənərkən xəta yarandı."
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">
            OMR / Cavab vərəqləri
          </p>
          <h1 className="text-2xl font-bold text-slate-900">
            Skan yükləmə
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            İmtahanı seçin və cavab vərəqinin PDF faylını əlavə edin.
          </p>
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

        <form onSubmit={handleUpload} className="space-y-5">
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
              onChange={(e) => setExamId(e.target.value)}
              disabled={loading || !user}
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

          <div className="space-y-2">
            <label
              htmlFor="omr-file"
              className="block text-sm font-medium text-slate-700"
            >
              PDF cavab vərəqi
            </label>

            <input
              id="omr-file"
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => {
                setFile(e.currentTarget.files?.[0] ?? null);
                setNotice("");
                setError("");
              }}
              className="block w-full rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:font-medium"
            />

            <p className="text-xs text-slate-500">
              Format: PDF. Maksimum ölçü: 25 MB.
            </p>
          </div>

          {file && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              Seçilmiş fayl: <strong>{file.name}</strong>
            </div>
          )}

          {!UPLOAD_ENABLED && (
            <div
              role="status"
              className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            >
              Test Worker hələ ayrıca qurulmadığı üçün real
              yükləmə təhlükəsizlik məqsədilə deaktivdir.
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
            <p role="status" className="text-sm text-emerald-700">
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
              uploading
            }
            className="rounded-lg bg-[#7A0014] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#59000f] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {uploading ? "Yüklənir..." : "PDF yüklə"}
          </button>
        </form>
      </div>

      {lastUploadId && (
        <Link href={`/dashboard/omr/uploads/${lastUploadId}`}
          className="inline-block text-sm font-semibold text-[#7A0014] underline">
          Yüklənmiş skanın emal statusuna bax
        </Link>
      )}

      <Link
        href="/dashboard/exams"
        className="inline-block text-sm font-medium text-[#7A0014] hover:underline"
      >
        İmtahanlar bölməsinə keç
      </Link>
    </div>
  );
}
