"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/session-provider";
import { PageHeader } from "@/components/page-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAzn } from "@/lib/money";

type Row = {
  branchId: string | null; branchName: string; sellerId: string | null; sellerName: string;
  paymentMethod: string | null; status: string; paymentStatus: string; count: number; amount: number;
};
const statusName = (status: string) => ({ ACTIVE: "Aktiv", USED: "İstifadə edilib", CANCELLED: "Ləğv edilib", PAID: "Ödənilib", PENDING: "Ödəniş gözlənilir", REFUNDED: "Geri qaytarılıb" }[status] ?? status);
const methodName = (method: string | null) => ({ CASH: "Nağd", CARD: "Kart", BANK_TRANSFER: "Bank köçürməsi" }[method ?? ""] ?? "—");

export default function ReportsPage() {
  const { user, initializing, request, selectedBranch, downloadFile } = useSession();
  const [report, setReport] = useState<{ query: string; rows: Row[] } | null>(null);
  const [error, setError] = useState("");
  const [dates, setDates] = useState({ from: "", to: "" });
  const [seller, setSeller] = useState("");
  const [busy, setBusy] = useState(false);
  const params = new URLSearchParams();
  if (selectedBranch) params.set("branchId", selectedBranch);
  if (dates.from) params.set("from", dates.from);
  if (dates.to) params.set("to", dates.to);
  const query = params.toString();
  const allRows = report?.query === query ? report.rows : null;
  const rows = allRows?.filter(row => !seller || row.sellerId === seller) ?? null;
  useEffect(() => {
    if (!user) return;
    let active = true;
    request<{ rows: Row[] }>(`/ticket/report?${query}`)
      .then(data => { if (active) { setReport({ query, rows: data.rows }); setError(""); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Hesabat alınmadı."); });
    return () => { active = false; };
  }, [user, request, query]);
  async function excel() {
    setBusy(true); setError("");
    try {
      const exportParams = new URLSearchParams(query);
      if (seller) exportParams.set("sellerId", seller);
      const blob = await downloadFile(`/ticket/report.xlsx?${exportParams}`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = "hilal-sales.xlsx"; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "İxrac alınmadı."); }
    finally { setBusy(false); }
  }
  if (initializing) return <p role="status">Yüklənir…</p>;
  if (!user) return <Link href="/login">İdarəetmə panelinə daxil olun</Link>;
  const paid = rows?.filter(row => row.paymentStatus === "PAID" && row.status !== "CANCELLED").reduce((sum, row) => sum + row.amount, 0) ?? 0;
  const refunded = rows?.filter(row => row.paymentStatus === "REFUNDED").reduce((sum, row) => sum + row.amount, 0) ?? 0;
  const sellers = [...new Map((allRows ?? []).filter(row => row.sellerId).map(row => [row.sellerId!, row.sellerName])).entries()];
  return <>
    <PageHeader title="Satış hesabatı" description="Biletlərin satış tarixinə görə filial, satıcı və ödəniş hesabatı. Tarixlər Bakı vaxtı ilə hesablanır." />
    <form className="my-6 flex flex-wrap items-end gap-4 print-hidden" onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      setDates({ from: String(data.get("from")), to: String(data.get("to")) });
    }}>
      <label>Başlanğıc tarix<Input name="from" type="date" /></label>
      <label>Son tarix<Input name="to" type="date" /></label>
      <Button type="submit">Hesabatı göstər</Button>
      <label>Satıcı<select aria-label="Satıcı" value={seller} onChange={event => setSeller(event.target.value)} className="block h-10 rounded border px-3">
        <option value="">Bütün satıcılar</option>
        {sellers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>
      <Button type="button" variant="outline" disabled={!rows || busy} onClick={excel}>Excel ixrac et</Button>
      <Button type="button" variant="outline" disabled={!rows} onClick={() => window.print()}>Çap / PDF</Button>
    </form>
    <p className="my-4">{dates.from || "Başlanğıcdan"} – {dates.to || "bu günədək"} · Ödənilib: {formatAzn(paid)} · Geri qaytarılıb: {formatAzn(refunded)}</p>
    {error && <p role="alert">{error}</p>}
    {!rows && !error ? <p role="status">Hesabat yüklənir…</p> : rows?.length === 0 ? <p>Hesabat üçün bilet yoxdur.</p> : rows && <div className="data-table-wrap">
      <table className="data-table">
        <caption className="sr-only">Filial və satıcı üzrə satışlar</caption>
        <thead><tr>{["Filial", "Satıcı", "Ödəniş üsulu", "Bilet", "Ödəniş", "Say", "Məbləğ"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>
          <td>{row.branchName}</td><td>{row.sellerName}</td><td>{methodName(row.paymentMethod)}</td>
          <td>{statusName(row.status)}</td><td>{statusName(row.paymentStatus)}</td><td>{row.count}</td><td>{formatAzn(row.amount)}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </>;
}
