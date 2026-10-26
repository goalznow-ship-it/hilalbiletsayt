"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/session-provider";
import { PageHeader } from "@/components/page-ui";
import { Card } from "@/components/ui/card";
import { formatAzn } from "@/lib/money";
type Metric = {
  status: string;
  paymentStatus: string;
  _count: { _all: number };
  _sum: { price: number | null };
};
export default function ReportsPage() {
  const { user, request, selectedBranch } = useSession();
  const [rows, setRows] = useState<Metric[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    let active = true;
    request<Metric[]>(
      `/ticket/stats${selectedBranch ? `?branchId=${selectedBranch}` : ""}`,
    )
      .then((data) => {
        if (active) setRows(data);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [user, request, selectedBranch]);
  if (!user) return <Link href="/login">İdarəetmə panelinə daxil olun</Link>;
  return (
    <>
      <PageHeader
        title="Satış hesabatı"
        description="İcazəniz olan filialların real bilet və ödəniş məlumatları"
      />
      {error ? (
        <p role="alert">{error}</p>
      ) : !rows ? (
        <p role="status">Hesabat yüklənir…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.length === 0 && <p>Hesabat üçün bilet yoxdur.</p>}
          {rows.map((row) => (
            <Card className="p-5" key={`${row.status}-${row.paymentStatus}`}>
              <h2>
                {
                  (
                    {
                      ACTIVE: "Aktiv",
                      USED: "İstifadə edilib",
                      CANCELLED: "Ləğv edilib",
                    } as Record<string, string>
                  )[row.status]
                }
              </h2>
              <p>
                {row.paymentStatus === "PAID"
                  ? "Ödənilib"
                  : row.paymentStatus === "REFUNDED"
                    ? "Geri qaytarılıb"
                    : "Ödəniş gözlənilir"}
              </p>
              <p>
                {row._count._all} bilet · {formatAzn(row._sum.price)}
              </p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
