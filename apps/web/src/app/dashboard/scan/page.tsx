"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { CircleCheck, CircleX } from "lucide-react";
import { useSession } from "@/components/session-provider";
import { PageHeader } from "@/components/page-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Admitted = {
  code: string;
  examTitle: string;
  sessionCode: string | null;
  candidateFullName: string | null;
  candidateNumber: string | null;
};

type Outcome =
  | { kind: "ok"; ticket: Admitted }
  | { kind: "error"; message: string };

/**
 * Entry check at the exam door. Hardware QR scanners type the payload and
 * press Enter, phone users paste or type it; the server verifies the
 * signature and admits a ticket only once.
 */
export default function ScanPage() {
  const { user, initializing, request } = useSession();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const qr = value.trim();
    if (!qr || busy) return;
    setBusy(true);
    try {
      const ticket = await request<Admitted>("/ticket/scan", {
        method: "POST",
        body: JSON.stringify({ qr }),
      });
      setOutcome({ kind: "ok", ticket });
    } catch (cause) {
      setOutcome({
        kind: "error",
        message: cause instanceof Error ? cause.message : "Yoxlama alınmadı.",
      });
    } finally {
      setBusy(false);
      setValue("");
      input.current?.focus();
    }
  }

  if (initializing) return <p role="status">Yüklənir…</p>;
  if (!user) return <Link href="/login">İdarəetmə panelinə daxil olun</Link>;
  return (
    <>
      <PageHeader
        title="Girişdə yoxlama"
        description="Biletin QR kodunu skan edin. Hər bilet yalnız bir dəfə qəbul olunur."
      />
      <Card className="scan-card p-5">
        <form onSubmit={submit} className="grid gap-3">
          <Label htmlFor="scan-input">QR kod və ya yoxlama keçidi</Label>
          <Input
            id="scan-input"
            ref={input}
            autoFocus
            autoComplete="off"
            inputMode="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-describedby="scan-help"
          />
          <p id="scan-help" className="text-sm text-muted-foreground">
            Skaner kodu avtomatik daxil edir; telefonda kodu yapışdırıb
            &laquo;Yoxla&raquo; düyməsini basın.
          </p>
          <Button type="submit" disabled={busy || !value.trim()} className="min-h-11">
            {busy ? "Yoxlanılır…" : "Yoxla"}
          </Button>
        </form>
      </Card>
      <div aria-live="assertive" className="mt-5">
        {outcome?.kind === "ok" && (
          <Card className="scan-result scan-ok p-5" role="status">
            <CircleCheck aria-hidden="true" />
            <div>
              <h2>Giriş icazəlidir</h2>
              <p>
                {outcome.ticket.candidateFullName ?? "Namizəd"} ·{" "}
                {outcome.ticket.candidateNumber}
              </p>
              <p>
                {outcome.ticket.examTitle}
                {outcome.ticket.sessionCode ? ` · ${outcome.ticket.sessionCode}` : ""}
              </p>
              <p className="text-sm">{outcome.ticket.code}</p>
            </div>
          </Card>
        )}
        {outcome?.kind === "error" && (
          <Card className="scan-result scan-error p-5" role="alert">
            <CircleX aria-hidden="true" />
            <div>
              <h2>Giriş qadağandır</h2>
              <p>{outcome.message}</p>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
