"use client";

import Link from "next/link";
import { OMR_ENABLED } from "@/lib/features";
import { useState, type FormEvent } from "react";
import { useSession } from "@/components/session-provider";

type Sheet = { id: string; templateVersion?: string };
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const TEST = OMR_ENABLED;

export default function SheetsPage() {
  const { user, request, downloadPdf } = useSession();
  const [ticketId, setTicketId] = useState("");
  const [answerKeyId, setAnswerKeyId] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSheet(null);

    if (!TEST || !user) return;

    if (!UUID.test(ticketId) || !UUID.test(answerKeyId)) {
      setError("Düzgün bilet və cavab açarı UUID-ləri daxil edin.");
      return;
    }

    setBusy(true);
    try {
      const result = await request<Sheet>("/omr/sheets", {
        method: "POST",
        body: JSON.stringify({ ticketId, answerKeyId }),
      });
      if (!result || !UUID.test(result.id))
        throw new Error("Server düzgün vərəq ID-si qaytarmadı.");
      setSheet(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Vərəq yaradılmadı.");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!sheet) return;
    setBusy(true);
    setError("");

    try {
      const blob = await downloadPdf(`/omr/sheets/${sheet.id}/pdf`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `hilal-omr-${sheet.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "PDF endirilmədi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <Link href="/dashboard/omr" className="text-sm text-[#7A0014]">
        OMR bölməsinə qayıt
      </Link>

      <h1 className="text-2xl font-bold">Cavab vərəqi yarat</h1>

      <form onSubmit={issue}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block space-y-2 text-sm">
          <span>Bilet UUID</span>
          <input value={ticketId}
            onChange={(e) => setTicketId(e.target.value.trim())}
            className="w-full rounded-lg border border-slate-300 p-3"
            required />
        </label>

        <label className="block space-y-2 text-sm">
          <span>Cavab açarı UUID</span>
          <input value={answerKeyId}
            onChange={(e) => setAnswerKeyId(e.target.value.trim())}
            className="w-full rounded-lg border border-slate-300 p-3"
            required />
        </label>

        {!TEST && (
          <p className="text-sm text-amber-700">
            Əməliyyat yalnız test mühitində aktivdir.
          </p>
        )}

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

        <button type="submit" disabled={!TEST || !user || busy}
          className="rounded-lg bg-[#7A0014] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">
          {busy ? "İcra olunur..." : "Vərəq yarat"}
        </button>
      </form>

      {sheet && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
          <p className="font-semibold">Vərəq yaradıldı</p>
          <p className="break-all text-sm">ID: {sheet.id}</p>
          <p className="text-sm">Şablon: {sheet.templateVersion ?? "Naməlum"}</p>
          <button type="button" disabled={busy}
            onClick={() => void download()}
            className="rounded-lg border border-[#7A0014] px-5 py-3 text-sm font-semibold text-[#7A0014] disabled:opacity-40">
            PDF endir
          </button>
        </section>
      )}
    </main>
  );
}
