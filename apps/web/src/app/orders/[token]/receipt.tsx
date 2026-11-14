"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ExamTicket } from "@/components/exam-ticket";
import { publicRequest } from "@/lib/public-sales";

type Ticket = {
  code: string;
  workNumber: string;
  price: number;
  status: string;
  paymentStatus: string;
  qrCode: string;
  exam: { title: string; code: string };
  session: {
    startsAt: string;
    endsAt: string;
    sessionCode: string;
    venue: string | null;
  } | null;
  branch: { name: string; code: string; address: string | null; phone: string | null } | null;
  candidate: { full_name: string; candidate_number: string } | null;
};
export default function Receipt({ token }: { token: string }) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    let active = true;
    publicRequest<Ticket>(`/orders/${encodeURIComponent(token)}`)
      .then((data) => {
        if (active) {
          setTicket(data);
          setOrigin(window.location.origin);
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [token]);
  return (
    <main className="public-main public-receipt">
      <div className="print-hidden mb-6 flex flex-wrap justify-between gap-4">
        <Link href="/">İmtahanlara qayıt</Link>
        {ticket && (
          <Button onClick={() => window.print()}>Çap et / PDF saxla</Button>
        )}
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : !ticket ? (
        <p role="status">Bilet yüklənir…</p>
      ) : (
        <>
          <p className="print-hidden public-notice">
            Bilet sifarişiniz qeydə alınıb. Bu səhifənin şəxsi keçidini
            saxlayın; həmin keçidlə biletə yenidən baxa bilərsiniz.
          </p>
          <ExamTicket ticket={{ ...ticket,
            examCode: ticket.exam.code, examTitle: ticket.exam.title,
            sessionCode: ticket.session?.sessionCode ?? null, sessionStartsAt: ticket.session?.startsAt,
            sessionVenue: ticket.session?.venue, candidateFullName: ticket.candidate?.full_name ?? null,
            candidateNumber: ticket.candidate?.candidate_number ?? null, branchName: ticket.branch?.name ?? null,
            branchCode: ticket.branch?.code, branchAddress: ticket.branch?.address, branchPhone: ticket.branch?.phone,
          }} verifyUrl={origin ? `${origin}/tickets/verify/${ticket.qrCode}` : ""} />
        </>
      )}
    </main>
  );
}
