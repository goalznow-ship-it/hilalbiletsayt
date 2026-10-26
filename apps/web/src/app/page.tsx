"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  publicRequest,
  sessionDate,
  type PublicExam,
  type PublicBranch,
} from "@/lib/public-sales";
import { formatAzn } from "@/lib/money";

export default function HomePage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<{
    exams: PublicExam[];
    branches: PublicBranch[];
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [exam, setExam] = useState<PublicExam | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const pending = useRef(false);
  const purchase = useRef<{ payload: string; key: string } | null>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    publicRequest<{ exams: PublicExam[]; branches: PublicBranch[] }>("/exams")
      .then((data) => {
        if (active) {
          setCatalog(data);
          setError("");
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (exam) formHeading.current?.focus();
  }, [exam]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setFormError("");
    const name = fullName.trim().replace(/\s+/g, " ");
    const mobile = phone.replace(/[\s()\-]/g, "");
    if (name.length < 3) {
      setFormError("Namizədin adını və soyadını daxil edin (ən azı 3 simvol).");
      return;
    }
    if (!/^(?:\+994|0)(?:10|50|51|55|60|70|77|99)\d{7}$/.test(mobile)) {
      setFormError(
        "Düzgün Azərbaycan mobil nömrəsi daxil edin. Məsələn: 0501234567.",
      );
      return;
    }
    if (!sessionId || !branchId) {
      setFormError("Sessiya və ödəniş filialını seçin.");
      return;
    }
    pending.current = true;
    setSubmitting(true);
    const data = { sessionId, branchId, fullName: name, phone: mobile };
    const payload = JSON.stringify(data);
    try {
      // Persist the key before sending: a lost response or reload must not create another order.
      const saved =
        purchase.current ??
        JSON.parse(sessionStorage.getItem("hilal.purchase") || "null");
      const order =
        saved?.payload === payload
          ? saved
          : { payload, key: crypto.randomUUID() };
      purchase.current = order;
      sessionStorage.setItem("hilal.purchase", JSON.stringify(order));
      const result = await publicRequest<{ receiptToken: string }>("/orders", {
        method: "POST",
        body: JSON.stringify({ ...data, purchaseKey: order.key }),
      });
      router.push(`/orders/${result.receiptToken}`);
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : "Sifariş tamamlanmadı. Yenidən cəhd edin.",
      );
      pending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="public-site">
      <a className="skip-link" href="#exams">
        İmtahanlara keç
      </a>
      <header className="public-header">
        <Link href="/" className="public-brand">
          <Image
            src="/branding/hilal-logo.png"
            alt="Hilal"
            width={46}
            height={46}
            priority
          />
          <span>Hilal Bilet</span>
        </Link>
        <nav aria-label="Əsas menyu">
          <a href="#exams">İmtahanlar</a>
          <Link href="/tickets/verify">Biletimi yoxla</Link>
          <Link href="/login">İdarəetmə paneli</Link>
        </nav>
      </header>
      <main className="public-main">
        <section className="public-hero">
          <h1>
            İmtahana doğru
            <br />
            ilk addım.
          </h1>
          <p>
            İmtahanınızı və sessiyanızı seçin, bileti adınıza sifariş edin.
            Hesab yaratmağa ehtiyac yoxdur.
          </p>
          <Button render={<a href="#exams" />}>İmtahanlara bax</Button>
        </section>
        <section id="exams" aria-labelledby="exams-title">
          <div className="public-section-title">
            <h2 id="exams-title">İmtahanlar</h2>
            <p>Satışa açıq sessiyalar · Bakı vaxtı</p>
          </div>
          {error ? (
            <div role="alert" className="public-notice">
              <p>{error}</p>
              <Button
                variant="outline"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Yenidən yoxla
              </Button>
            </div>
          ) : !catalog ? (
            <p role="status">İmtahanlar yüklənir…</p>
          ) : catalog.exams.length === 0 ? (
            <div className="public-notice">
              <h3>Hazırda satışa açıq imtahan yoxdur</h3>
              <p>Yeni sessiyalar dərc edildikdə burada görünəcək.</p>
            </div>
          ) : (
            <div className="public-exams">
              {catalog.exams.map((item) => (
                <Card key={item.id} className="public-exam">
                  <span className="text-sm text-muted-foreground">
                    {item.code}
                  </span>
                  <h3>{item.title}</h3>
                  {item.description && <p>{item.description}</p>}
                  <ul>
                    {item.sessions.map((session) => (
                      <li key={session.id}>
                        <strong>{sessionDate(session.startsAt)}</strong>
                        <span>
                          {session.sessionCode}
                          {session.venue ? ` · ${session.venue}` : ""}
                        </span>
                        <span>{session.remaining} boş yer</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm">
                    Ödəniş filialları:{" "}
                    {catalog.branches.map((branch) => branch.name).join(", ") ||
                      "Aktiv filial yoxdur"}
                  </p>
                  <div className="public-exam-action">
                    <strong>{formatAzn(item.price)}</strong>
                    <Button
                      disabled={!catalog.branches.length || submitting}
                      onClick={() => {
                        setExam(item);
                        setSessionId(item.sessions[0].id);
                        setBranchId(catalog.branches[0]?.id ?? "");
                        setFormError("");
                      }}
                    >
                      Bilet al
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
        {exam && (
          <section className="public-order" aria-labelledby="order-title">
            <Card className="p-6 sm:p-8">
              <h2 ref={formHeading} tabIndex={-1} id="order-title">
                Bilet sifarişi
              </h2>
              <p>
                {exam.title} · {formatAzn(exam.price)}
              </p>
              <form onSubmit={submit} noValidate className="public-form">
                <fieldset disabled={submitting}>
                  <label htmlFor="session">Sessiya</label>
                  <select
                    id="session"
                    value={sessionId}
                    onChange={(event) => setSessionId(event.target.value)}
                  >
                    {exam.sessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {sessionDate(session.startsAt)} · {session.sessionCode}{" "}
                        · {session.remaining} boş yer
                      </option>
                    ))}
                  </select>
                  <label htmlFor="candidate-name">
                    Namizədin adı və soyadı
                  </label>
                  <Input
                    id="candidate-name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    maxLength={150}
                    autoComplete="name"
                    required
                  />
                  <label htmlFor="parent-phone">Valideynin mobil nömrəsi</label>
                  <Input
                    id="parent-phone"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="0501234567"
                    autoComplete="tel"
                    maxLength={25}
                    required
                  />
                  <label htmlFor="payment-branch">Ödəniş ediləcək filial</label>
                  <select
                    id="payment-branch"
                    value={branchId}
                    onChange={(event) => setBranchId(event.target.value)}
                  >
                    {catalog?.branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                        {branch.address ? ` — ${branch.address}` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="public-notice">
                    Onlayn ödəniş mövcud deyil. Sifarişdən sonra seçdiyiniz
                    filialın kassasına bilet kodunu təqdim edin. Əməkdaş ödənişi
                    təsdiqləyənədək ödəniş gözlənilir.
                  </p>
                  {formError && (
                    <p role="alert" className="text-destructive">
                      {formError}
                    </p>
                  )}
                  <Button type="submit">
                    {submitting ? "Sifariş göndərilir…" : "Bileti sifariş et"}
                  </Button>
                </fieldset>
              </form>
            </Card>
          </section>
        )}
      </main>
      <footer className="public-footer">
        Hilal Kursları · İmtahan biletləri
      </footer>
    </div>
  );
}
