"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSession } from "@/components/session-provider";
import { roleLabels, roleDescriptions } from "@/lib/navigation";

type Assignment = { branchId: string; role: { name: string }; branch: { id: string; name: string; isActive: boolean } };
type Branch = { id: string; name: string; isActive: boolean };

export function RoleManagementDialog({ userId, onClose, onSuccess }: {
  userId: string; onClose: () => void; onSuccess: () => void;
}) {
  const { request } = useSession();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([request<{ userBranchRoles: Assignment[] }>(`/users/${userId}`), request<Branch[]>("/branches")])
      .then(([user, available]) => {
        if (!active) return;
        const first = user.userBranchRoles.find(entry => entry.branch.isActive)?.branchId ?? available[0]?.id ?? "";
        setAssignments(user.userBranchRoles);
        setBranches(available);
        setBranchId(first);
        setRoles(user.userBranchRoles.filter(entry => entry.branchId === first).map(entry => entry.role.name));
        setLoaded(true);
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Rol məlumatları alınmadı."); });
    return () => { active = false; };
  }, [request, userId]);

  function selectBranch(id: string) {
    setBranchId(id);
    // Bulk changes start with roles shared by every assigned branch.
    const ids = [...new Set(assignments.map(entry => entry.branchId))];
    setRoles(id ? assignments.filter(entry => entry.branchId === id).map(entry => entry.role.name)
      : Object.keys(roleLabels).filter(role => ids.length > 0 && ids.every(branch =>
        assignments.some(entry => entry.branchId === branch && entry.role.name === role))));
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!loaded || saving || !roles.length || !branches.length) return;
    setSaving(true); setError("");
    try {
      await request(`/users/${userId}/roles`, { method: "PATCH", body: JSON.stringify({ roleIds: roles, ...(branchId ? { branchId } : {}) }) });
      onSuccess(); onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rollar saxlanılmadı.");
    } finally { setSaving(false); }
  }

  return <Card className="mb-6 max-w-xl p-6">
    <h2 className="text-lg font-semibold">Filial üzrə rollar</h2>
    <p className="mt-2 text-sm text-muted-foreground">Filial seçin, sonra bu filialda icazə verilən rolları qeyd edin. Dəyişiklik istifadəçinin mövcud sessiyasını bağlayır.</p>
    {error && <p role="alert" className="my-3 text-destructive">{error}</p>}
    {!loaded && !error && <p role="status">Rollar yüklənir…</p>}
    <form onSubmit={submit} className="mt-4 space-y-4">
      <fieldset disabled={!loaded || saving} className="space-y-4">
        <label className="block text-sm font-medium">Rolun tətbiq olunduğu filial
          <select aria-label="Rolun tətbiq olunduğu filial" value={branchId} onChange={event => selectBranch(event.target.value)} className="mt-2 block min-h-11 w-full rounded border border-input bg-card px-3">
            {!!assignments.length && <option value="">Bütün təyin olunan filiallar</option>}
            {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>
        {!branchId && !!assignments.length && <p className="text-sm text-amber-800">Seçilən rollar bütün təyin olunan filiallardakı rolları əvəz edəcək.</p>}
        {Object.entries(roleLabels).map(([role, label]) => <label key={role} className="flex min-h-11 gap-3 rounded-lg border border-border p-3">
          <input type="checkbox" checked={roles.includes(role)} onChange={event => setRoles(previous => event.target.checked ? [...previous, role] : previous.filter(value => value !== role))} />
          <span><span className="font-medium">{label}</span><span className="mt-1 block text-sm text-muted-foreground">{roleDescriptions[role]}</span></span>
        </label>)}
      </fieldset>
      {loaded && !branches.length && <p role="alert">Əvvəlcə aktiv filial yaradın.</p>}
      {loaded && !roles.length && <p className="text-sm">Ən azı bir rol seçin. Girişi bağlamaq üçün hesabı deaktiv edin.</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={!loaded || saving || !roles.length || !branches.length}>{saving ? "Saxlanılır…" : "Rolları saxla"}</Button>
        <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Bağla</Button>
      </div>
    </form>
  </Card>;
}
