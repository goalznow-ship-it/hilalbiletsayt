"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/session-provider";
import { PageHeader } from "@/components/page-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QEPIK_PER_AZN } from "@/lib/money";

// Cash totals: 0 is "0.00 AZN", not "free" as for ticket prices.
const azn = (qepik: number) => `${(qepik / QEPIK_PER_AZN).toFixed(2)} AZN`;

type Summary = {
  businessDate: string;
  ticketCount: number;
  paidCount: number;
  pendingCount: number;
  cancelledCount: number;
  paidAmount: number;
};
type Preview = {
  closed: boolean;
  closure: { closedAt: string } | null;
  summary: Summary;
};
type Closure = {
  id: string;
  businessDate: string;
  closedAt: string;
  ticketCount: number;
  paidCount: number;
  cancelledCount: number;
  paidAmount: number;
  branch: { name: string };
  closer: { fullName: string };
};

/** Today's date in Asia/Baku (UTC+4, no DST), matching the server. */
function bakuToday() {
  return new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);
}

export default function DayClosurePage() {
  const { user, initializing, selectedBranch, request } = useSession();
  const [date, setDate] = useState(bakuToday);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<Closure[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const roles = user?.roles ?? [];
  const canClose = roles.some((role) =>
    ["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER"].includes(role),
  );

  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!user || !selectedBranch) return;
    let active = true;
    Promise.all([
      request<Preview>(`/day-closures/preview?branchId=${selectedBranch}&date=${date}`),
      request<Closure[]>(`/day-closures?branchId=${selectedBranch}`),
    ])
      .then(([day, list]) => {
        if (!active) return;
        setPreview(day);
        setHistory(list);
        setError("");
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Məlumat alınmadı.");
      });
    return () => {
      active = false;
    };
  }, [user, selectedBranch, date, request, reload]);

  async function close() {
    if (!preview || !window.confirm(
      `${date} tarixli gün bağlansın? Bağlandıqdan sonra bu günün satışları, ödənişləri və ləğvləri dəyişdirilə bilməz.`,
    )) return;
    setBusy(true);
    try {
      await request("/day-closures", {
        method: "POST",
        body: JSON.stringify({ branchId: selectedBranch, date }),
      });
      setReload((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gün bağlanmadı.");
    } finally {
      setBusy(false);
    }
  }

  if (initializing) return <p role="status">Yüklənir…</p>;
  if (!user) return <Link href="/login">İdarəetmə panelinə daxil olun</Link>;
  return (
    <>
      <PageHeader
        title="Günün bağlanması"
        description="Kassanın günlük yekunu. Bağlanmış günün satışları dəyişdirilə bilməz."
      />
      {!selectedBranch ? (
        <p role="status">Yuxarıdakı siyahıdan filial seçin.</p>
      ) : (
        <>
          <div className="form-row mb-5">
            <div>
              <Label htmlFor="closure-date">Tarix (Bakı vaxtı)</Label>
              <Input
                id="closure-date"
                type="date"
                max={bakuToday()}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
          </div>
          {error && <p role="alert" className="mb-4 text-destructive">{error}</p>}
          {preview && (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">
                {preview.summary.businessDate} ·{" "}
                {preview.closed ? "Bağlanıb" : "Açıqdır"}
              </h2>
              <dl className="metric-grid">
                <div><dt>Satılan bilet</dt><dd>{preview.summary.ticketCount}</dd></div>
                <div><dt>Ödənilib</dt><dd>{preview.summary.paidCount}</dd></div>
                <div><dt>Ödəniş gözlənilir</dt><dd>{preview.summary.pendingCount}</dd></div>
                <div><dt>Ləğv edilib</dt><dd>{preview.summary.cancelledCount}</dd></div>
                <div><dt>Kassa (nağd)</dt><dd>{azn(preview.summary.paidAmount)}</dd></div>
              </dl>
              {preview.closed ? (
                <p className="mt-4">
                  Bağlanma vaxtı:{" "}
                  {preview.closure && new Date(preview.closure.closedAt).toLocaleString("az-AZ")}
                </p>
              ) : canClose ? (
                <Button className="mt-4 min-h-[44px]" disabled={busy} onClick={close}>
                  {busy ? "Bağlanır…" : "Günü bağla"}
                </Button>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  Günü filial rəhbəri bağlayır.
                </p>
              )}
            </Card>
          )}
          <h2 className="mb-3 mt-8 font-semibold">Bağlanmış günlər</h2>
          {history.length === 0 ? (
            <p>Hələ bağlanmış gün yoxdur.</p>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <caption className="sr-only">Bağlanmış günlərin siyahısı</caption>
                <thead>
                  <tr>
                    <th scope="col">Tarix</th>
                    <th scope="col">Bilet</th>
                    <th scope="col">Ödənilib</th>
                    <th scope="col">Məbləğ</th>
                    <th scope="col">Bağlayan</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id}>
                      <td>{row.businessDate.slice(0, 10)}</td>
                      <td>{row.ticketCount}</td>
                      <td>{row.paidCount}</td>
                      <td>{azn(row.paidAmount)}</td>
                      <td>{row.closer.fullName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
