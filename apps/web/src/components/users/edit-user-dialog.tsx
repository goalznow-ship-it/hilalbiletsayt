"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSession } from "@/components/session-provider";
import { Input } from "@/components/ui/input";
import { roleLabels, roleDescriptions } from "@/lib/navigation";

type Branch = { id: string; name: string; isActive: boolean };
type RoleOption = "SUPER_ADMIN" | "CENTRAL_ADMIN" | "BRANCH_MANAGER" | "SELLER" | "OMR_OPERATOR";

interface EditUserForm {
  email: string;
  fullName: string;
  role: RoleOption | "";
  branchIds: string[];
  isActive: boolean;
}

type UserResponse = {
  email: string;
  fullName: string;
  isActive: boolean;
  userBranchRoles: Array<{
    role: { name: string };
    branch: Branch;
  }>;
};

export function EditUserDialog({
  userId,
  onClose,
  onSuccess,
}: {
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { request } = useSession();
  const [form, setForm] = useState<EditUserForm>({
    email: "",
    fullName: "",
    role: "",
    branchIds: [],
    isActive: true,
  });
  const [branches, setBranches] = useState<Branch[]>([]);
  const [roles] = useState<RoleOption[]>(["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER", "SELLER", "OMR_OPERATOR"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [initialBranches, setInitialBranches] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const fetchUser = async () => {
      try {
        const result = await request<UserResponse>(`/users/${userId}`);
        if (!cancelled) {
          setForm({
            email: result.email,
            fullName: result.fullName,
            role: "",
            branchIds: [
              ...new Set(result.userBranchRoles.map((assignment) => assignment.branch.id)),
            ],
            isActive: result.isActive,
          });
          setInitialBranches([...new Set(result.userBranchRoles.map(assignment => assignment.branch.id))]);
          const branchesResult = await request<Branch[]>("/branches?includeInactive=true");
          if (!cancelled && Array.isArray(branchesResult)) {
            setBranches(branchesResult);
            setLoaded(true);
          }
        }
      } catch {
        if (!cancelled) setError("İstifadəçi məlumatları alınmadı.");
      }
    };
    void fetchUser();
    return () => { cancelled = true; };
  }, [request, userId]);

  const handleChange = (e: React.ChangeEvent) => {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    if (target.type === "checkbox") {
      setForm(prev => ({ ...prev, isActive: target.checked }));
    } else if (target.name === "branchIds" && target instanceof HTMLSelectElement) {
      setForm(prev => ({
        ...prev,
        branchIds: Array.from(target.selectedOptions, option => option.value),
      }));
    } else {
      setForm(prev => ({ ...prev, [target.name]: target.value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !loaded) return;
    setError("");
    setLoading(true);

    try {
      await request(`/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          fullName: form.fullName.trim(),
          role: form.role || undefined,
          branchIds: form.branchIds.length === initialBranches.length && form.branchIds.every(id => initialBranches.includes(id)) ? undefined : form.branchIds,
          isActive: form.isActive,
        }),
      });

      setLoading(false);
      onSuccess();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "İstifadəçi məlumatları saxlanılmadı.");
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
      <h3 className="mb-4 text-lg font-medium">İstifadəçi redaktəsi</h3>

      {error && (
        <div role="alert" className="bg-destructive/10 text-destructive rounded p-3 mb-4">
          <span className="icon-destructive" aria-hidden="true" /> <p>{error}</p>
        </div>
      )}

      {!loaded && !error && <p role="status">İstifadəçi məlumatları yüklənir…</p>}
      <form onSubmit={handleSubmit} className="grid gap-4">
        <Input
          name="email"
          aria-label="E-poçt"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
          required
        />
        <Input
          name="fullName"
          aria-label="Tam ad"
          placeholder="Tam adı"
          minLength={2}
          maxLength={200}
          value={form.fullName}
          onChange={handleChange}
          required
        />

        <p className="text-sm text-muted-foreground">Burada seçilən rol bütün seçilmiş filiallara tətbiq olunur. Filiallara fərqli rollar vermək üçün “Rolları dəyiş” bölməsini açın.</p>
        <select
          name="role"
          aria-label="Bütün seçilmiş filiallar üçün rol"
          value={form.role}
          onChange={handleChange}
          className="mt-1 block w-full rounded border-input"
        >
          <option value="">Mövcud rolları saxla</option>
          {roles.map((role) => (
            <option key={role} value={role}>
              {roleLabels[role]}
            </option>
          ))}
        </select>

        {form.role && <p className="text-sm text-muted-foreground">{roleDescriptions[form.role]}</p>}

        <select
          multiple
          name="branchIds"
          aria-label="Filiallar"
          value={form.branchIds}
          required
          onChange={handleChange}
          className="mt-1 block w-full rounded border-input"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id} disabled={!b.isActive && !initialBranches.includes(b.id)}>
              {b.name}{!b.isActive ? " (passiv)" : ""}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label="İstifadəçi aktivdir"
            name="isActive"
            checked={form.isActive}
            onChange={handleChange}
            className="rounded border-input"
          />
          <span>Aktiv</span>
        </div>

        <Button type="submit" className="mt-4 w-full" disabled={!loaded || loading}>
          Redaktə et
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>Bağla</Button>
      </form>
    </Card>
  );
}
