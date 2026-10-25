"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSession } from "@/components/session-provider";
import { Input } from "@/components/ui/input";

type Branch = { id: string; name: string };
type RoleOption = "SUPER_ADMIN" | "CENTRAL_ADMIN" | "BRANCH_MANAGER" | "SELLER" | "OMR_OPERATOR";

interface CreateUserForm {
  email: string;
  fullName: string;
  password: string;
  role: RoleOption | "";
  branchIds: string[];
  isActive: boolean;
}

export function CreateUserDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { request } = useSession();
  const [form, setForm] = useState<CreateUserForm>({
    email: "",
    fullName: "",
    password: "",
    role: "",
    branchIds: [],
    isActive: true,
  });
  const [branches, setBranches] = useState<Branch[]>([]);
  const [roles] = useState<RoleOption[]>(["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER", "SELLER", "OMR_OPERATOR"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchBranches = async () => {
      try {
        const result = await request<Branch[]>("/branches");
        if (!cancelled && Array.isArray(result)) {
          setBranches(result);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Filiallar yüklənmədi.");
        }
      }
    };
    void fetchBranches();
    return () => { cancelled = true; };
  }, [request]);

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
    setError("");
    setSuccess(false);
    setLoading(true);

    try {
      await request("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          fullName: form.fullName,
          password: form.password,
          role: form.role || undefined,
          branchIds: form.branchIds,
          isActive: form.isActive,
        }),
      });

      setSuccess(true);
      setLoading(false);
      onSuccess();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Xəta baş verdi.");
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {};
  }, []);

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse rounded bg-muted/50 h-[200px] w-full mb-4" />
      </Card>
    );
  }

  if (success) {
    setSuccess(false);
    onClose();
    return null;
  }

  return (
    <Card className="max-w-lg p-6">
      <h3 className="mb-4 text-lg font-medium">Yeni istifadəçi yaradılışı</h3>

      {error && (
        <div className="bg-destructive/10 text-destructive rounded p-3 mb-4">
          <span className="icon-destructive" aria-hidden="true" /> <p>{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-4">
        <Input
          name="email"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
          required
        />
        <Input
          name="fullName"
          placeholder="Tam Adı"
          value={form.fullName}
          onChange={handleChange}
          required
        />
        <Input
          name="password"
          type="password"
          placeholder="Şifrə"
          value={form.password}
          onChange={handleChange}
          required
        />

        <select
          name="role"
          onChange={handleChange}
          className="mt-1 block w-full rounded border-input"
        >
          <option value="">Rol seçin</option>
          {roles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>

        <select
          multiple
          name="branchIds"
          onChange={handleChange}
          className="mt-1 block w-full rounded border-input"
        >
          <option value="">Filial seçin</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isActive"
            checked={form.isActive}
            onChange={handleChange}
            className="rounded border-input"
          />
          <span>Aktiv</span>
        </div>

        <Button type="submit" className="mt-4 w-full" disabled={loading}>
          {loading ? "Yüklənir..." : "Yadda saxla"}
        </Button>
      </form>
    </Card>
  );
}
