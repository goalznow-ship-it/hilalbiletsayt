"use client";

import Image from "next/image";
import Link from "next/link";
import QRCode from "react-qr-code";
import { formatAzn } from "@/lib/money";
import { sessionDate } from "@/lib/public-sales";

export type ExamTicketData = {
  code: string; workNumber?: string; price: number; status: string; paymentStatus: string;
  examCode: string; examTitle: string; candidateNumber: string | null; candidateFullName: string | null;
  sessionCode: string | null; sessionStartsAt?: string | null; sessionVenue?: string | null;
  branchName: string | null; branchCode?: string | null; branchAddress?: string | null; branchPhone?: string | null;
  registeredAt?: string; usedAt?: string | null; paymentMethod?: string | null;
};

const statuses: Record<string, string> = { ACTIVE: "Aktiv bilet", USED: "İstifadə edilib", CANCELLED: "Ləğv edilib" };
const payments: Record<string, string> = { PENDING: "Ödəniş gözlənilir", PAID: "Ödənilib", REFUNDED: "Geri qaytarılıb" };
const methods: Record<string, string> = { CASH: "Nağd", CARD: "Kart", BANK_TRANSFER: "Bank köçürməsi" };

export function ExamTicket({ ticket, verifyUrl }: { ticket: ExamTicketData; verifyUrl: string }) {
  return <article className="print-ticket exam-ticket" aria-label="İmtahan bileti">
    <header className="exam-ticket-header">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-white p-2"><Image src="/branding/hilal-logo.png" alt="Hilal Kursları" width={44} height={44} /></div>
        <div><p className="text-lg font-semibold tracking-wide">HİLAL BİLET</p><p className="mt-1 text-xs opacity-80">İmtahana giriş bileti</p></div>
      </div>
      <span className="rounded-full border border-current/30 px-3 py-1.5 text-xs font-medium">{statuses[ticket.status] ?? ticket.status}</span>
    </header>
    <div className="exam-ticket-body">
      <div className="exam-ticket-heading">
        <div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wider text-primary">{ticket.examCode}</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{ticket.examTitle}</h1>
        </div>
        <div className="exam-ticket-number"><p className="text-xs font-medium text-muted-foreground">İş nömrəsi</p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-wider">{ticket.workNumber ?? "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Cavab kartında bu nömrəni kodlayın</p>
        </div>
      </div>
      <div className="mt-6 border-y border-border py-5"><p className="text-xs text-muted-foreground">Şagirdin adı və soyadı</p>
        <p className="mt-1 break-words text-xl font-semibold">{ticket.candidateFullName ?? "—"}</p>
      </div>
      <dl className="exam-ticket-fields">
        <div><dt>Tarix və saat · Bakı</dt><dd>{ticket.sessionStartsAt ? sessionDate(ticket.sessionStartsAt) : "Filialla dəqiqləşdirin"}</dd></div>
        <div><dt>Sessiya</dt><dd>{ticket.sessionCode ?? "—"}</dd></div>
        <div className="sm:col-span-2"><dt>İmtahanın keçiriləcəyi yer</dt><dd>{ticket.sessionVenue || "Filialla dəqiqləşdirin"}</dd></div>
        <div><dt>Qeydiyyat kodu · nəticələr üçün</dt><dd className="font-mono">{ticket.candidateNumber ?? "—"}</dd></div>
        <div><dt>Bilet kodu</dt><dd className="font-mono text-xs">{ticket.code}</dd></div>
      </dl>
      <section className="exam-ticket-branch" aria-label="Filial məlumatları">
        <p className="text-xs text-muted-foreground">Satış / ödəniş filialı</p>
        <p className="mt-1 font-semibold">{ticket.branchName ?? "—"}{ticket.branchCode && <span className="ml-2 rounded border border-border bg-white px-2 py-0.5 font-mono text-xs">{ticket.branchCode}</span>}</p>
        {ticket.branchAddress && <p className="mt-2 text-sm">{ticket.branchAddress}</p>}
        {ticket.branchPhone && <a href={`tel:${ticket.branchPhone.replace(/[^+0-9]/g, "")}`} className="mt-2 inline-block text-sm font-medium underline">{ticket.branchPhone}</a>}
      </section>
    </div>
    <footer className="exam-ticket-footer">
      <div className="min-w-0 flex-1 space-y-3">
        <div><p className="text-xs text-muted-foreground">Biletin qiyməti</p><p className="mt-1 text-2xl font-semibold">{formatAzn(ticket.price)}</p></div>
        <p className={`text-sm font-semibold ${ticket.paymentStatus === "PAID" ? "text-green-800" : "text-amber-800"}`}>
          {payments[ticket.paymentStatus] ?? ticket.paymentStatus}{ticket.paymentMethod && ` · ${methods[ticket.paymentMethod] ?? ticket.paymentMethod}`}
        </p>
        {ticket.paymentStatus === "PENDING" && <p className="text-xs leading-relaxed text-muted-foreground">Ödənişi filialın kassasında təsdiqlədin. Onlayn ödəniş mövcud deyil.</p>}
        {ticket.registeredAt && <p className="text-xs text-muted-foreground">Satış: {sessionDate(ticket.registeredAt)}</p>}
        {ticket.usedAt && <p className="text-xs text-muted-foreground">İstifadə: {sessionDate(ticket.usedAt)}</p>}
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">Bilet yalnız göstərilən şagird üçündür. Bileti və qeydiyyat kodunu məxfi saxlayın.</p>
      </div>
      <div className="exam-ticket-qr">{verifyUrl ? <>
        <QRCode value={verifyUrl} size={128} bgColor="#ffffff" fgColor="#000000" />
        <Link href={verifyUrl} className="mt-2 block max-w-32 text-center text-[10px] leading-relaxed underline">Biletin həqiqiliyini yoxla</Link>
      </> : <p className="text-xs text-muted-foreground">QR yoxdur</p>}</div>
    </footer>
  </article>;
}
