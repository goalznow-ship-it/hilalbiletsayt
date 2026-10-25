"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Search, MapPin, Calendar, LoaderCircle } from "lucide-react";
import CandidatePurchaseDialog from "@/components/examinations/CandidatePurchaseDialog";

type Exam = {
  id: string;
  code: string;
  title: string;
  description?: string;
  price: number;
  branchName: string;
  date: string;
  startTime: string;
  location: string;
  capacity: number;
  registered: number;
  status: "PLANNED" | "OPEN" | "CLOSED" | "CANCELLED";
  sessions?: ExamSession[];
};

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

type FilterOptions = {
  branchId?: string;
  status?: string;
  search?: string;
};

export default function Page() {
  const { user, request } = useSession();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterOptions>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [showPurchase, setShowPurchase] = useState(false);
  const [selectedExam, setSelectedExam] = useState<ExamSummary | null>(null);
  const [selectedSession, setSelectedSession] = useState<ExamSession | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const searchParams = new URLSearchParams();
        if (filter.branchId) searchParams.append("branchId", filter.branchId);
        if (filter.status) searchParams.append("status", filter.status);
        if (searchQuery) searchParams.append("search", searchQuery);

        const result = await request<Exam[]>(`/exams?${searchParams.toString()}`);
        setExams(result);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Yüklənmədi.");
      } finally {
        setLoading(false);
      }
    };
    if (user) void load();
  }, [user, filter, searchQuery]);

  const statusLabels: Record<string, string> = {
    PLANNED: "Planlaşdırılıb",
    OPEN: "Açıqdır",
    CLOSED: "Bağlanıb",
    CANCELLED: "Läğv edilib",
  };

  const statusVariants: Record<string, string> = {
    PLANNED: "outline",
    OPEN: "secondary",
    CLOSED: "default",
    CANCELLED: "destructive",
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  if (!user) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl font-medium mb-2">Xoş gəlmisiniz</h2>
          <p className="text-muted-foreground">
            Filial administratorunuzla əlaqə saxlayın
          </p>
          <Link href="/login" className="btn-primary mt-4">
            Giriş
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="animate-pulse h-8 w-8 rounded-full" />
      </div>
    );
  }

  if (error && exams.length === 0) {
    return (
      <div className="min-h-screen p-8 text-center">
        <p className="text-destructive mb-4">{error}</p>
        <Button variant="outline" onClick={() => setFilter((prev) => ({ ...prev, status: undefined }))}>
          Yenidən cəhd et
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        eyebrow="HİLAL BİLET"
        title="İmtahanları Kəşf Et"
        description="Uyğun imtahanı seçin və bilet alın"
      />

      <div className="container mx-auto px-4 py-8">
        {/* Search and Filter Area */}
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <form
            onSubmit={(e) => e.preventDefault()}
            className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4"
          >
            <div>
              <Input
                placeholder="İmtahan axtar..."
                value={searchQuery}
                onChange={handleSearch}
                disabled={loading}
                className="flex-1"
              />
            </div>
            <div>
              <select
                value={filter.branchId || ""}
                onChange={(e) => setFilter((prev) => ({ ...prev, branchId: e.target.value || undefined }))}
                disabled={loading}
                className="h-10 rounded-lg border border-input px-3 text-sm"
              >
                <option value="">Bütün filiallar</option>
                {user.branches?.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <select
                value={filter.status || ""}
                onChange={(e) => setFilter((prev) => ({ ...prev, status: e.target.value || undefined }))}
                disabled={loading}
                className="h-10 rounded-lg border border-input px-3 text-sm"
              >
                <option value="">Bütün statuslar</option>
                <option value="OPEN">Açık</option>
                <option value="CLOSED">Bağlı</option>
                <option value="CANCELLED">Läğv edilib</option>
              </select>
            </div>
            <div>
              <Button type="submit" disabled={loading}>
                <LoaderCircle className="mr-2 h-4 w-4" />
                Filtrele
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFilter({ branchId: undefined, status: undefined, search: undefined })}
                disabled={loading}
              >
                Temizle
              </Button>
            </div>
          </form>
        </div>

        {/* Examination Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {exams.length === 0 ? (
            <div className="col-span-3 lg:col-span-3 text-center py-12 text-muted-foreground">
              <Skeleton className="animate-pulse h-8 w-8 rounded-full" />
              <p>İmtahan tapılmadı</p>
              <p className="mt-2">Filtrələri dəyişdərək yoxlayın</p>
            </div>
          ) : exams.map((exam) => (
            <Card
              key={exam.id}
              className="border rounded-lg border-border bg-card hover:border-primary transition-colors hover:bg-primary/5"
            >
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    <svg
                      className="h-6 w-6 text-primary"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      <circle cx="12" cy="19" r="4" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-title line-clamp-2">
                      {exam.code} - {exam.title}
                    </h3>
                    <p className="text-caption text-muted-foreground line-clamp-2">
                      {exam.description || "Açıklama yoxdur"}
                    </p>
                  </div>
                </div>

                {/* Metadata rows */}
                <div className="grid grid-cols-2 gap-3 text-caption mt-3">
                  <div>
                    <span className="text-muted-foreground text-xs block mb-1">Tarix</span>
                    <p className="font-medium">{exam.date}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs block mb-1">Saat</span>
                    <p className="font-medium">{exam.startTime}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs block mb-1">Məkan</span>
                    <p className="font-medium">{exam.location}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs block mb-1">Qiymət</span>
                    <p className="font-medium">{exam.price} AZN</p>
                  </div>
                </div>

                {/* Availability and CTA */}
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {(exam.sessions?.length || 0)} sessiya
                    </span>
                    {exam.registered > 0 && (
                      <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary">
                        {exam.registered} candidate
                      </span>
                    )}
                  </div>
                  <div>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => {
                        setSelectedExam({
                          id: exam.id,
                          code: exam.code,
                          title: exam.title,
                          price: exam.price,
                          date: exam.date,
                          startTime: exam.startTime,
                        });
                        setSelectedSession({
                          id: exam.sessions?.[0]?.id || "",
                          sessionCode: exam.sessions?.[0]?.sessionCode || "",
                          startsAt: exam.sessions?.[0]?.startsAt || "",
                          endsAt: exam.sessions?.[0]?.endsAt || "",
                          venue: exam.sessions?.[0]?.venue,
                          capacity: exam.sessions?.[0]?.capacity || 0,
                          registered: exam.sessions?.[0]?.registered || 0,
                          status: exam.sessions?.[0]?.status || "PLANNED",
                        });
                        setShowPurchase(true);
                      }}
                      disabled={exam.registered >= exam.capacity || !exam.sessions?.length}
                    >
                      {exam.registered >= exam.capacity ? "Məcburi" : "Bilet al"}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    {showPurchase && selectedExam && selectedSession && (
      <CandidatePurchaseDialog
        exam={selectedExam}
        session={selectedSession}
        onClose={() => setShowPurchase(false)}
        onPurchase={async () => {}}
      />
    )}
    </div>
  );
}
