"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Result = {
  examCode: string;
  examTitle: string;
  candidateNameMasked: string | null;
  score: number;
  maximumScore: number;
  correct: number;
  wrong: number;
  blank: number;
  multiple: number;
  publishedAt: string;
};

function ResultLookup() {
  const params = useSearchParams();
  const [ticket, setTicket] = useState(params.get("t") ?? "");
  const [candidateNumber, setCandidateNumber] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/public/results/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: ticket.trim(), candidateNumber: candidateNumber.trim() }),
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) setResult(body as Result);
      else if (response.status === 429)
        setError("Çox sayda cəhd edilib. Bir dəqiqə sonra yenidən yoxlayın.");
      else if (response.status === 400)
        setError("Bilet və namizəd nömrəsini tam daxil edin.");
      else setError("Nəticə tapılmadı və ya hələ dərc olunmayıb.");
    } catch {
      setError("Serverlə əlaqə qurulmadı. Yenidən cəhd edin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="public-result" id="main-content">
      <Link href="/">Hilal Bilet</Link>
      <h1 className="mt-6 text-3xl">İmtahan nəticəsi</h1>
      <p className="my-4">
        Biletdəki QR kodu və ya bilet kodunu (HK-…) və namizəd nömrənizi daxil edin.
        Nəticələr yalnız rəsmi dərc edildikdən sonra görünür.
      </p>
      <form onSubmit={submit} className="public-form grid gap-3">
        <Label htmlFor="result-ticket">Bilet kodu və ya QR keçidi</Label>
        <Input
          id="result-ticket"
          required
          autoComplete="off"
          value={ticket}
          onChange={(event) => setTicket(event.target.value)}
        />
        <Label htmlFor="result-candidate">Namizəd nömrəsi</Label>
        <Input
          id="result-candidate"
          required
          autoComplete="off"
          autoCapitalize="characters"
          value={candidateNumber}
          onChange={(event) => setCandidateNumber(event.target.value)}
        />
        <Button type="submit" className="min-h-11" disabled={busy}>
          {busy ? "Yoxlanılır…" : "Nəticəni göstər"}
        </Button>
      </form>
      <div aria-live="polite" className="mt-6">
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {result && (
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">{result.examCode}</p>
            <h2 className="text-xl font-semibold">{result.examTitle}</h2>
            {result.candidateNameMasked && <p>{result.candidateNameMasked}</p>}
            <p className="my-4 text-4xl font-semibold">
              {result.score} <span className="text-lg">/ {result.maximumScore}</span>
            </p>
            <dl className="metric-grid">
              <div><dt>Düzgün</dt><dd>{result.correct}</dd></div>
              <div><dt>Səhv</dt><dd>{result.wrong}</dd></div>
              <div><dt>Boş</dt><dd>{result.blank}</dd></div>
              {result.multiple > 0 && <div><dt>Çoxlu işarə</dt><dd>{result.multiple}</dd></div>}
            </dl>
          </Card>
        )}
      </div>
    </main>
  );
}

export default function PublicResultsPage() {
  return (
    <Suspense fallback={<p role="status">Yüklənir…</p>}>
      <ResultLookup />
    </Suspense>
  );
}
