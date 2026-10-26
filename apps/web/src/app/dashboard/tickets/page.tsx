"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/session-provider";
import { PageHeader } from "@/components/page-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatAzn } from "@/lib/money";

type Ticket = {
  id: string;
  code: string;
  examTitle: string;
  candidateFullName: string | null;
  branchName: string | null;
  price: number;
  status: string;
  paymentStatus: string;
  sellerId: string | null;
};
export default function TicketsPage() {
  const { user, initializing, selectedBranch, request } = useSession();
  const [result, setResult] = useState<{
    data: Ticket[];
    total: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState("");
  const central = user?.roles?.some((role) =>
    ["SUPER_ADMIN", "CENTRAL_ADMIN"].includes(role),
  );
  const cashier = central || user?.roles?.includes("BRANCH_MANAGER");
  useEffect(() => {
    if (!user) return;
    let active = true;
    request<{ data: Ticket[]; total: number }>(
      `/ticket?page=${page}&limit=20${selectedBranch ? `&branchId=${selectedBranch}` : ""}`,
    )
      .then((data) => {
        if (active) {
          setResult(data);
          setError("");
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [user, selectedBranch, request, page, reload]);
  async function action(ticket: Ticket, operation: string) {
    if (
      !window.confirm(
        operation === "payment"
          ? `${ticket.code}: ${formatAzn(ticket.price)} nağd ödəniş alındığını təsdiqləyirsiniz?`
          : `${ticket.code} bileti ləğv edilsin?`,
      )
    )
      return;
    setBusy(ticket.id);
    try {
      await request(`/ticket/${ticket.id}/${operation}`, { method: "PUT" });
      setReload((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Əməliyyat tamamlanmadı.",
      );
    } finally {
      setBusy("");
    }
  }
  if (initializing) return <p role="status">Yüklənir…</p>;
  if (!user) return <Link href="/login">İdarəetmə panelinə daxil olun</Link>;
  return (
    <>
      <PageHeader
        title="Biletlər"
        description="Real sifarişlər və kassada ödəniş təsdiqi"
      />
      <Link href="/examinations" className="btn-primary mb-6">
        Bilet sat
      </Link>
      {error && (
        <p role="alert" className="my-4 text-destructive">
          {error}
        </p>
      )}
      {!result ? (
        <p role="status">Biletlər yüklənir…</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {result.data.map((ticket) => (
              <Card key={ticket.id} className="p-5">
                <Link href={`/tickets/${ticket.id}`} className="font-semibold">
                  {ticket.code}
                </Link>
                <h2>{ticket.examTitle}</h2>
                <p>
                  {ticket.candidateFullName} · {ticket.branchName}
                </p>
                <p>
                  {formatAzn(ticket.price)} ·{" "}
                  {ticket.paymentStatus === "PAID"
                    ? "Ödənilib"
                    : "Ödəniş gözlənilir"}
                </p>
                <p>
                  {
                    (
                      {
                        ACTIVE: "Aktiv",
                        USED: "İstifadə edilib",
                        CANCELLED: "Ləğv edilib",
                      } as Record<string, string>
                    )[ticket.status]
                  }
                </p>
                <div className="flex flex-wrap gap-3">
                  {cashier &&
                    ticket.status === "ACTIVE" &&
                    ticket.paymentStatus === "PENDING" && (
                      <Button
                        disabled={!!busy}
                        onClick={() => action(ticket, "payment")}
                      >
                        Ödənişi təsdiqlə
                      </Button>
                    )}
                  {ticket.status === "ACTIVE" &&
                    (central || ticket.sellerId === user.userId) && (
                      <Button
                        variant="outline"
                        disabled={!!busy}
                        onClick={() => action(ticket, "cancel")}
                      >
                        Ləğv et
                      </Button>
                    )}
                </div>
              </Card>
            ))}
          </div>
          {result.data.length === 0 && <p>Bilet tapılmadı.</p>}
          <div className="my-6 flex items-center gap-4">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Əvvəlki
            </Button>
            <span>
              {page} · {result.total} bilet
            </span>
            <Button
              variant="outline"
              disabled={page * 20 >= result.total}
              onClick={() => setPage((value) => value + 1)}
            >
              Növbəti
            </Button>
          </div>
        </>
      )}
    </>
  );
}
