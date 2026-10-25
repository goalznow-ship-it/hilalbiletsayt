"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import QRCode from "react-qr-code";
import { useSession } from "@/components/session-provider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Printer } from "lucide-react";

type Ticket = {
  id: string;
  code: string;
  qrCode: string | null;
  price: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  registeredAt: string;
  usedAt: string | null;
  examCode: string;
  examTitle: string;
  sessionCode: string | null;
  candidateNumber: string | null;
  candidateFullName: string | null;
  branchName: string | null;
  sellerFullName: string | null;
};

const TICKET_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktiv",
  USED: "İstifadə edilib",
  CANCELLED: "Ləğv edilib",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Ödəniş gözlənilir",
  PAID: "Ödənilib",
  REFUNDED: "Geri qaytarılıb",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Nağd",
  CARD: "Kart",
  BANK_TRANSFER: "Bank köçürməsi",
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("az-AZ", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TicketDetail({ ticketId }: { ticketId: string }) {
  const { user, request } = useSession();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [origin] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin,
  );

  useEffect(() => {
    if (!user || !ticketId) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await request<Ticket>(`/ticket/${ticketId}`);
        if (active) setTicket(result);
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Bilet yüklənmədi.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [ticketId, user, request]);

  if (!user) {
    return (
      <div className="min-h-screen p-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-2 text-xl font-medium">Giriş tələb olunur</h2>
          <p className="text-muted-foreground">
            Biletə baxmaq üçün hesabınıza daxil olun.
          </p>
          <Link href="/login" className="mt-4 inline-flex text-primary">
            Giriş
          </Link>
        </div>
      </div>
    );
  }

  if (!ticketId) {
    return (
      <div className="min-h-screen p-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 text-destructive">Bilet tapılmadı.</p>
          <Button type="button" variant="outline" onClick={() => history.back()}>
            Geri qayıt
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-8 animate-pulse rounded-full" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen p-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 text-destructive">
            {error || "Bilet tapılmadı."}
          </p>
          <Button type="button" variant="outline" onClick={() => history.back()}>
            Geri qayıt
          </Button>
        </div>
      </div>
    );
  }

  const verifyUrl = ticket.qrCode
    ? `${origin}/tickets/verify/${ticket.qrCode}`
    : "";

  return (
    <div className="min-h-screen bg-background">
      <div className="print-hidden container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-6">
        <Button type="button" variant="outline" onClick={() => history.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Geri
        </Button>
        <Button type="button" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Çap et
        </Button>
      </div>

      <div className="container mx-auto px-4 pb-12">
        <Card className="print-ticket mx-auto w-full max-w-2xl overflow-hidden border-border">
          <div className="flex items-center justify-between gap-4 border-b border-border bg-primary/5 px-6 py-5">
            <div className="flex items-center gap-3">
              <Image
                src="/branding/hilal-logo.png"
                alt="Hilal Kursları"
                width={48}
                height={48}
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                  Hilal Bilet
                </p>
                <p className="text-caption text-muted-foreground">
                  Rəsmi imtahan bileti
                </p>
              </div>
            </div>
            <span className="rounded border border-border bg-background px-3 py-1 text-xs font-medium">
              {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
            </span>
          </div>

          <div className="grid gap-6 px-6 py-6 sm:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  İmtahan
                </p>
                <p className="text-lg font-medium">
                  {ticket.examCode} — {ticket.examTitle}
                </p>
              </div>

              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Sessiya</p>
                  <p className="font-medium">{ticket.sessionCode ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Bilet kodu</p>
                  <p className="font-mono font-medium">{ticket.code}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Namizəd</p>
                  <p className="font-medium">
                    {ticket.candidateFullName ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Namizəd nömrəsi
                  </p>
                  <p className="font-medium">
                    {ticket.candidateNumber ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Filial</p>
                  <p className="font-medium">{ticket.branchName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Satış vaxtı</p>
                  <p className="font-medium">
                    {formatDateTime(ticket.registeredAt)}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Qiymət</p>
                  <p className="text-lg font-medium">{ticket.price} AZN</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Ödəniş statusu
                  </p>
                  <p className="font-medium">
                    {PAYMENT_STATUS_LABELS[ticket.paymentStatus] ??
                      ticket.paymentStatus}
                  </p>
                  {ticket.paymentMethod && (
                    <p className="text-xs text-muted-foreground">
                      {PAYMENT_METHOD_LABELS[ticket.paymentMethod] ??
                        ticket.paymentMethod}
                    </p>
                  )}
                </div>
              </div>

              {ticket.usedAt && (
                <p className="text-xs text-muted-foreground">
                  İstifadə edilib: {formatDateTime(ticket.usedAt)}
                </p>
              )}
            </div>

            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border p-4">
              {verifyUrl ? (
                <QRCode value={verifyUrl} size={148} />
              ) : (
                <p className="text-xs text-muted-foreground">QR yoxdur</p>
              )}
              <p className="text-center text-[10px] leading-tight text-muted-foreground">
                Biletin həqiqiliyini
                <br />
                skan edərək yoxlayın
              </p>
            </div>
          </div>

          <div className="border-t border-border bg-muted/30 px-6 py-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Bu bilet yalnız göstərilən namizəd üçün etibarlıdır. Ödəniş
              kassada təsdiqlənmədikcə “ödəniş gözlənilir” statusunda qalır.
              Biletin surətinin çıxarılması və ya başqasına verilməsi
              qadağandır.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
