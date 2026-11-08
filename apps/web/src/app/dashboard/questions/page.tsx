"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, Edit, Trash2 } from "lucide-react";
import { QuestionDialog } from "@/components/examinations/QuestionDialog";

type Question = {
  id: string;
  examId: string;
  question: string;
  variants: string;
  correct: number;
  points: number;
  isActive: boolean;
  createdAt: string;
  subject: string | null;
  topic: string | null;
  imageUrl: string | null;
};

type Exam = {
  id: string;
  code: string;
  title: string;
};

export default function QuestionsPage() {
  const { user, initializing, request } = useSession();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [examsLoading, setExamsLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");
  const [editQuestion, setEditQuestion] = useState<Question | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const loadExams = async () => {
      try {
        const result = await request<Exam[]>(`/exams`);
        if (active) setExams(Array.isArray(result) ? result : []);
      } catch (cause) {
        // Exam choices are required before a question can be created.
        if (active) setError(cause instanceof Error ? cause.message : "İmtahanlar yüklənmədi.");
      } finally {
        if (active) setExamsLoading(false);
      }
    };
    void loadExams();
    return () => {
      active = false;
    };
  }, [user, request]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "20");
        if (subject.trim()) params.set("subject", subject.trim());
        if (topic.trim()) params.set("topic", topic.trim());
        if (selectedExamId) params.append("examId", selectedExamId);
        if (searchQuery.trim()) params.append("search", searchQuery.trim());
        const result = await request<{ data: Question[]; total: number; totalPages: number }>(
          `/question${params.toString() ? `?${params}` : ""}`,
        );
        if (active) {
          setQuestions(Array.isArray(result?.data) ? result.data : []);
          setTotal(result.total); setTotalPages(result.totalPages);
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Yüklənmədi.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [user, request, selectedExamId, searchQuery, reload, page, subject, topic]);

  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-8 animate-pulse rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen p-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-2 text-xl font-medium">Xoş gəlmisiniz</h2>
          <p className="text-muted-foreground">Sual idarəetməsi üçün daxil olun.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        eyebrow="HİLAL BİLET"
        title="Sual bankı"
        description="İmtahan suallarını yaradın, redaktə edin və idarə edin"
      />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <form
            onSubmit={(event) => event.preventDefault()}
            className="grid grid-cols-1 gap-4 md:grid-cols-3"
            role="search"
          >
            <div>
              <label
                className="mb-2 block text-sm font-medium"
                htmlFor="exam-select"
              >
                İmtahan
              </label>
              {examsLoading ? (
                <Skeleton className="h-10 w-full rounded-lg" />
              ) : (
                <select
                  id="exam-select"
                  value={selectedExamId}
                  onChange={(event) => { setSelectedExamId(event.target.value); setPage(1); }}
                  disabled={loading}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">Bütün imtahanlar</option>
                  {exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.code} - {exam.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label
                className="mb-2 block text-sm font-medium"
                htmlFor="question-search"
              >
                Axtarış
              </label>
              <Input
                id="question-search"
                placeholder="Sual axtar..."
                value={searchQuery}
                onChange={(event) => { setSearchQuery(event.target.value); setPage(1); }}
              />
            </div>
            <div><label htmlFor="subject-filter">Fənn</label>
              <Input id="subject-filter" value={subject} onChange={event => { setSubject(event.target.value); setPage(1); }} /></div>
            <div><label htmlFor="topic-filter">Mövzu</label>
              <Input id="topic-filter" value={topic} onChange={event => { setTopic(event.target.value); setPage(1); }} /></div>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSelectedExamId("");
                  setSearchQuery("");
                  setSubject(""); setTopic(""); setPage(1);
                }}
                disabled={loading}
              >
                <Search className="mr-2 h-4 w-4" />
                Təmizlə
              </Button>
            </div>
          </form>
        </div>

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Sual siyahısı ({total})</h2>
          <Button onClick={() => setEditQuestion({} as Question)} disabled={!selectedExamId}>
            <Plus className="mr-2 h-4 w-4" />
            Yeni sual
          </Button>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-full mb-1" />
                <Skeleton className="h-3 w-1/2" />
              </Card>
            ))}
          </div>
        ) : questions.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <p>Sual tapılmadı</p>
            <p className="mt-2">İmtahan seçin və ya yeni sual yaradın</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {questions.map((question) => (
              <Card key={question.id} className="p-4">
                <p className="text-sm text-muted-foreground">{[question.subject, question.topic].filter(Boolean).join(" · ")}</p>
                {question.imageUrl && <img src={question.imageUrl} alt="Sualın şəkli" loading="lazy" referrerPolicy="no-referrer" className="max-h-60 max-w-full object-contain" />}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-medium text-title">
                      {question.question}
                    </p>
                    <p className="line-clamp-1 text-caption text-muted-foreground mt-1">
                      {question.variants.split("|").join(", ")}
                    </p>
                  </div>
                  <span
                    className={`whitespace-nowrap rounded px-2 py-1 text-xs ${
                      question.isActive
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {question.isActive ? "Aktiv" : "Passiv"}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between text-caption">
                  <span className="text-muted-foreground">
                    Bal: {question.points} | Düzgün: {question.correct}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Sualı redaktə et"
                      onClick={() => setEditQuestion(question)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Sualı deaktiv et"
                      disabled={Boolean(busy)}
                      onClick={async () => {
                        if (window.confirm("Sual silinsin?")) {
                          setBusy(question.id); setError("");
                          try {
                            await request(`/question/${question.id}`, { method: "DELETE" });
                            setReload(value => value + 1);
                          } catch (cause) { setError(cause instanceof Error ? cause.message : "Sual deaktiv edilmədi."); }
                          finally { setBusy(""); }
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {editQuestion && (
        <QuestionDialog
          examId={editQuestion.examId || selectedExamId}
          questionId={editQuestion.id || undefined}
          onClose={() => setEditQuestion(null)}
          onSuccess={() => {
            setEditQuestion(null);
            setReload(value => value + 1);
          }}
        />
      )}
      <nav aria-label="Sual səhifələri" className="flex items-center justify-center gap-4 p-4">
        <Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Əvvəlki</Button>
        <span>{page} / {totalPages}</span>
        <Button variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}>Növbəti</Button>
      </nav>
    </div>
  );
}
