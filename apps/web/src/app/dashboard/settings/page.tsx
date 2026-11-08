"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/session-provider";
import { PageHeader } from "@/components/page-ui";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { sessionDate } from "@/lib/public-sales";

export default function Page() {
  const { user, initializing, request } = useSession();
  const [health, setHealth] = useState<{ database: string; timestamp: string } | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!user) return;
    let active = true;
    request<{ database: string; timestamp: string }>("/health")
      .then(data => { if (active) { setHealth(data); setError(""); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Sistemə bağlantı alınmadı."); });
    return () => { active = false; };
  }, [user, request, reload]);
  if (initializing) return <p role="status">Yüklənir…</p>;
  if (!user) return <Link href="/login">Daxil olun</Link>;
  return <>
    <PageHeader title="Tənzimləmələr" description="Hesabınız, iş sahəniz və sistem bağlantısı" />
    <div className="grid gap-5 md:grid-cols-2">
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Hesab məlumatları</h2>
        <p>{user.fullName}</p><p className="break-all">{user.email}</p>
        <p>Rollar: {(user.roles ?? []).join(", ")}</p>
        <p>Filiallar: {user.branches.map(branch => branch.name).join(", ")}</p>
        <p>İş saat qurşağı: Bakı (Asia/Baku). Valyuta: AZN.</p>
        <Link href="/dashboard/branches" className="underline">Filial məlumatları</Link>
        {(user.roles ?? []).some(role => ["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER"].includes(role)) &&
          <Link href="/dashboard/users" className="underline">İstifadəçilər və icazələr</Link>}
      </Card>
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Sistem bağlantısı</h2>
        {error ? <p role="alert">{error}</p> : !health ? <p role="status">Yoxlanılır…</p> : <>
          <p role="status">{health.database === "connected" ? "Verilənlər bazası ilə əlaqə var" : "Verilənlər bazası ilə əlaqə yoxdur"}</p>
          <p>Son yoxlama: {sessionDate(health.timestamp)}</p>
        </>}
        <Button onClick={() => { setHealth(null); setError(""); setReload(value => value + 1); }}>Yenidən yoxla</Button>
      </Card>
    </div>
  </>;
}
