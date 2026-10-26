"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import QRCode from "react-qr-code";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { publicRequest, sessionDate } from "@/lib/public-sales";
import { formatAzn } from "@/lib/money";

type Ticket = {
  code: string;
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
  branch: { name: string; address: string | null; phone: string | null } | null;
  candidate: { full_name: string } | null;
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
          <Card className="print-ticket public-ticket">
            <div className="flex items-center gap-4">
              <Image
                src="/branding/hilal-logo.png"
                alt="Hilal"
                width={52}
                height={52}
              />
              <h1>Hilal Bilet</h1>
            </div>
            <h2>{ticket.exam.title}</h2>
            <p>{ticket.exam.code}</p>
            <dl>
              <dt>Bilet kodu</dt>
              <dd>{ticket.code}</dd>
              <dt>Namizəd</dt>
              <dd>{ticket.candidate?.full_name}</dd>
              <dt>Sessiya</dt>
              <dd>{ticket.session?.sessionCode}</dd>
              <dt>Tarix və saat (Bakı)</dt>
              <dd>
                {ticket.session ? sessionDate(ticket.session.startsAt) : "—"}
              </dd>
              <dt>İmtahan yeri</dt>
              <dd>{ticket.session?.venue || "Filialla dəqiqləşdirin"}</dd>
              <dt>Qiymət</dt>
              <dd>{formatAzn(ticket.price)}</dd>
              <dt>Bilet statusu</dt>
              <dd>
                {(
                  {
                    ACTIVE: "Aktiv",
                    USED: "İstifadə edilib",
                    CANCELLED: "Ləğv edilib",
                  } as Record<string, string>
                )[ticket.status] ?? ticket.status}
              </dd>
              <dt>Ödəniş</dt>
              <dd>
                {ticket.paymentStatus === "PAID"
                  ? "Ödənilib"
                  : ticket.paymentStatus === "REFUNDED"
                    ? "Geri qaytarılıb"
                    : "Ödəniş gözlənilir"}
              </dd>
              <dt>Ödəniş filialı</dt>
              <dd>
                {ticket.branch?.name}
                <br />
                {ticket.branch?.address}
                <br />
                {ticket.branch?.phone}
              </dd>
            </dl>
            <div className="public-qr">
              {origin && (
                <QRCode
                  value={`${origin}/tickets/verify/${ticket.qrCode}`}
                  size={164}
                />
              )}
              <Link href={`/tickets/verify/${ticket.qrCode}`}>
                Biletin həqiqiliyini yoxla
              </Link>
            </div>
            {ticket.paymentStatus === "PENDING" && (
              <p className="public-notice">
                Ödəniş təsdiqlənməyib. Bilet kodunu seçdiyiniz filialın
                kassasına təqdim edib nağd ödəniş edin. Onlayn ödəniş mövcud
                deyil.
              </p>
            )}
          </Card>
        </>
      )}
    </main>
  );
}
