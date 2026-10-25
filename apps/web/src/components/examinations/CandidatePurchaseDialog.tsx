"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/components/session-provider";
import Link from "next/link";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+0-9()\-\s]{7,20}$/;

export type ExamSummary = {
  id: string;
  code: string;
  title: string;
  price: number;
  status: string;
};

type ExamSession = {
  id: string;
  examId: string;
  sessionCode: string;
  startsAt: string;
  endsAt: string;
  venue?: string | null;
  capacity: number;
  registered: number;
  status: "PLANNED" | "OPEN" | "CLOSED" | "CANCELLED";
};

type CreatedTicket = {
  id: string;
  code: string;
  price: number;
  status: string;
  paymentStatus: string;
  sessionCode?: string | null;
  candidateNumber?: string | null;
  candidateFullName?: string | null;
  qrToken?: string;
};

type CandidateForm = {
  full_name: string;
  email: string;
  phone: string;
};

const emptyForm: CandidateForm = { full_name: "", email: "", phone: "" };

function formatDateTime(value: string) {
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

function validate(
  form: CandidateForm,
  sessionId: string,
): string | null {
  if (!sessionId) return "Satış üçün sessiya seçin.";
  const name = form.full_name.trim();
  if (name.length < 3) return "Adı və soyadı ən azı 3 simvol olmalıdır.";
  if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) {
    return "Düzgün e-poçt ünvanı daxil edin.";
  }
  if (form.phone.trim() && !PHONE_PATTERN.test(form.phone.trim())) {
    return "Telefon nömrəsi düzgün deyil.";
  }
  return null;
}

export default function CandidatePurchaseDialog({
  exam,
  onClose,
}: {
  exam: ExamSummary;
  onClose: () => void;
}) {
  const { user, request, selectedBranch } = useSession();
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionId, setSessionId] = useState("");
  const [form, setForm] = useState<CandidateForm>(emptyForm);
  const [branchId, setBranchId] = useState(selectedBranch || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<CreatedTicket | null>(null);
  const [candidate, setCandidate] = useState<{
    id: string;
    candidate_number: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setSessionsLoading(true);
      try {
        const result = await request<ExamSession[]>(
          `/exam-sessions?examId=${exam.id}`,
        );
        if (!active) return;
        setSessions(result);
        const firstOpen = result.find((item) => item.status === "OPEN");
        if (firstOpen) setSessionId(firstOpen.id);
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Sessiyalar yüklənmədi.",
          );
        }
      } finally {
        if (active) setSessionsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [exam.id, request]);

  const effectiveBranchId =
    branchId || selectedBranch || user?.branches?.[0]?.id || "";

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const createTicket = useCallback(
    async (candidateId: string) => {
      const payload: Record<string, unknown> = {
        examId: exam.id,
        sessionId,
        candidateId,
        price: exam.price,
        type: "STANDARD",
        paymentMethod: "CASH",
      };
      if (effectiveBranchId) payload.branchId = effectiveBranchId;
      return request<CreatedTicket>("/ticket", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    [effectiveBranchId, exam.id, exam.price, request, sessionId],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const validationError = validate(form, sessionId);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      // If a previous attempt already created the candidate, reuse it so a
      // retry cannot create duplicate people.
      let candidateId = candidate?.id;
      if (!candidateId) {
        const candidatePayload: Record<string, unknown> = {
          full_name: form.full_name.trim(),
        };
        if (form.email.trim()) candidatePayload.email = form.email.trim();
        if (form.phone.trim()) candidatePayload.phone = form.phone.trim();
        if (effectiveBranchId) candidatePayload.branch_id = effectiveBranchId;

        const created = await request<{
          id: string;
          candidate_number: string;
        }>("/candidates", {
          method: "POST",
          body: JSON.stringify(candidatePayload),
        });
        candidateId = created.id;
        setCandidate({
          id: created.id,
          candidate_number: created.candidate_number,
        });
      }

      const createdTicket = await createTicket(candidateId);
      setTicket(createdTicket);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Bilet yaradıla bilmədi. Yenidən cəhd edin.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectedSession = sessions.find((item) => item.id === sessionId);
  const sessionFull = selectedSession
    ? selectedSession.registered >= selectedSession.capacity
    : false;

  if (ticket) {
    return (
      <Card className="mx-auto mt-6 w-full max-w-xl border-border">
        <div className="p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Bilet yaradıldı
          </p>
          <h3 className="mt-2 text-title font-medium">{exam.title}</h3>
          <p className="mt-1 text-caption text-muted-foreground">
            {exam.code}
            {ticket.sessionCode ? ` · ${ticket.sessionCode}` : ""}
          </p>

          <div className="mt-5 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-xs text-muted-foreground">
                  Bilet kodu
                </span>
                <p className="font-mono text-lg font-medium">{ticket.code}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground">Qiymət</span>
                <p className="text-lg font-medium">{ticket.price} AZN</p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Namizəd: </span>
                {ticket.candidateFullName ?? "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Nömrə: </span>
                {ticket.candidateNumber ?? "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Ödəniş: </span>
                {ticket.paymentStatus === "PENDING"
                  ? "Ödəniş gözlənilir (kassada qeydə alınmalıdır)"
                  : ticket.paymentStatus}
              </p>
              <p>
                <span className="text-muted-foreground">Status: </span>
                {ticket.status}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={`/tickets/${ticket.id}`}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Bileti aç və çap et
            </Link>
            <Button type="button" variant="outline" onClick={onClose}>
              Bağla
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Ödəniş yalnız kassada təsdiqləndikdən sonra “ödənilib” kimi
            qeydə alınır. Onlayn ödəniş bu versiyada mövcud deyil.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mx-auto mt-6 w-full max-w-xl border-border">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Bilet satışı
            </p>
            <h3 className="mt-1 text-title font-medium">{exam.title}</h3>
            <p className="text-caption text-muted-foreground">
              {exam.code} · {exam.price} AZN
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            Bağla
          </Button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {candidate && !ticket && (
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            Namizəd yaradıldı:{" "}
            <span className="font-medium">{candidate.candidate_number}</span>.
            Bilet yaradılmadı — yenidən cəhd edin, yeni namizəd
            yaradılmayacaq.
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
          <div>
            <label
              className="mb-2 block text-sm font-medium"
              htmlFor="purchase-session"
            >
              Sessiya
            </label>
            {sessionsLoading ? (
              <Skeleton className="h-10 w-full rounded-lg" />
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Bu imtahan üçün sessiya yoxdur.
              </p>
            ) : (
              <select
                id="purchase-session"
                value={sessionId}
                onChange={(event) => setSessionId(event.target.value)}
                disabled={submitting}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="">Sessiya seçin</option>
                {sessions.map((session) => (
                  <option
                    key={session.id}
                    value={session.id}
                    disabled={
                      session.status !== "OPEN" ||
                      session.registered >= session.capacity
                    }
                  >
                    {session.sessionCode} · {formatDateTime(session.startsAt)}
                    {session.venue ? ` · ${session.venue}` : ""} ·{" "}
                    {session.status}
                    {session.registered >= session.capacity
                      ? " · doludur"
                      : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label
              className="mb-2 block text-sm font-medium"
              htmlFor="purchase-full-name"
            >
              Adı və soyadı
            </label>
            <Input
              id="purchase-full-name"
              name="full_name"
              placeholder="Adı və soyadı"
              value={form.full_name}
              onChange={handleChange}
              autoComplete="name"
              disabled={submitting || Boolean(candidate)}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                className="mb-2 block text-sm font-medium"
                htmlFor="purchase-email"
              >
                E-poçt (istəyə bağlı)
              </label>
              <Input
                id="purchase-email"
                name="email"
                type="email"
                placeholder="ad@example.com"
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
                disabled={submitting || Boolean(candidate)}
              />
            </div>
            <div>
              <label
                className="mb-2 block text-sm font-medium"
                htmlFor="purchase-phone"
              >
                Telefon (istəyə bağlı)
              </label>
              <Input
                id="purchase-phone"
                name="phone"
                type="tel"
                placeholder="+994 50 000 00 00"
                value={form.phone}
                onChange={handleChange}
                autoComplete="tel"
                disabled={submitting || Boolean(candidate)}
              />
            </div>
          </div>

          {user?.branches && user.branches.length > 0 && (
            <div>
              <label
                className="mb-2 block text-sm font-medium"
                htmlFor="purchase-branch"
              >
                Filial
              </label>
              <select
                id="purchase-branch"
                value={effectiveBranchId}
                onChange={(event) => setBranchId(event.target.value)}
                disabled={submitting || Boolean(candidate)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="">Filial seçilməyib</option>
                {user.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {sessionFull && (
            <p className="text-sm text-destructive">
              Seçilmiş sessiya dolub. Başqa sessiya seçin.
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="submit"
              disabled={submitting || sessionsLoading || !sessionId || sessionFull}
            >
              {submitting ? "Yaradılır..." : "Bileti yarat"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Ləğv et
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
