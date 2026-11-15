"use client";

import Link from "next/link";
import Image from "next/image";
import { OMR_ENABLED } from "@/lib/features";
import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "@/components/session-provider";

type Sheet = { id: string; templateVersion?: string };
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const TEST = OMR_ENABLED;

export default function SheetsPage() {
  const { user, request, downloadPdf } = useSession();
  const [ticketId, setTicketId] = useState("");
  const [answerKeyId, setAnswerKeyId] = useState("");
  const [examId, setExamId] = useState("");
  const [exams, setExams] = useState<Array<{ id: string; code: string; title: string }>>([]);
  const [keys, setKeys] = useState<Array<{ id: string; variant: string; version: number; questionCount: number }>>([]);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    request<typeof exams>("/exams").then(data => { if (active) setExams(data); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "İmtahanlar alınmadı."); });
    return () => { active = false; };
  }, [request, user]);

  useEffect(() => {
    if (!user || !examId) return;
    let active = true;
    request<typeof keys>(`/omr/keys?examId=${examId}`).then(data => { if (active) setKeys(data); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Cavab açarları alınmadı."); });
    return () => { active = false; };
  }, [request, user, examId]);

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSheet(null);

    if (!TEST || !user) return;

    if ((!UUID.test(ticketId) && !/^[0-9]{8}$/.test(ticketId)) || !UUID.test(answerKeyId)) {
      setError("Biletdəki 8 rəqəmli iş nömrəsini (və ya bilet UUID-sini) və düzgün cavab açarı ID-sini daxil edin.");
      return;
    }

    setBusy(true);
    try {
      const result = await request<Sheet>("/omr/sheets", {
        method: "POST",
        body: JSON.stringify({ ...(UUID.test(ticketId) ? { ticketId } : { workNumber: ticketId }), answerKeyId }),
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

      <Link href="/dashboard/omr/templates" className="block rounded-xl border border-primary bg-white p-5 text-primary">
        <span className="font-semibold">Öz cavab kartımı əlavə et</span>
        <span className="mt-2 block text-sm">Hazır kartınız varsa, boş skanını yükləyib model kimi saxlayın. Standart kartdan istifadə etmək məcburi deyil.</span>
      </Link>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Skanın tanıdığı cavab kartı</h2>
        <p className="text-sm text-slate-600">A4 kartda dörd künc nişanı, QR, şagirdin adı, iş nömrəsi, qeydiyyat kodu və bilet nömrəsi olur.
          Hər şagird üçün ayrıca kart yaradın. Nəticə həmin kartın aid olduğu şagirdə bağlanır.</p>
        <a href="/omr/answer-sheet-sample.pdf" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Nümunə PDF-ni aç</a>
        <p className="text-sm text-amber-800">Nümunə imtahan üçün istifadə edilmir. İmtahan kartını aşağıdakı formadan yaradın və A4-də 100% ölçüdə çap edin.</p>
        <Image src="/omr/answer-sheet-sample.png" alt="Tanınan A4 cavab kartı: dörd künc nişanı, QR, ad və qeydiyyat məlumatları, A–E cavab dairələri" width={630} height={891} className="mx-auto h-auto w-full max-w-md rounded border" />
        <p className="text-sm text-slate-600">Bir fotoda bir neçə kart oxunur. Kartların hamısı bütöv görünsün, aralarında boşluq olsun.
          Hər sualda yalnız bir dairəni tam qaralayın. İş nömrəsinin 8 rəqəmini soldan sağa kodlayın: hər sütunda bir dairə.
          Ad və soyad iş nömrəsi və QR uyğunlaşdıqdan sonra biletdən götürülür. Köhnə QR-li kartlar da tanınır.</p>
      </section>

      <form onSubmit={issue}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block space-y-2 text-sm">
          <span>İş nömrəsi və ya bilet UUID</span>
          <input value={ticketId}
            onChange={(e) => { setTicketId(e.target.value.trim()); setSheet(null); }} disabled={busy}
            className="w-full rounded-lg border border-slate-300 p-3"
            required />
        </label>

        <label className="block space-y-2 text-sm">
          <span>İmtahan</span>
          <select value={examId} disabled={busy} onChange={event => {
            setExamId(event.target.value); setAnswerKeyId(""); setKeys([]); setSheet(null); setError("");
          }} className="w-full rounded-lg border border-slate-300 bg-white p-3" required>
            <option value="">İmtahan seçin</option>
            {exams.map(exam => <option key={exam.id} value={exam.id}>{exam.code} — {exam.title}</option>)}
          </select>
        </label>
        <label className="block space-y-2 text-sm">
          <span>Cavab açarı</span>
          <select value={answerKeyId} disabled={busy || !examId} onChange={event => { setAnswerKeyId(event.target.value); setSheet(null); }}
            className="w-full rounded-lg border border-slate-300 bg-white p-3" required>
            <option value="">{examId ? "Cavab açarını seçin" : "Əvvəlcə imtahan seçin"}</option>
            {keys.map(key => <option key={key.id} value={key.id}>Variant {key.variant} · versiya {key.version} · {key.questionCount} sual</option>)}
          </select>
        </label>
        {examId && !keys.length && <p className="text-sm text-slate-500">Bu imtahanın cavab açarı siyahıda yoxdursa, administrator əvvəlcə açarı yaratmalıdır.</p>}

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
