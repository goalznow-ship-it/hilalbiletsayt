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
import { sessionDate, sessionInputDate, sessionInputToIso } from "@/lib/public-sales";
type Exam = {
  id: string;
  title: string;
  code: string;
  price: number | null;
  status: string;
  salesNotice: string | null;
  sessionCount: number;
};
type Session = {
  id: string;
  sessionCode: string;
  startsAt: string;
  endsAt: string;
  venue: string | null;
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
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState("");
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
      await request(editingSession ? `/exam-sessions/${editingSession.id}` : "/exam-sessions", {
        method: editingSession ? "PATCH" : "POST",
        body: JSON.stringify({
          ...(!editingSession ? { examId: selected.id, sessionCode: data.get("sessionCode") } : {}),
          startsAt: sessionInputToIso(String(data.get("startsAt"))),
          endsAt: sessionInputToIso(String(data.get("endsAt"))),
          capacity: Number(data.get("capacity")),
          venue: data.get("venue"),
        }),
      });
      form.reset();
      setNotice(editingSession ? "Sessiya yeniləndi." : "Sessiya yaradıldı. İctimai satış üçün “Satışı aç” düyməsini seçin.");
      setEditingSession(null);
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
      {notice && <p role="status" className="my-4">{notice}</p>}
      {exams === null && !error && <p role="status">İmtahanlar yüklənir…</p>}
      {central && (
        <Button className="mb-6" onClick={() => setEdit("")}>
          Yeni imtahan
        </Button>
      )}
      {edit !== null && (
        <ExamDialog
          examId={edit || undefined}
          onClose={() => setEdit(null)}
          onSuccess={() => { setReload((value) => value + 1); setNotice("İmtahan saxlanıldı. Satışa hazırlıq məlumatını yoxlayın."); }}
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
            <p className="my-2 text-sm">{exam.sessionCount} sessiya · {exam.salesNotice ?? "İctimai bilet səhifəsində görünür."}</p>
            <div className="flex flex-wrap gap-3">
              {central && (
                <Button variant="outline" onClick={() => setEdit(exam.id)}>
                  Redaktə et
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setSessions([]);
                  setEditingSession(null);
                  setSelected(exam);
                }}
              >
                Sessiyalar
              </Button>
              {central && exam.status === "DRAFT" && (
                <Button variant="outline" disabled={busy} onClick={async () => {
                  if (!window.confirm("Qaralama silinsin? Əlaqəli məlumat varsa silinməyəcək.")) return;
                  setBusy(true); setError("");
                  try {
                    await request(`/exams/${exam.id}`, { method: "DELETE" });
                    if (selected?.id === exam.id) setSelected(null);
                    setReload(value => value + 1); setNotice("Qaralama silindi.");
                  } catch (cause) { setError(cause instanceof Error ? cause.message : "İmtahan silinmədi."); }
                  finally { setBusy(false); }
                }}>Qaralamanı sil</Button>
              )}
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
                    {["PLANNED", "CLOSED"].includes(session.status) && (
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
                    {["PLANNED", "OPEN", "CLOSED"].includes(session.status) && (
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
                    {session.status !== "CANCELLED" && <Button variant="outline" disabled={busy} onClick={() => setEditingSession(session)}>Sessiyanı redaktə et</Button>}
                  </div>
                )}
              </Card>
            ))}
          </div>
          {central && (
            <form key={editingSession?.id ?? `new-${selected.id}`} onSubmit={createSession} className="public-form">
              <h3>{editingSession ? "Sessiyanı redaktə et" : "Yeni sessiya"} (Bakı vaxtı)</h3>
              <label htmlFor="session-code">Sessiya kodu</label>
              <Input
                id="session-code"
                name="sessionCode"
                required
                maxLength={50}
                defaultValue={editingSession?.sessionCode}
                disabled={Boolean(editingSession)}
              />
              <label htmlFor="starts">Başlama vaxtı</label>
              <Input
                id="starts"
                name="startsAt"
                type="datetime-local"
                required
                defaultValue={editingSession ? sessionInputDate(editingSession.startsAt) : ""}
              />
              <label htmlFor="ends">Bitmə vaxtı</label>
              <Input id="ends" name="endsAt" type="datetime-local" required defaultValue={editingSession ? sessionInputDate(editingSession.endsAt) : ""} />
              <label htmlFor="venue">İmtahan yeri</label>
              <Input id="venue" name="venue" maxLength={200} required defaultValue={editingSession?.venue ?? ""} />
              <label htmlFor="capacity">Tutum</label>
              <Input
                id="capacity"
                name="capacity"
                type="number"
                min={1}
                required
                defaultValue={editingSession?.capacity}
              />
              <Button disabled={busy} type="submit">
                {busy ? "Saxlanılır…" : editingSession ? "Dəyişiklikləri saxla" : "Sessiya yarat"}
              </Button>
              {editingSession && <Button type="button" variant="outline" disabled={busy} onClick={() => setEditingSession(null)}>Redaktəni bağla</Button>}
            </form>
          )}
        </section>
      )}
    </>
  );
}
