"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
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
  rank: number;
  participants: number;
  publishedAt: string;
  variant?: string;
  answers?: Array<{ question: number; selected: string | null; marked: string[]; correct: string; outcome: string; points: number | null }>;
  scoring?: { wrong: number; unanswered: number; multiple: number; floorAtZero: boolean };
};

const outcomeLabels: Record<string, string> = { CORRECT: "Düzgün cavab", WRONG: "Səhv cavab", BLANK: "Cavab verilməyib", MULTIPLE: "Çoxlu işarə" };

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("az-AZ", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function ResultLookup() {
  const params = useSearchParams();
  const [ticket, setTicket] = useState(params.get("t") ?? "");
  const [candidateNumber, setCandidateNumber] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ticketInput = useRef<HTMLInputElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const [mistakesOnly, setMistakesOnly] = useState(false);

  useEffect(() => { if (result) resultHeading.current?.focus(); }, [result]);

  const percent =
    result && result.maximumScore > 0
      ? Math.round((result.score / result.maximumScore) * 1000) / 10
      : 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    setMistakesOnly(false);
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
      else if (response.status >= 500) setError("Nəticə xidməti hazırda cavab vermir. Bir qədər sonra yenidən yoxlayın.");
      else setError("Nəticə tapılmadı və ya hələ dərc olunmayıb. Bilet kodunu və namizəd nömrəsini yoxlayın.");
    } catch {
      setError("Serverlə əlaqə qurulmadı. İnternet bağlantısını yoxlayıb yenidən cəhd edin.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setResult(null);
    setError("");
    setTicket("");
    setCandidateNumber("");
    ticketInput.current?.focus();
  }

  return (
    <main className="public-result" id="main-content">
      <header className="result-brand">
        <Link href="/" className="public-brand">
          <Image src="/branding/hilal-logo.png" alt="Hilal" width={42} height={42} priority />
          <span>Hilal Bilet</span>
        </Link>
        <nav aria-label="Nəticə səhifəsi">
          <Link href="/">Ana səhifə</Link>
          <Link href="/tickets/verify">Bileti yoxla</Link>
        </nav>
      </header>

      <p className="result-eyebrow">RƏSMİ NƏTİCƏ ELANI</p>
      <h1>İmtahan nəticənizi öyrənin</h1>
      <p className="result-lead">
        Biletdəki QR kodunu və ya bilet kodunu (HK-…) daxil edin, sonra namizəd
        nömrənizi əlavə edin. Nəticə yalnız rəsmi dərc edildikdən sonra görünür;
        hər iki məlumat birlikdə düzgün olmalıdır.
      </p>

      <Card className="result-form-card p-5">
        <form onSubmit={submit} className="public-form">
          <Label htmlFor="result-ticket">Bilet kodu və ya QR keçidi</Label>
          <Input
            id="result-ticket"
            ref={ticketInput}
            required
            disabled={busy}
            maxLength={300}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="HK-XXXXXX və ya QR keçidi"
            className="min-h-[44px]"
            value={ticket}
            onChange={(event) => { setTicket(event.target.value); setResult(null); setError(""); }}
          />
          <Label htmlFor="result-candidate">Namizəd nömrəsi</Label>
          <Input
            id="result-candidate"
            required
            disabled={busy}
            maxLength={80}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="min-h-[44px]"
            value={candidateNumber}
            placeholder="Biletdə göstərilən namizəd nömrəsi"
            onChange={(event) => { setCandidateNumber(event.target.value); setResult(null); setError(""); }}
          />
          <Button type="submit" className="min-h-[44px]" disabled={busy}>
            {busy ? "Yoxlanılır…" : "Nəticəni göstər"}
          </Button>
          <p className="result-privacy">
            Namizədin tam adı göstərilmir. Nəticə yalnız bilet sahibinə aid
            məlumatlarla açılır.
          </p>
        </form>
      </Card>

      <div aria-live="polite" className="mt-6">
        {error && <p role="alert" className="result-error">{error}</p>}
        {result && (
          <Card className="result-card p-5">
            <div className="result-heading">
              <div>
                <p className="result-exam-code">{result.examCode}</p>
                <h2 ref={resultHeading} tabIndex={-1}>{result.examTitle}</h2>
                {result.candidateNameMasked && <p className="result-name">{result.candidateNameMasked}</p>}
                {result.variant && <p className="mt-2 text-sm text-muted-foreground">Kitabça variantı: <strong>{result.variant}</strong></p>}
              </div>
              <p className="result-published">Dərc: {formatDate(result.publishedAt)}</p>
            </div>

            <div className="result-score-row">
              <p className="result-score">
                {result.score} <span>/ {result.maximumScore}</span>
              </p>
              <p className="result-percent">
                {percent}% <span>bal faizi</span>
              </p>
            </div>

            <dl className="metric-grid">
              <div><dt>Reytinq (faiz üzrə)</dt><dd>{result.rank} / {result.participants}</dd></div>
              <div><dt>Düzgün</dt><dd>{result.correct}</dd></div>
              <div><dt>Səhv</dt><dd>{result.wrong}</dd></div>
              <div><dt>Boş</dt><dd>{result.blank}</dd></div>
              {result.multiple > 0 && <div><dt>Çoxlu işarə</dt><dd>{result.multiple}</dd></div>}
            </dl>

            <p className="result-rank-note">
              {result.participants > 1
                ? `Bu imtahanda ${result.participants} namizəd iştirak edib. Faiz üzrə yeriniz: ${result.rank}.`
                : "Bu imtahanda hələ yalnız bir nəticə var."}
            </p>

            {!!result.answers?.length && <section className="mt-8 border-t border-border pt-6" aria-labelledby="answer-details">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 id="answer-details" className="text-lg font-semibold">Sual-sual cavablarınız</h3>
                <div className="flex flex-wrap gap-2 no-print" role="group" aria-label="Cavabları süzgəcdən keçir">
                  <Button type="button" variant={mistakesOnly ? "outline" : "default"} aria-pressed={!mistakesOnly}
                    className="min-h-11" onClick={() => setMistakesOnly(false)}>Hamısı ({result.answers.length})</Button>
                  <Button type="button" variant={mistakesOnly ? "default" : "outline"} aria-pressed={mistakesOnly}
                    className="min-h-11" onClick={() => setMistakesOnly(true)}>Səhv və boş ({result.answers.filter(answer => answer.outcome !== "CORRECT").length})</Button>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">Seçdiyiniz cavab, düzgün cavab və hər sualdan qazandığınız bal.</p>
              <ol className="result-answer-list">
                {result.answers.map(answer => <li key={answer.question} className="result-answer" data-filtered={mistakesOnly && answer.outcome === "CORRECT"}>
                  <div className="flex flex-wrap justify-between gap-2">
                    <strong>Sual {answer.question}</strong>
                    <span className={answer.outcome === "CORRECT" ? "text-emerald-800" : "text-amber-900"}>
                      {outcomeLabels[answer.outcome] ?? answer.outcome}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                    <div><dt className="text-muted-foreground">Sizin cavab</dt><dd className="mt-1 font-semibold">{answer.selected ?? (answer.marked?.length ? answer.marked.join(", ") : "Boş")}</dd></div>
                    <div><dt className="text-muted-foreground">Düzgün cavab</dt><dd className="mt-1 font-semibold text-primary">{answer.correct}</dd></div>
                    <div><dt className="text-muted-foreground">Bal</dt><dd className="mt-1 font-semibold">{answer.points ?? "—"}</dd></div>
                  </dl>
                </li>)}
              </ol>
              {mistakesOnly && result.answers.every(answer => answer.outcome === "CORRECT") &&
                <p className="py-4 text-sm text-emerald-800 no-print">Bütün cavablarınız düzgündür.</p>}
              {result.scoring && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Bal qaydası: səhv cavab {result.scoring.wrong}, boş cavab {result.scoring.unanswered}, çoxlu işarə {result.scoring.multiple} bal.
                {result.scoring.floorAtZero && " Yekun bal sıfırdan aşağı düşmür."}
              </p>}
            </section>}

            <div className="result-actions no-print">
              <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => window.print()}>
                Nəticəni çap et
              </Button>
              <Button type="button" variant="ghost" className="min-h-[44px]" onClick={reset}>
                Yeni axtarış
              </Button>
            </div>
          </Card>
        )}
      </div>

      <section className="result-help" aria-labelledby="how-to-read">
        <h2 id="how-to-read">Nəticə necə oxunur?</h2>
        <dl className="result-terms">
          <div>
            <dt>Bal</dt>
            <dd>Cavab kartınızdakı düzgün cavablardan qazanılan bal. İmtahan qaydalarına görə səhv cavab balı azalda bilər.</dd>
          </div>
          <div>
            <dt>Bal faizi</dt>
            <dd>Topladığınız balın mümkün maksimum bala nisbəti. Müxtəlif imtahanları müqayisə etmək üçün ən uyğun göstəricidir.</dd>
          </div>
          <div>
            <dt>Düzgün və səhv</dt>
            <dd>Düzgün — açar cavabla üst-üstə düşən cavab. Səhv — açar cavabdan fərqli işarələnmiş cavab.</dd>
          </div>
          <div>
            <dt>Boş və çoxlu işarə</dt>
            <dd>Boş — cavab verilməyən sual. Çoxlu işarə — bir sualda birdən çox variantın işarələnməsi.</dd>
          </div>
          <div>
            <dt>Reytinq</dt>
            <dd>Eyni imtahanda iştirak edən namizədlər arasında bal faizinizə görə yeriniz.</dd>
          </div>
        </dl>
      </section>

      <section className="result-help" aria-labelledby="result-questions">
        <h2 id="result-questions">Nəticə ilə razılaşmırsınız?</h2>
        <p>
          Bilet aldığınız filiala müraciət edin və bilet kodunu göstərin.
          Cavab kartınız şübhəli işarələrə görə manual yoxlamaya göndərilə bilər.
          Manual yoxlamanın nəticəsi bu səhifədə yenilənir.
        </p>
      </section>

      <footer className="result-footer">
        <p>Bu səhifə Hilal Kursları tərəfindən rəsmi nəticə elanıdır.</p>
        <p>Nəticə dərc edilmədikdə və ya məlumatlar uyğun gəlmədikdə heç bir nəticə göstərilmir.</p>
      </footer>
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
