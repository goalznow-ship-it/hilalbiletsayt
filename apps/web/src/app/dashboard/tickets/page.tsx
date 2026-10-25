"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";
import { useBranches } from "@/hooks/use-branches";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Ticket, Trash } from "lucide-react";

type Ticket = {
  id: string;
  code: string;
  examCode: string;
  examTitle: string;
  sessionCode?: string;
  candidateNumber?: string;
  candidateFullName?: string;
  branchName?: string;
  branchCode?: string;
  price: number;
  status: "ACTIVE" | "USED" | "CANCELLED";
  sellerFullName?: string;
  createdAt: string;
};

type TicketFormValues = {
  examId: string;
  price: number;
};

export default function Page() {
  const { user, request } = useSession();
  const { branches, loading: branchLoading } = useBranches();

  const [ticketsData, setTicketsData] = useState<Ticket[]>([]);

  useEffect(() => {
    if (!user) return;
    const branchId = user.branches?.[0]?.id ?? undefined;
    request<Ticket[]>(`/api/ticket?branchId=${branchId}`).then((data) => {
      setTicketsData(data);
    });
  }, [user]);

  const handleCreate = (values: TicketFormValues) => {
    setTicketsData(prev => [...prev, {
      id: "new",
      code: "NEW-001",
      examCode: "IMT-001",
      examTitle: "Test İmtahanı",
      price: values.price,
      status: "ACTIVE",
    } as Ticket]);
  };

  const handleDelete = (ticketId: string) => {
    setTicketsData(prev => prev.filter((t) => t.id !== ticketId));
  };

  if (!user) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl font-medium mb-2">Xoş gəlmisiniz</h2>
          <p className="text-muted-foreground">
            Filial administratorunuzla əlaqə saxlayın
          </p>
          <Link href="/login" className="btn-primary mt-4">
            Giriş
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        eyebrow="BİLET SATIŞİ"
        title="Bilet Idarəetmə"
        description="İmtahan biletləri və satış əməliyyatları"
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <div className="p-4 md:p-6">
            <h3 className="font-medium mb-4">Yeni Bilet Yarad</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreate({ examId: "test", price: 10 });
              }}
            >
              <Input
                type="number"
                value={10}
                onChange={() => {}}
                min={0}
                disabled
              />
              <Button type="submit">Bilet yarad</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {}}
              >
                Läğv et
              </Button>
            </form>
          </div>
        </Card>

        <Card>
          <div className="p-4 md:p-6">
            <h3 className="font-medium mb-4">Bilet Listesi</h3>

            {branchLoading ? (
              <Skeleton className="animate-pulse" />
            ) : ticketsData.length === 0 ? (
              <p className="text-center text-muted-foreground">
                Bilet tapılmadı
              </p>
            ) : (
              <table className="w-full rounded-md border border-border bg-card">
                <thead>
                  <tr className="border-b border-border text-sm font-medium text-muted-foreground">
                    <th className="py-3">Bilet Nömrəsi</th>
                    <th className="py-3">İmtahan</th>
                    <th className="py-3">Sessiya</th>
                    <th className="py-3">Namizəd</th>
                    <th className="py-3 text-center">Qiymət</th>
                    <th className="py-3">Status</th>
                    <th className="py-3">Əməliyyat</th>
                  </tr>
                </thead>
                <tbody>
                  {ticketsData.map((ticket) => (
                    <tr key={ticket.code} className="border-b border-border">
                      <td className="font-mono">{ticket.code}</td>
                      <td>{ticket.examCode} - {ticket.examTitle}</td>
                      <td>{ticket.sessionCode || "Sessiya yoxdur"}</td>
                      <td>{ticket.candidateFullName || "Nömrəsi yox"}</td>
                      <td className="text-right">{ticket.price} AZN</td>
                      <td>{ticket.status}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(ticket.id)}
                        >
                          Sil
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
