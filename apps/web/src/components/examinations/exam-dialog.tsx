"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSession } from "@/components/session-provider";
import { Input } from "@/components/ui/input";

type ExamStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

type Exam = {
  id: string;
  code: string;
  title: string;
  description?: string;
  status: ExamStatus;
  price?: number | null;
};

interface ExamForm {
  price: string;
  code: string;
  title: string;
  description?: string;
  status: ExamStatus;
}

type ExamDialogProps = {
  examId?: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function ExamDialog(props: ExamDialogProps) {
  return <ExamDialogForm key={props.examId ?? "new"} {...props} />;
}

function ExamDialogForm({ examId, onClose, onSuccess }: ExamDialogProps) {
  const { request } = useSession();
  const [form, setForm] = useState<ExamForm>({
    price: "",
    code: "",
    title: "",
    description: "",
    status: "DRAFT",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (examId) {
      let cancelled = false;
      const fetchExam = async () => {
        try {
          const result = await request<Exam>(`/exams/${examId}`);
          if (!cancelled) {
            setForm({
              price:
                result.price == null ? "" : (result.price / 100).toFixed(2),
              code: result.code,
              title: result.title,
              description: result.description || "",
              status: result.status,
            });
          }
        } catch {
          if (!cancelled) setError("Sənəd məlumatları alınmadı.");
        }
      };
      void fetchExam();
      return () => {
        cancelled = true;
      };
    }
  }, [examId, request]);

  const handleInputChange = (e: React.ChangeEvent) => {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    if (target.type === "checkbox") {
      // No checkboxes in this form
    } else {
      setForm((prev) => ({ ...prev, [target.name]: target.value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const price = form.price.trim()
        ? Math.round(Number(form.price) * 100)
        : null;
      if (
        price !== null &&
        (!/^\d+(?:[.]\d{1,2})?$/.test(form.price) ||
          !Number.isSafeInteger(price))
      )
        throw new Error("Qiyməti AZN ilə daxil edin, ən çox 2 qəpik rəqəmi.");
      const payload = { ...form, price };
      if (examId) {
        await request(`/exams/${examId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await request("/exams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      setLoading(false);
      onSuccess();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Xəta baş verdi.");
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse rounded bg-muted/50 h-[200px] w-full mb-4" />
      </Card>
    );
  }

  return (
    <Card className="max-w-lg p-6">
      <h3 className="mb-4 text-lg font-medium">
        {examId ? "Sənəd redaktəsi" : "Yeni sənəd yaradılışı"}
      </h3>

      {error && (
        <div className="bg-destructive/10 text-destructive rounded p-3 mb-4">
          <span className="icon-destructive" aria-hidden="true" />{" "}
          <p>{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-4">
        <label htmlFor="exam-price">
          Qiymət (AZN; boş = təyin edilməyib, 0 = pulsuz)
        </label>
        <Input
          id="exam-price"
          name="price"
          inputMode="decimal"
          value={form.price}
          onChange={handleInputChange}
        />
        <Input
          aria-label="İmtahan kodu"
          name="code"
          placeholder="Sənəd kodu"
          value={form.code}
          onChange={handleInputChange}
          required
        />
        <Input
          aria-label="İmtahan adı"
          name="title"
          placeholder="Başlıq"
          value={form.title}
          onChange={handleInputChange}
          required
        />
        <Input
          aria-label="Qısa məlumat"
          name="description"
          placeholder="Əlavə məlumat"
          value={form.description}
          onChange={handleInputChange}
        />

        <select
          aria-label="İmtahan statusu"
          value={form.status}
          name="status"
          onChange={handleInputChange}
          className="mt-1 block w-full rounded border-input"
        >
          <option value="DRAFT">Əmrlənməyib</option>
          <option value="PUBLISHED">Yayınlanmış</option>
          <option value="ARCHIVED">Arxivləşdirilmiş</option>
        </select>

        <Button type="submit" className="mt-4 w-full">
          {examId ? "Dəyişdir" : "Yadda saxla"}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Bağla
        </Button>
      </form>
    </Card>
  );
}
