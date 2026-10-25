"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Verification = {
  valid: boolean;
  code: string;
  examCode: string;
  examTitle: string;
  sessionCode: string | null;
  startsAt: string | null;
  venue: string | null;
  status: string;
  usedAt: string | null;
  candidateNameMasked: string | null;
  paymentStatus: string;
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Etibarlıdır",
  USED: "Artıq istifadə edilib",
  CANCELLED: "Ləğv edilib",
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

export default function VerifyTicket({ token }: { token: string }) {
  const [result, setResult] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/ticket/verify/${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          if (active) setError("Bilet tapılmadı və ya etibarsızdır.");
          return;
        }
        const data = (await response.json()) as Verification;
        if (active) setResult(data);
      } catch {
        if (active) {
          setError("Serverlə əlaqə qurulmadı. Yenidən cəhd edin.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md overflow-hidden border-border">
        <div className="flex items-center gap-3 border-b border-border bg-primary/5 px-5 py-4">
          <Image
            src="/branding/hilal-logo.png"
            alt="Hilal Kursları"
            width={40}
            height={40}
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Hilal Bilet
            </p>
            <p className="text-caption text-muted-foreground">
              Bilet yoxlaması
            </p>
          </div>
        </div>

        <div className="p-5">
          {!token ? (
            <div className="text-center">
              <p className="text-lg font-medium text-destructive">
                Etibarsız bilet
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                QR kod etibarlı deyil.
              </p>
            </div>
          ) : loading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-2/3 animate-pulse" />
              <Skeleton className="h-4 w-full animate-pulse" />
              <Skeleton className="h-4 w-5/6 animate-pulse" />
            </div>
          ) : error ? (
            <div className="text-center">
              <p className="text-lg font-medium text-destructive">
                Etibarsız bilet
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            </div>
          ) : result ? (
            <div>
              <div
                className={`rounded-lg border p-3 text-center ${
                  result.valid
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                }`}
              >
                <p className="text-lg font-medium">
                  {STATUS_LABELS[result.status] ?? result.status}
                </p>
                {!result.valid && result.status === "ACTIVE" && (
                  <p className="text-xs">Bilet aktiv deyil.</p>
                )}
              </div>

              <dl className="mt-5 space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">İmtahan</dt>
                  <dd className="font-medium">
                    {result.examCode} — {result.examTitle}
                  </dd>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">Sessiya</dt>
                    <dd className="font-medium">
                      {result.sessionCode ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Bilet kodu</dt>
                    <dd className="font-mono font-medium">{result.code}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Başlama</dt>
                    <dd className="font-medium">
                      {formatDateTime(result.startsAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Məkan</dt>
                    <dd className="font-medium">{result.venue ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Namizəd</dt>
                    <dd className="font-medium">
                      {result.candidateNameMasked ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      İstifadə vaxtı
                    </dt>
                    <dd className="font-medium">
                      {formatDateTime(result.usedAt)}
                    </dd>
                  </div>
                </div>
              </dl>

              <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                Şəxsi məlumatların qorunması üçün namizədin adı qismən
                göstərilir. Bilet sahibinin şəxsiyyətini təsdiqləyin.
              </p>
            </div>
          ) : null}

          <div className="mt-5 border-t border-border pt-4 text-center">
            <Link href="/login" className="text-sm text-primary">
              Hilal Bilet sisteminə keç
            </Link>
          </div>
        </div>
      </Card>
    </main>
  );
}
