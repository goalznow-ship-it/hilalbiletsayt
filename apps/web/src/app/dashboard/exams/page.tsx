"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/session-provider";
import { PageHeader } from "@/components/page-ui";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExamDialog } from "@/components/examinations/exam-dialog";
import { formatAzn } from "@/lib/money";
import { sessionDate } from "@/lib/public-sales";
type Exam = {
  id: string;
  title: string;
  code: string;
  price: number | null;
  status: string;
};
type Session = {
  id: string;
  sessionCode: string;
  startsAt: string;
  capacity: number;
  registered: number;
  status: string;
};
export default function ExamsPage() {
  const { user, initializing, request } = useSession();
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<string | null>(null);
  const [selected, setSelected] = useState<Exam | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const central = user?.roles?.some((role) =>
    ["SUPER_ADMIN", "CENTRAL_ADMIN"].includes(role),
  );
  useEffect(() => {
    if (!user) return;
    let active = true;
    request<Exam[]>("/exams")
      .then((data) => {
        if (active) setExams(data);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [user, request, reload]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    request<Session[]>(`/exam-sessions?examId=${selected.id}`)
      .then((data) => {
        if (active) setSessions(data);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [selected, request, reload]);
  async function changeSession(id: string, status: string) {
    setBusy(true);
    setError("");
    try {
      await request(`/exam-sessions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setReload((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sessiya yenilənmədi.");
    } finally {
      setBusy(false);
    }
  }
  async function createSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await request("/exam-sessions", {
        method: "POST",
        body: JSON.stringify({
          examId: selected.id,
          sessionCode: data.get("sessionCode"),
          startsAt: new Date(`${data.get("startsAt")}:00+04:00`).toISOString(),
          endsAt: new Date(`${data.get("endsAt")}:00+04:00`).toISOString(),
          capacity: Number(data.get("capacity")),
          venue: data.get("venue"),
        }),
      });
      form.reset();
      setReload((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sessiya yaradılmadı.");
    } finally {
      setBusy(false);
    }
  }
  if (initializing) return <p role="status">Yüklənir…</p>;
  if (!user) return <Link href="/login">İdarəetmə panelinə daxil olun</Link>;
  return (
    <>
      <PageHeader
        title="İmtahanlar və sessiyalar"
        description="Qiymətlər, dərc və sessiya satışı"
      />
      {error && (
        <p role="alert" className="my-4 text-destructive">
          {error}
        </p>
      )}
      {central && (
        <Button className="mb-6" onClick={() => setEdit("")}>
          Yeni imtahan
        </Button>
      )}
      {edit !== null && (
        <ExamDialog
          examId={edit || undefined}
          onClose={() => setEdit(null)}
          onSuccess={() => setReload((value) => value + 1)}
        />
      )}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {exams?.map((exam) => (
          <Card key={exam.id} className="p-5">
            <h2 className="text-lg font-semibold">
              {exam.code} · {exam.title}
            </h2>
            <p>
              {formatAzn(exam.price)} ·{" "}
              {
                (
                  {
                    DRAFT: "Qaralama",
                    PUBLISHED: "Dərc edilib",
                    ARCHIVED: "Arxiv",
                  } as Record<string, string>
                )[exam.status]
              }
            </p>
            <div className="flex gap-3">
              {central && (
                <Button variant="outline" onClick={() => setEdit(exam.id)}>
                  Redaktə et
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setSessions([]);
                  setSelected(exam);
                }}
              >
                Sessiyalar
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {exams?.length === 0 && <p>İmtahan yoxdur.</p>}
      {selected && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">
            {selected.title}: sessiyalar
          </h2>
          <div className="my-4 grid gap-4">
            {sessions.map((session) => (
              <Card key={session.id} className="p-5">
                <h3>
                  {session.sessionCode} · {sessionDate(session.startsAt)}
                </h3>
                <p>
                  {session.registered}/{session.capacity} yer · {session.status}
                </p>
                {central && (
                  <div className="flex flex-wrap gap-3">
                    {session.status === "PLANNED" && (
                      <Button
                        disabled={busy}
                        onClick={() => changeSession(session.id, "OPEN")}
                      >
                        Satışı aç
                      </Button>
                    )}
                    {session.status === "OPEN" && (
                      <Button
                        disabled={busy}
                        onClick={() => changeSession(session.id, "CLOSED")}
                      >
                        Satışı bağla
                      </Button>
                    )}
                    {["PLANNED", "OPEN"].includes(session.status) && (
                      <Button
                        disabled={busy}
                        variant="outline"
                        onClick={() => {
                          if (window.confirm("Sessiya ləğv edilsin?"))
                            void changeSession(session.id, "CANCELLED");
                        }}
                      >
                        Sessiyanı ləğv et
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
          {central && (
            <form onSubmit={createSession} className="public-form">
              <h3>Yeni sessiya (Bakı vaxtı)</h3>
              <label htmlFor="session-code">Sessiya kodu</label>
              <Input
                id="session-code"
                name="sessionCode"
                required
                maxLength={50}
              />
              <label htmlFor="starts">Başlama vaxtı</label>
              <Input
                id="starts"
                name="startsAt"
                type="datetime-local"
                required
              />
              <label htmlFor="ends">Bitmə vaxtı</label>
              <Input id="ends" name="endsAt" type="datetime-local" required />
              <label htmlFor="venue">İmtahan yeri</label>
              <Input id="venue" name="venue" maxLength={200} required />
              <label htmlFor="capacity">Tutum</label>
              <Input
                id="capacity"
                name="capacity"
                type="number"
                min={1}
                required
              />
              <Button disabled={busy} type="submit">
                Sessiya yarat
              </Button>
            </form>
          )}
        </section>
      )}
    </>
  );
}
