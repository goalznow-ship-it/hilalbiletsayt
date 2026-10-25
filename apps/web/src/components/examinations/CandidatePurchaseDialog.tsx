"use client";

import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import { useRouter } from "next/router";

type ExamSession = {
  id: string;
  sessionCode: string;
  startsAt: string;
  endsAt: string;
  venue?: string;
  capacity: number;
  registered: number;
  status: "PLANNED" | "OPEN" | "CLOSED";
};

type ExamSummary = {
  id: string;
  code: string;
  title: string;
  price: number;
  date: string;
  startTime: string;
};

type CandidateFormValues = {
  fullName: string;
  candidateNumber: string;
  email?: string;
  phone?: string;
};

export function CandidatePurchaseDialog({
  exam,
  session,
  onClose,
  onPurchase,
}: {
  exam: ExamSummary;
  session: ExamSession;
  onClose: () => void;
  onPurchase: (candidateData: CandidateFormValues) => Promise<void>;
}) {
  const { user, request } = useSession();
  const [form, setForm] = useState<CandidateFormValues>({
    fullName: "",
    candidateNumber: "",
    email: "",
    phone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target;
      setForm((prev) => ({ ...prev, [name]: value }));
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      setError(null);

      if (!form.fullName) {
        setError("Adı soyadı requerida");
        setSubmitting(false);
        return;
      }

      try {
        // Create candidate via API
        const candidateData = await request("/candidates", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fullName: form.fullName,
            candidateNumber: form.candidateNumber,
            email: form.email,
            phone: form.phone,
            branchId: user?.branches?.[0]?.id,
          }),
        });

        // Create ticket via API
        const ticketData = await request("/ticket", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            examId: exam.id,
            sessionId: session.id,
            candidateId: (candidateData as { id: string }).id,
            branchId: user?.branches?.[0]?.id || "",
            price: exam.price,
            paymentMethod: "manual",
          }),
        });

        // On success - show ticket and close
        onPurchase?.(form);
        onClose();
        const ticketId = (ticketData as { id: string }).id;
        router.push(`/tickets/${ticketId}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Xəta baş verdi";
        setError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [user, session, exam, request],
  );

  return (
    <Card className="max-w-md">
      <div className="p-6">
        <h3 className="mb-4 text-lg font-medium">
          {session.sessionCode} - {exam.title}
        </h3>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-100 text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Adı Soyadı
            </label>
            <Input
              placeholder="Adı Soyadı"
              value={form.fullName}
              onChange={handleChange}
              name="fullName"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Nömrə
            </label>
            <Input
              placeholder="Nömrə"
              value={form.candidateNumber}
              onChange={handleChange}
              name="candidateNumber"
              required
              disabled
            />
            <input type="hidden" name="candidateNumber" value={form.candidateNumber} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Email
            </label>
            <Input
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={handleChange}
              name="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Telefon
            </label>
            <Input
              placeholder="Telefon"
              type="tel"
              value={form.phone}
              onChange={handleChange}
              name="phone"
            />
          </div>

          <div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Yaradılıb..." : "Yarad"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Läğv et
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}

export default CandidatePurchaseDialog;