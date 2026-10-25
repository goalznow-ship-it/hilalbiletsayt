"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-ui";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";

type Candidate = {
  id: string;
  candidate_number: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  is_active: boolean;
  branch_id?: string | null;
  created_at: string;
  registrationCount: number;
};

type Registration = {
  id: string;
  status: string;
  branch_id?: string | null;
  exam: { id: string; code: string; title: string };
  session: {
    id: string;
    sessionCode: string;
    startsAt?: string;
    endsAt?: string;
    venue?: string | null;
    capacity?: number;
  };
  registered_at: string;
};

type CandidateDetail = Candidate & { registrations: Registration[] };

type Paginated<T> = {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
};

type Exam = {
  id: string;
  code: string;
  title: string;
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
  status: string;
};

type Branch = { id: string; name: string; code: string };

const EMPTY_FORM = { full_name: "", email: "", phone: "", branch_id: "" };

export default function Page() {
  const { request, user, selectedBranch } = useSession();

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState<CandidateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [actionError, setActionError] = useState("");

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [branchForRegistration, setBranchForRegistration] = useState("");
  const [registering, setRegistering] = useState(false);

  const roles = user?.roles ?? (user?.role ? [user.role] : []);
  const isCentralAdmin = roles.some((role) =>
    ["SUPER_ADMIN", "CENTRAL_ADMIN"].includes(role),
  );
  const availableBranches = isCentralAdmin
    ? branches
    : branches.filter((branch) => branch.id === selectedBranch);
  const effectiveBranch =
    branchForRegistration || selectedBranch || availableBranches[0]?.id || "";

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await request<Paginated<Candidate>>(
          "/candidates?" +
            (search ? `search=${encodeURIComponent(search)}&` : "") +
            (activeFilter ? `is_active=${activeFilter}&` : "") +
            `page=${page}`,
        );
        setCandidates(result.data);
        setPagination({
          page: result.page,
          totalPages: result.totalPages,
          total: result.total,
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Yüklənmədi.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [request, search, activeFilter, page, reloadKey]);

  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const [branchRows, examRows] = await Promise.all([
          request<Branch[]>("/branches"),
          request<Exam[]>("/exams"),
        ]);
        setBranches(branchRows);
        setExams(examRows);
      } catch {
        // Filters stay usable; registration form shows its own error.
      }
    };
    void loadReferenceData();
  }, [request]);

  useEffect(() => {
    if (!selectedExamId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const result = await request<ExamSession[]>(
          `/exam-sessions?examId=${selectedExamId}`,
        );
        if (!cancelled) {
          setSessions(result);
          setSelectedSessionId("");
        }
      } catch (cause) {
        if (!cancelled) {
          setSessions([]);
          setActionError(
            cause instanceof Error ? cause.message : "Sessiyalar yüklənmədi.",
          );
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [request, selectedExamId]);

  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    setDetailError("");
    setActionError("");
    try {
      const detail = await request<CandidateDetail>(`/candidates/${id}`);
      setSelected(detail);
      setEditForm({
        full_name: detail.full_name,
        email: detail.email ?? "",
        phone: detail.phone ?? "",
        branch_id: detail.branch_id ?? "",
      });
    } catch (cause) {
      setSelected(null);
      setDetailError(cause instanceof Error ? cause.message : "Yüklənmədi.");
    } finally {
      setDetailLoading(false);
    }
  };

  const submitCandidate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const created = await request<Candidate>("/candidates", {
        method: "POST",
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          branch_id:
            (isCentralAdmin ? form.branch_id : selectedBranch) || undefined,
        }),
      });
      setNotice(`Namizəd ${created.candidate_number} yaradıldı.`);
      setForm(EMPTY_FORM);
      setShowCreate(false);
      setPage(1);
      setReloadKey((key) => key + 1);
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "Namizəd yaradılmadı.",
      );
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setActionError("");
    setSaving(true);
    try {
      await request<Candidate>(`/candidates/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          full_name: editForm.full_name.trim(),
          email: editForm.email.trim() || undefined,
          phone: editForm.phone.trim() || undefined,
          branch_id: isCentralAdmin
            ? editForm.branch_id || null
            : undefined,
        }),
      });
      setEditing(false);
      setNotice("Namizəd məlumatları yeniləndi.");
      await loadDetail(selected.id);
      setReloadKey((key) => key + 1);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Məlumat yenilənmədi.",
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    if (!selected) return;
    if (
      selected.is_active &&
      !window.confirm("Namizədi deaktiv etmək istəyirsiniz?")
    ) {
      return;
    }
    setActionError("");
    setSaving(true);
    try {
      await request<Candidate>(`/candidates/${selected.id}/toggle-active`, {
        method: "PATCH",
      });
      setNotice(
        selected.is_active
          ? "Namizəd deaktiv edildi."
          : "Namizəd yenidən aktiv edildi.",
      );
      await loadDetail(selected.id);
      setReloadKey((key) => key + 1);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Status dəyişdirilmədi.",
      );
    } finally {
      setSaving(false);
    }
  };

  const submitRegistration = async () => {
    if (!selected || !selectedExamId || !selectedSessionId) return;
    setActionError("");
    setRegistering(true);
    try {
      await request<Registration>("/registrations", {
        method: "POST",
        body: JSON.stringify({
          candidate_id: selected.id,
          exam_id: selectedExamId,
          session_id: selectedSessionId,
          branch_id: effectiveBranch || undefined,
        }),
      });
      setNotice("Qeydiyyat yaradıldı.");
      setSelectedExamId("");
      setSelectedSessionId("");
      await loadDetail(selected.id);
      setReloadKey((key) => key + 1);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Qeydiyyat yaradılmadı.",
      );
    } finally {
      setRegistering(false);
    }
  };

  const cancelRegistration = async (registrationId: string) => {
    if (!selected) return;
    if (!window.confirm("Qeydiyyatı ləğv etmək istəyirsiniz?")) return;
    setActionError("");
    setSaving(true);
    try {
      await request<Registration>(`/registrations/${registrationId}/cancel`, {
        method: "PATCH",
      });
      setNotice("Qeydiyyat ləğv edildi. Tarixçə saxlanılır.");
      await loadDetail(selected.id);
      setReloadKey((key) => key + 1);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Qeydiyyat ləğv edilmədi.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openSessions = sessions.filter((session) => session.status === "OPEN");

  return (
    <div className="grid gap-4">
      <Card>
        <PageHeader
          eyebrow="NAMİZƏD İDARƏETMƏSİ"
          title="Namizədlər"
          description="Namizədləri idarə edin və imtahan sessiyalarına qeydiyyat yaradın."
          action={
            <Button onClick={() => setShowCreate((value) => !value)}>
              {showCreate ? "Formanı bağla" : "Yeni namizəd əlavə et"}
            </Button>
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

        {showCreate && (
          <form
            onSubmit={submitCandidate}
            className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-border p-4 md:grid-cols-3"
          >
            <label className="grid gap-1 text-sm">
              Ad və soyad
              <Input
                required
                minLength={3}
                maxLength={100}
                value={form.full_name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    full_name: event.target.value,
                  }))
                }
                disabled={saving}
              />
            </label>
            <label className="grid gap-1 text-sm">
              E-poçt
              <Input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                disabled={saving}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Telefon
              <Input
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                disabled={saving}
              />
            </label>
            {isCentralAdmin && (
              <label className="grid gap-1 text-sm">
                Filial
                <select
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={form.branch_id}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      branch_id: event.target.value,
                    }))
                  }
                  disabled={saving}
                >
                  <option value="">Filial seçilməyib</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} ({branch.code})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {formError && (
              <p className="text-sm text-destructive md:col-span-3" role="alert">
                {formError}
              </p>
            )}
            <div className="flex gap-2 md:col-span-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Yadda saxlanılır..." : "Yadda saxla"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreate(false);
                  setFormError("");
                }}
                disabled={saving}
              >
                Ləğv et
              </Button>
            </div>
          </form>
        )}

        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            placeholder="Namizəd nömrəsi, ad, e-poçt və ya telefon..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            disabled={loading}
          />
          <select
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            value={activeFilter}
            onChange={(event) => {
              setActiveFilter(event.target.value);
              setPage(1);
            }}
            disabled={loading}
          >
            <option value="">Bütün statuslar</option>
            <option value="true">Aktiv</option>
            <option value="false">Deaktiv</option>
          </select>
        </div>

        {loading ? (
          <div className="skeleton min-h-[240px] animate-pulse" />
        ) : candidates.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">
            Heç bir namizəd tapılmadı.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full caption-bottom">
              <thead>
                <tr className="border-b">
                  <th className="p-3 text-left font-medium">Namizəd nömrəsi</th>
                  <th className="p-3 text-left font-medium">Ad və soyad</th>
                  <th className="p-3 text-left font-medium">E-poçt</th>
                  <th className="p-3 text-left font-medium">Telefon</th>
                  <th className="p-3 text-left font-medium">Status</th>
                  <th className="p-3 text-left font-medium">Qeydiyyat sayı</th>
                  <th className="p-3 text-left font-medium">Əməliyyat</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr key={candidate.id} className="border-b">
                    <td className="p-3 font-mono text-sm">
                      {candidate.candidate_number}
                    </td>
                    <td className="p-3">{candidate.full_name}</td>
                    <td className="p-3">{candidate.email || "—"}</td>
                    <td className="p-3">{candidate.phone || "—"}</td>
                    <td className="p-3">
                      {candidate.is_active ? (
                        <Badge variant="secondary">Aktiv</Badge>
                      ) : (
                        <Badge variant="destructive">Deaktiv</Badge>
                      )}
                    </td>
                    <td className="p-3">{candidate.registrationCount}</td>
                    <td className="p-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void loadDetail(candidate.id)}
                        disabled={detailLoading}
                      >
                        Detallar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Cəmi: {pagination.total} namizəd
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={loading || pagination.page <= 1}
            >
              Əvvəlki
            </Button>
            <span>
              {pagination.page} / {pagination.totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setPage((value) => Math.min(pagination.totalPages, value + 1))
              }
              disabled={loading || pagination.page >= pagination.totalPages}
            >
              Növbəti
            </Button>
          </div>
        </div>
      </Card>

      {(selected || detailLoading || detailError) && (
        <Card>
          {detailLoading ? (
            <div className="skeleton min-h-[200px] animate-pulse" />
          ) : detailError ? (
            <div role="alert" className="p-4 text-destructive">
              {detailError}
            </div>
          ) : selected ? (
            <div className="grid gap-4">
              <PageHeader
                eyebrow={selected.candidate_number}
                title={selected.full_name}
                description={`Qeydiyyat sayı: ${selected.registrations.length}`}
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setEditing((value) => !value)}
                      disabled={saving}
                    >
                      {editing ? "Redaktəni bağla" : "Redaktə et"}
                    </Button>
                    <Button
                      variant={selected.is_active ? "destructive" : "default"}
                      onClick={() => void toggleActive()}
                      disabled={saving}
                    >
                      {selected.is_active ? "Deaktiv et" : "Aktiv et"}
                    </Button>
                  </div>
                }
              />

              {actionError && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
                >
                  {actionError}
                </div>
              )}

              {editing ? (
                <form
                  onSubmit={submitEdit}
                  className="grid grid-cols-1 gap-3 rounded-lg border border-border p-4 md:grid-cols-3"
                >
                  <label className="grid gap-1 text-sm">
                    Ad və soyad
                    <Input
                      required
                      minLength={3}
                      maxLength={100}
                      value={editForm.full_name}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          full_name: event.target.value,
                        }))
                      }
                      disabled={saving}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    E-poçt
                    <Input
                      type="email"
                      value={editForm.email}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      disabled={saving}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Telefon
                    <Input
                      value={editForm.phone}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          phone: event.target.value,
                        }))
                      }
                      disabled={saving}
                    />
                  </label>
                  {isCentralAdmin && (
                    <label className="grid gap-1 text-sm">
                      Filial
                      <select
                        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                        value={editForm.branch_id}
                        onChange={(event) =>
                          setEditForm((current) => ({
                            ...current,
                            branch_id: event.target.value,
                          }))
                        }
                        disabled={saving}
                      >
                        <option value="">Filial seçilməyib</option>
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name} ({branch.code})
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="flex gap-2 md:col-span-3">
                    <Button type="submit" disabled={saving}>
                      {saving ? "Yadda saxlanılır..." : "Yadda saxla"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditing(false)}
                      disabled={saving}
                    >
                      Ləğv et
                    </Button>
                  </div>
                </form>
              ) : (
                <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">E-poçt</dt>
                    <dd>{selected.email || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Telefon</dt>
                    <dd>{selected.phone || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>{selected.is_active ? "Aktiv" : "Deaktiv"}</dd>
                  </div>
                </dl>
              )}

              <section className="grid gap-3">
                <h3 className="font-medium">Yeni qeydiyyat</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <select
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                    value={selectedExamId}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSelectedExamId(value);
                      setSelectedSessionId("");
                      if (!value) setSessions([]);
                    }}
                    disabled={registering}
                  >
                    <option value="">İmtahan seçin</option>
                    {exams.map((exam) => (
                      <option key={exam.id} value={exam.id}>
                        {exam.code} — {exam.title}
                      </option>
                    ))}
                  </select>

                  <select
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                    value={selectedSessionId}
                    onChange={(event) => setSelectedSessionId(event.target.value)}
                    disabled={registering || !selectedExamId}
                  >
                    <option value="">
                      {selectedExamId ? "Sessiya seçin" : "Əvvəlcə imtahan seçin"}
                    </option>
                    {openSessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.sessionCode} — {session.venue || "Məkan yoxdur"} (
                        {session.capacity})
                      </option>
                    ))}
                  </select>

                  <select
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                    value={effectiveBranch}
                    onChange={(event) =>
                      setBranchForRegistration(event.target.value)
                    }
                    disabled={registering || !isCentralAdmin}
                  >
                    <option value="">Filial seçin</option>
                    {availableBranches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                      </option>
                    ))}
                  </select>
                </div>
                {selectedExamId && openSessions.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Bu imtahanda qeydiyyata açıq sessiya yoxdur.
                  </p>
                )}
                <div>
                  <Button
                    onClick={() => void submitRegistration()}
                    disabled={
                      registering ||
                      !selectedExamId ||
                      !selectedSessionId ||
                      !effectiveBranch
                    }
                  >
                    {registering ? "Qeydiyyat yaradılır..." : "Qeydiyyat yarat"}
                  </Button>
                </div>
              </section>

              <section className="grid gap-3">
                <h3 className="font-medium">Qeydiyyatlar</h3>
                {selected.registrations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Bu namizədin qeydiyyatı yoxdur.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full caption-bottom">
                      <thead>
                        <tr className="border-b">
                          <th className="p-3 text-left font-medium">İmtahan</th>
                          <th className="p-3 text-left font-medium">Sessiya</th>
                          <th className="p-3 text-left font-medium">Status</th>
                          <th className="p-3 text-left font-medium">
                            Qeydiyyat tarixi
                          </th>
                          <th className="p-3 text-left font-medium">Əməliyyat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.registrations.map((registration) => (
                          <tr key={registration.id} className="border-b">
                            <td className="p-3">
                              {registration.exam.code} — {registration.exam.title}
                            </td>
                            <td className="p-3">
                              {registration.session.sessionCode}
                            </td>
                            <td className="p-3">
                              {registration.status === "ACTIVE" ? (
                                <Badge variant="secondary">Aktiv</Badge>
                              ) : (
                                <Badge variant="destructive">Ləğv edilib</Badge>
                              )}
                            </td>
                            <td className="p-3">
                              {new Date(
                                registration.registered_at,
                              ).toLocaleString("az-AZ")}
                            </td>
                            <td className="p-3">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void cancelRegistration(registration.id)
                                }
                                disabled={
                                  saving || registration.status !== "ACTIVE"
                                }
                              >
                                Ləğv et
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
