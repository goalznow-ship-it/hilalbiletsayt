"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/session-provider";
import { ExamTicket, type ExamTicketData } from "@/components/exam-ticket";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Printer } from "lucide-react";

type Ticket = ExamTicketData & { id: string; qrCode: string | null };

export default function TicketDetail({ ticketId }: { ticketId: string }) {
  const { user, initializing, request } = useSession();
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

  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-8 animate-pulse rounded-full" />
      </div>
    );
  }

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
        <ExamTicket ticket={ticket} verifyUrl={verifyUrl} />
      </div>
    </div>
  );
}
