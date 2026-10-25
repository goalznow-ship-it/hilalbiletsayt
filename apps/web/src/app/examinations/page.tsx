"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Search, LoaderCircle } from "lucide-react";
import CandidatePurchaseDialog, {
  type ExamSummary,
} from "@/components/examinations/CandidatePurchaseDialog";
import { formatAzn, isValidQepikPrice } from "@/lib/money";

type Exam = {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  price: number | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | string;
  createdAt?: string;
  sessionCount: number;
};

type FilterOptions = {
  status?: string;
  search?: string;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Qaralama",
  PUBLISHED: "Dərc edilib",
  ARCHIVED: "Arxivlənib",
};

const STATUS_CLASSES: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PUBLISHED: "bg-primary/10 text-primary",
  ARCHIVED: "bg-muted text-muted-foreground",
};

export default function Page() {
  const { user, initializing, request } = useSession();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterOptions>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedExam, setSelectedExam] = useState<ExamSummary | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const searchParams = new URLSearchParams();
        if (filter.status) searchParams.append("status", filter.status);
        if (searchQuery.trim()) {
          searchParams.append("search", searchQuery.trim());
        }
        const query = searchParams.toString();
        const result = await request<Exam[]>(
          `/exams${query ? `?${query}` : ""}`,
        );
        if (active) setExams(Array.isArray(result) ? result : []);
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
  }, [user, request, filter, searchQuery]);

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
          <p className="text-muted-foreground">
            Bilet satışı üçün filial əməkdaşı hesabı ilə daxil olun.
          </p>
          <Link href="/login" className="mt-4 inline-flex text-primary">
            Giriş
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-8 animate-pulse rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        eyebrow="HİLAL BİLET"
        title="İmtahanlar"
        description="Namizədi qeydə alın və bilet satın"
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
                htmlFor="exam-search"
              >
                Axtarış
              </label>
              <Input
                id="exam-search"
                placeholder="İmtahan axtar..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                disabled={loading}
              />
            </div>
            <div>
              <label
                className="mb-2 block text-sm font-medium"
                htmlFor="exam-status"
              >
                Status
              </label>
              <select
                id="exam-status"
                value={filter.status || ""}
                onChange={(event) =>
                  setFilter((previous) => ({
                    ...previous,
                    status: event.target.value || undefined,
                  }))
                }
                disabled={loading}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="">Bütün statuslar</option>
                <option value="DRAFT">Qaralama</option>
                <option value="PUBLISHED">Dərc edilib</option>
                <option value="ARCHIVED">Arxivlənib</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFilter({});
                  setSearchQuery("");
                }}
                disabled={loading}
              >
                <Search className="mr-2 h-4 w-4" />
                Təmizlə
              </Button>
            </div>
          </form>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {exams.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <p>İmtahan tapılmadı</p>
            <p className="mt-2">Filtrələri dəyişdirərək yoxlayın</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {exams.map((exam) => {
              const sellablePrice =
                exam.price !== null && isValidQepikPrice(exam.price)
                  ? exam.price
                  : null;
              const sellable =
                exam.status === "PUBLISHED" &&
                exam.sessionCount > 0 &&
                sellablePrice !== null;
              return (
                <Card
                  key={exam.id}
                  className="rounded-lg border border-border bg-card transition-colors hover:border-primary"
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 font-medium text-title">
                          {exam.code} - {exam.title}
                        </h3>
                        <p className="line-clamp-2 text-caption text-muted-foreground">
                          {exam.description || "Açıqlama yoxdur"}
                        </p>
                      </div>
                      <span
                        className={`whitespace-nowrap rounded px-2 py-1 text-xs ${
                          STATUS_CLASSES[exam.status] ??
                          "bg-muted text-muted-foreground"
                        }`}
                      >
                        {STATUS_LABELS[exam.status] ?? exam.status}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-caption">
                      <div>
                        <span className="mb-1 block text-xs text-muted-foreground">
                          Qiymət
                        </span>
                        <p className="font-medium">{formatAzn(exam.price)}</p>
                      </div>
                      <div>
                        <span className="mb-1 block text-xs text-muted-foreground">
                          Sessiyalar
                        </span>
                        <p className="font-medium">{exam.sessionCount}</p>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-border pt-4">
                      <Button
                        size="sm"
                        onClick={() => {
                          if (sellablePrice === null) return;
                          setSelectedExam({
                            id: exam.id,
                            code: exam.code,
                            title: exam.title,
                            price: sellablePrice,
                            status: exam.status,
                          });
                        }}
                        disabled={!sellable}
                        title={
                          sellable
                            ? "Bilet satışı"
                            : "Satış üçün dərc edilmiş imtahan və sessiya tələb olunur"
                        }
                      >
                        <LoaderCircle className="mr-2 h-4 w-4" />
                        {sellable ? "Bilet al" : "Satış bağlıdır"}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {selectedExam && (
        <div className="container mx-auto px-4 pb-12">
          <CandidatePurchaseDialog
            exam={selectedExam}
            onClose={() => setSelectedExam(null)}
          />
        </div>
      )}
    </div>
  );
}
