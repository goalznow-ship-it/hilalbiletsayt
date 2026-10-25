"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-ui";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";

type Exam = {
  id: string;
  code: string;
  title: string;
  description?: string;
  status: string;
  createdAt: string;
};

type SessionStatus = "PLANNED" | "OPEN" | "CLOSED" | "CANCELLED";

type ExamSession = {
  id: string;
  examId: string;
  sessionCode: string;
  startsAt: string;
  endsAt: string;
  venue?: string | null;
  capacity: number;
  status: SessionStatus;
};

const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  PLANNED: "Planlaşdırılıb",
  OPEN: "Açıqdır",
  CLOSED: "Bağlanıb",
  CANCELLED: "Ləğv edilib",
};

const SESSION_STATUS_VARIANTS: Record<
  SessionStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  PLANNED: "outline",
  OPEN: "secondary",
  CLOSED: "default",
  CANCELLED: "destructive",
};

export default function Page() {
  const { request, user } = useSession();
  const [exams, setExams] = useState<Exam[]>([]);
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [busySessionId, setBusySessionId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    examId: "",
    sessionCode: "",
    startsAt: "",
    endsAt: "",
    venue: "",
    capacity: "100",
  });

  const roles = user?.roles ?? (user?.role ? [user.role] : []);
  const canManageSessions = roles.some((role) =>
    ["SUPER_ADMIN", "CENTRAL_ADMIN"].includes(role),
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const examsQuery =
          (search ? `search=${encodeURIComponent(search)}&` : "") +
          (statusFilter ? `status=${statusFilter}&` : "");
        const [examsResult, sessionsResult] = await Promise.all([
          request<Exam[]>(`/exams?${examsQuery}`),
          request<ExamSession[]>("/exam-sessions"),
        ]);
        setExams(examsResult);
        setSessions(sessionsResult);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Yüklənmədi.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [request, search, statusFilter, reloadKey]);

  const changeSessionStatus = async (
    session: ExamSession,
    status: Exclude<SessionStatus, "PLANNED">,
  ) => {
    if (
      status === "CANCELLED" &&
      !window.confirm("Sessiyanı ləğv etmək istəyirsiniz?")
    ) {
      return;
    }

    setBusySessionId(session.id);
    setError("");
    setNotice("");
    try {
      await request<ExamSession>(`/exam-sessions/${session.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setNotice(
        status === "OPEN"
          ? "Sessiya qeydiyyata açıldı."
          : status === "CLOSED"
            ? "Sessiya bağlandı."
            : "Sessiya ləğv edildi.",
      );
      setReloadKey((key) => key + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Sessiya statusu dəyişdirilmədi.",
      );
    } finally {
      setBusySessionId("");
    }
  };

  const createSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageSessions) return;
    const startsAt = new Date(sessionForm.startsAt);
    const endsAt = new Date(sessionForm.endsAt);
    const capacity = Number(sessionForm.capacity);
    if (
      !Number.isFinite(startsAt.getTime()) ||
      !Number.isFinite(endsAt.getTime()) ||
      startsAt >= endsAt ||
      !Number.isInteger(capacity) ||
      capacity < 1
    ) {
      setError("Tarix aralığını və müsbət tam ədəd olan tutumu yoxlayın.");
      return;
    }
    setCreatingSession(true);
    setError("");
    setNotice("");
    try {
      await request<ExamSession>("/exam-sessions", {
        method: "POST",
        body: JSON.stringify({
          ...sessionForm,
          sessionCode: sessionForm.sessionCode.trim(),
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          capacity,
        }),
      });
      setShowSessionForm(false);
      setNotice("Planlaşdırılmış sessiya yaradıldı.");
      setReloadKey((key) => key + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sessiya yaradılmadı.");
    } finally {
      setCreatingSession(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <div className="skeleton min-h-[400px] animate-pulse" />
      </Card>
    );
  }

  if (error && exams.length === 0 && sessions.length === 0) {
    return (
      <Card>
        <div className="p-4 text-destructive" role="alert">
          <span className="icon-destructive" aria-hidden="true" />
          <p>{error}</p>
          <Button
            variant="outline"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Yenidən cəhd et
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <PageHeader
        eyebrow="İMTAHAN İDARƏETMƏSİ"
        title="İmtahanlar və sessiyalar"
        description="İmtahanları və sessiya həyat dövrünü idarə edin."
        action={
          canManageSessions ? (
            <Button onClick={() => setShowSessionForm((value) => !value)}>
              {showSessionForm ? "Formanı bağla" : "Yeni sessiya"}
            </Button>
          ) : undefined
        }
      />

      {notice && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-success/40 bg-success/10 p-3 text-sm"
        >
          {notice}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          {error}
        </div>
      )}

      {canManageSessions && showSessionForm && (
        <form
          onSubmit={createSession}
          className="mb-6 grid gap-4 rounded-lg border border-border p-4 md:grid-cols-2"
          aria-busy={creatingSession}
        >
          <label className="field">
            İmtahan
            <select
              required
              disabled={creatingSession}
              value={sessionForm.examId}
              onChange={(e) =>
                setSessionForm({ ...sessionForm, examId: e.target.value })
              }
            >
              <option value="">İmtahan seçin</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.code} — {exam.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Sessiya kodu
            <Input
              required
              maxLength={50}
              disabled={creatingSession}
              value={sessionForm.sessionCode}
              onChange={(e) =>
                setSessionForm({ ...sessionForm, sessionCode: e.target.value })
              }
            />
          </label>
          <label className="field">
            Başlama vaxtı
            <Input
              type="datetime-local"
              required
              disabled={creatingSession}
              value={sessionForm.startsAt}
              onChange={(e) =>
                setSessionForm({ ...sessionForm, startsAt: e.target.value })
              }
            />
          </label>
          <label className="field">
            Bitmə vaxtı
            <Input
              type="datetime-local"
              required
              disabled={creatingSession}
              value={sessionForm.endsAt}
              onChange={(e) =>
                setSessionForm({ ...sessionForm, endsAt: e.target.value })
              }
            />
          </label>
          <label className="field">
            Məkan
            <Input
              maxLength={200}
              disabled={creatingSession}
              value={sessionForm.venue}
              onChange={(e) =>
                setSessionForm({ ...sessionForm, venue: e.target.value })
              }
            />
          </label>
          <label className="field">
            Tutum
            <Input
              type="number"
              min={1}
              step={1}
              required
              disabled={creatingSession}
              value={sessionForm.capacity}
              onChange={(e) =>
                setSessionForm({ ...sessionForm, capacity: e.target.value })
              }
            />
          </label>
          <p className="text-sm text-muted-foreground md:col-span-2">
            Vaxtlar cihazınızın yerli saat qurşağında daxil edilir. Yeni sessiya
            planlaşdırılmış vəziyyətdə yaradılır.
          </p>
          <Button
            type="submit"
            disabled={creatingSession || exams.length === 0}
          >
            {creatingSession ? "Yaradılır…" : "Sessiyanı yarat"}
          </Button>
        </form>
      )}
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input
          placeholder="İmtahan kodu və ya başlığı..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={loading}
        />
        <select
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
          value={statusFilter ?? ""}
          onChange={(event) => setStatusFilter(event.target.value || null)}
          disabled={loading}
        >
          <option value="">Bütün statuslar</option>
          <option value="DRAFT">Qaralama</option>
          <option value="PUBLISHED">Yayımlanmış</option>
          <option value="ARCHIVED">Arxivləşdirilmiş</option>
        </select>
      </div>

      <table className="w-full caption-bottom">
        <thead>
          <tr className="border-b">
            <th className="p-3 text-left font-medium">İmtahan kodu</th>
            <th className="p-3 text-left font-medium">Başlıq</th>
            <th className="p-3 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {exams.map((exam) => (
            <tr key={exam.id} className="border-b">
              <td className="p-3">{exam.code}</td>
              <td className="p-3">{exam.title}</td>
              <td className="p-3">
                {exam.status === "DRAFT" ? (
                  <Badge variant="outline">Qaralama</Badge>
                ) : exam.status === "PUBLISHED" ? (
                  <Badge variant="secondary">Yayımlanmış</Badge>
                ) : (
                  <Badge variant="destructive">Arxivləşdirilmiş</Badge>
                )}
              </td>
            </tr>
          ))}
          {exams.length === 0 && (
            <tr>
              <td colSpan={3} className="p-6 text-center text-muted-foreground">
                Heç bir imtahan tapılmadı.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-6">
        <h3 className="mb-3 font-medium">İmtahan sessiyaları</h3>
        <div className="overflow-x-auto">
          <table className="w-full caption-bottom">
            <thead>
              <tr className="border-b">
                <th className="p-3 text-left font-medium">Sessiya kodu</th>
                <th className="p-3 text-left font-medium">Başlama</th>
                <th className="p-3 text-left font-medium">Bitmə</th>
                <th className="p-3 text-left font-medium">Məkan</th>
                <th className="p-3 text-left font-medium">Tutum</th>
                <th className="p-3 text-left font-medium">Status</th>
                <th className="p-3 text-left font-medium">Əməliyyat</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-b">
                  <td className="p-3 font-mono text-sm">
                    {session.sessionCode}
                  </td>
                  <td className="p-3">
                    {new Date(session.startsAt).toLocaleString("az-AZ")}
                  </td>
                  <td className="p-3">
                    {new Date(session.endsAt).toLocaleString("az-AZ")}
                  </td>
                  <td className="p-3">{session.venue || "—"}</td>
                  <td className="p-3">{session.capacity}</td>
                  <td className="p-3">
                    <Badge variant={SESSION_STATUS_VARIANTS[session.status]}>
                      {SESSION_STATUS_LABELS[session.status]}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {canManageSessions ? (
                      <div className="flex flex-wrap gap-2">
                        {session.status === "PLANNED" && (
                          <Button
                            size="sm"
                            onClick={() =>
                              void changeSessionStatus(session, "OPEN")
                            }
                            disabled={busySessionId === session.id}
                          >
                            Aç
                          </Button>
                        )}
                        {session.status === "OPEN" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void changeSessionStatus(session, "CLOSED")
                            }
                            disabled={busySessionId === session.id}
                          >
                            Bağla
                          </Button>
                        )}
                        {(session.status === "PLANNED" ||
                          session.status === "OPEN") && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              void changeSessionStatus(session, "CANCELLED")
                            }
                            disabled={busySessionId === session.id}
                          >
                            Ləğv et
                          </Button>
                        )}
                        {session.status === "CLOSED" ||
                        session.status === "CANCELLED"
                          ? "—"
                          : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="p-6 text-center text-muted-foreground"
                  >
                    Heç bir sessiya tapılmadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
