"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/components/session-provider";
import { Textarea } from "@/components/ui/textarea";

type Question = {
  id: string;
  examId: string;
  question: string;
  variants: string;
  correct: number;
  points: number;
  isActive: boolean;
  subject: string | null;
  topic: string | null;
  imageUrl: string | null;
};

interface QuestionForm {
  subject: string;
  topic: string;
  imageUrl: string;
  question: string;
  variants: string;
  correct: number;
  points: number;
  isActive: boolean;
}

interface QuestionDialogProps {
  examId: string;
  questionId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function QuestionDialog({ examId, questionId, onClose, onSuccess }: QuestionDialogProps) {
  const { request } = useSession();
  const [form, setForm] = useState<QuestionForm>({
    subject: "", topic: "", imageUrl: "",
    question: "",
    variants: "",
    correct: 1,
    points: 1,
    isActive: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(!questionId);

  useEffect(() => {
    if (questionId) {
      let cancelled = false;
      const fetchQuestion = async () => {
        try {
          const result = await request<Question>(`/question/${questionId}`);
          if (!cancelled) {
            setForm({
              question: result.question,
              variants: result.variants,
              correct: result.correct,
              points: result.points,
              isActive: result.isActive,
              subject: result.subject ?? "", topic: result.topic ?? "", imageUrl: result.imageUrl ?? "",
            });
            setLoaded(true);
          }
        } catch {
          if (!cancelled) setError("Sual məlumatları alınmadı.");
        }
      };
      void fetchQuestion();
      return () => {
        cancelled = true;
      };
    }
  }, [questionId, request]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const target = e.target;
    const name = target.name;
    const value = target.type === "checkbox" ? (target as HTMLInputElement).checked
      : ["correct", "points"].includes(name) ? Number(target.value) : target.value;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loaded || loading) return;
    setError("");
    setLoading(true);

    try {
      const variants = form.variants.trim().split("|").filter(v => v.trim()).join("|");
      const variantCount = variants.split("|").length;
      
      if (variantCount < 2 || variantCount > 5) {
        throw new Error("2–5 variant tələb olunur (| ilə ayrılmaqla)");
      }
      
      if (form.correct < 1 || form.correct > variantCount) {
        throw new Error(`Düzgün cavab nömrəsi 1-${variantCount} aralığında olmalıdır`);
      }

      if (form.points < 1) {
        throw new Error("Bal ən azı 1 olmalıdır");
      }

      const payload = { ...form, examId, variants, subject: form.subject.trim() || null,
        topic: form.topic.trim() || null, imageUrl: form.imageUrl.trim() || null };
      const url = questionId ? `/question/${questionId}` : "/question";
      const method = questionId ? "PATCH" : "POST";

      await request(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setLoading(false);
      onSuccess();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Xəta baş verdi.");
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-2xl p-6">
      <h3 className="mb-4 text-lg font-medium">
        {questionId ? "Sual redaktəsi" : "Yeni sual yaradılması"}
      </h3>

      {error && (
        <div role="alert" className="bg-destructive/10 text-destructive rounded p-3 mb-4">
          {error}
        </div>
      )}

      {!loaded && !error && <p role="status">Sual yüklənir…</p>}
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="question-subject">Fənn</Label>
            <Input id="question-subject" name="subject" maxLength={120} value={form.subject} onChange={handleInputChange} /></div>
          <div><Label htmlFor="question-topic">Mövzu</Label>
            <Input id="question-topic" name="topic" maxLength={160} value={form.topic} onChange={handleInputChange} /></div>
        </div>
        <div><Label htmlFor="question-image">Şəkil keçidi (HTTPS)</Label>
          <Input id="question-image" name="imageUrl" type="url" maxLength={2048} value={form.imageUrl} onChange={handleInputChange} />
        </div>
        <div>
          <Label htmlFor="question-text">Sual mətni</Label>
          <Textarea
            id="question-text"
            name="question"
            placeholder="Sual mətni daxil edin"
            value={form.question}
            onChange={handleInputChange}
            required
            rows={3}
          />
        </div>

        <div>
          <Label htmlFor="question-variants">Variantlar (| ilə ayrılmaqla, nümunə: A) Cavab 1|B) Cavab 2|C) Cavab 3|D) Cavab 4|E) Cavab 5)</Label>
          <Textarea
            id="question-variants"
            name="variants"
            placeholder="Variantları | ilə ayıraraq daxil edin"
            value={form.variants}
            onChange={handleInputChange}
            required
            rows={4}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="question-correct">Düzgün cavab nömrəsi</Label>
            <select
              id="question-correct"
              name="correct"
              value={form.correct}
              onChange={handleInputChange}
              className="h-10 w-full rounded border-input bg-background px-3 text-sm"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="question-points">Bal</Label>
            <Input
              id="question-points"
              name="points"
              type="number"
              min="1"
              value={form.points}
              onChange={handleInputChange}
              required
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="question-active"
            name="isActive"
            checked={form.isActive}
            onChange={handleInputChange}
            className="h-4 w-4"
          />
          <Label htmlFor="question-active">Aktivdir</Label>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={loading || !loaded}>
            {loading ? "Saxlanılır…" : questionId ? "Yadda saxla" : "Yarad"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Ləğv et
          </Button>
        </div>
      </form>
    </Card>
  );
}
