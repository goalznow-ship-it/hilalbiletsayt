"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "@/components/session-provider";
import { PageHeader } from "@/components/page-ui";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sessionDate } from "@/lib/public-sales";
import { roleLabels } from "@/lib/navigation";

export default function Page() {
  const { user, initializing, request, clearSession } = useSession();
  const [health, setHealth] = useState<{ database: string; timestamp: string } | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [passwordError, setPasswordError] = useState("");
  const [changed, setChanged] = useState(false);
  const [visible, setVisible] = useState(false);
  const roles = user?.roles ?? (user?.role ? [user.role] : []);
  const central = roles.some(role => ["SUPER_ADMIN", "CENTRAL_ADMIN"].includes(role));
  useEffect(() => {
    if (!user || !central) return;
    let active = true;
    request<{ database: string; timestamp: string }>("/health")
      .then(data => { if (active) { setHealth(data); setError(""); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Sistemə bağlantı alınmadı."); });
    return () => { active = false; };
  }, [user, central, request, reload]);
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    setPasswordError("");
    if (!currentPassword || newPassword.length < 12 || newPassword.length > 128) {
      setPasswordError("Hazırkı şifrəni və 12–128 simvolluq yeni şifrəni daxil edin."); return;
    }
    if (newPassword !== data.get("confirmPassword")) { setPasswordError("Yeni şifrələr eyni deyil."); return; }
    if (currentPassword === newPassword) { setPasswordError("Yeni şifrə hazırkı şifrədən fərqli olmalıdır."); return; }
    pending.current = true; setSaving(true);
    try {
      const result = await request<{ changed: boolean }>("/auth/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
      if (result.changed !== true) throw new Error("Şifrə dəyişikliyi təsdiqlənmədi.");
      form.reset(); setVisible(false); setChanged(true); clearSession();
    } catch (cause) { setPasswordError(cause instanceof Error ? cause.message : "Şifrə dəyişdirilmədi."); }
    finally { pending.current = false; setSaving(false); }
  }
  if (initializing) return <p role="status">Yüklənir…</p>;
  if (changed) return <Card className="max-w-lg space-y-4 p-6">
    <h1 className="text-xl font-semibold">Şifrəniz dəyişdirildi</h1>
    <p role="status">Bütün cihazlardakı sessiyalar bağlandı. Yeni şifrənizlə yenidən daxil olun.</p>
    <Link href="/login" className="inline-flex min-h-11 items-center font-semibold text-primary underline">Yeni şifrə ilə daxil ol</Link>
  </Card>;
  if (!user) return <Link href="/login">Daxil olun</Link>;
  return <>
    <PageHeader title="Tənzimləmələr" description="Hesab məlumatları, şifrə və iş sahəsi ayarları" />
    <div className="grid gap-5 md:grid-cols-2">
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Şifrəni dəyiş</h2>
        <p id="password-rules" className="text-sm text-muted-foreground">Yeni şifrə 12–128 simvol olmalıdır. Dəyişdikdən sonra bütün cihazlarda yenidən giriş tələb olunacaq.</p>
        <form onSubmit={changePassword} className="mt-4 space-y-4" aria-busy={saving}>
          <fieldset disabled={saving} className="space-y-4">
            <div className="space-y-2"><label htmlFor="current-password">Hazırkı şifrə</label>
              <Input id="current-password" name="currentPassword" type={visible ? "text" : "password"} autoComplete="current-password" required maxLength={128} /></div>
            <div className="space-y-2"><label htmlFor="new-password">Yeni şifrə</label>
              <Input id="new-password" name="newPassword" type={visible ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby="password-rules" /></div>
            <div className="space-y-2"><label htmlFor="confirm-password">Yeni şifrəni təkrar yazın</label>
              <Input id="confirm-password" name="confirmPassword" type={visible ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} /></div>
            <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-primary" checked={visible} onChange={event => setVisible(event.target.checked)} />Şifrələri göstər</label>
            {passwordError && <p role="alert" className="text-sm text-destructive">{passwordError}</p>}
            <Button type="submit" disabled={saving}>{saving ? "Şifrə dəyişdirilir…" : "Şifrəni dəyiş"}</Button>
          </fieldset>
        </form>
      </Card>
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Hesab məlumatları</h2>
        <p>{user.fullName}</p><p className="break-all">{user.email}</p>
        <p>Rollar: {roles.map(role => roleLabels[role] ?? role).join(", ")}</p>
        <p>Filiallar: {user.branches.map(branch => branch.name).join(", ") || (central ? "Bütün filiallar" : "Filial təyin edilməyib")}</p>
        <p>İş saat qurşağı: Bakı (Asia/Baku). Valyuta: AZN.</p>
        {central && <Link href="/dashboard/branches" className="inline-flex min-h-11 items-center underline">Filial məlumatları</Link>}
        {roles.some(role => ["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER"].includes(role)) &&
          <Link href="/dashboard/users" className="flex min-h-11 items-center underline">İstifadəçilər və icazələr</Link>}
        {central && <Link href="/dashboard/exams" className="flex min-h-11 items-center underline">İmtahan kodu, adı və qiyməti</Link>}
      </Card>
      {central && <Card className="p-5">
        <h2 className="text-lg font-semibold">Sistem bağlantısı</h2>
        {error ? <p role="alert">{error}</p> : !health ? <p role="status">Yoxlanılır…</p> : <>
          <p role="status">{health.database === "connected" ? "Verilənlər bazası ilə əlaqə var" : "Verilənlər bazası ilə əlaqə yoxdur"}</p>
          <p>Son yoxlama: {sessionDate(health.timestamp)}</p>
        </>}
        <Button onClick={() => { setHealth(null); setError(""); setReload(value => value + 1); }}>Yenidən yoxla</Button>
      </Card>}
    </div>
  </>;
}
