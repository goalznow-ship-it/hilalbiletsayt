"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSession } from "@/components/session-provider";
import { Input } from "@/components/ui/input";

type Branch = { id: string; name: string; code: string; address?: string; phone?: string; isActive: boolean };

interface BranchManagementDialog {
  branches: Branch[];
  loading: boolean;
  error: string;
  success: boolean;
}

export function BranchManagementDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { request } = useSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState<{ name: string; code: string; address?: string; phone?: string; isActive: boolean }>({
    name: "",
    code: "",
    address: "",
    phone: "",
    isActive: true,
  });

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

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, name: e.target.value }));
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, code: e.target.value }));
  };

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, address: e.target.value }));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, phone: e.target.value }));
  };

  const handleIsActiveChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, isActive: e.target.checked }));
  };

  const handleCreate = async () => {
    setError("");
    setSuccess(false);
    setLoading(true);

    try {
      await request("/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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

  const handleToggle = async (branchId: string) => {
    setError("");
    setSuccess(false);
    setLoading(true);

    try {
      await request(`/branches/${branchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !form.isActive }),
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
      <h3 className="mb-4 text-lg font-medium">Filial əməliyyatları</h3>

      {error && (
        <div className="bg-destructive/10 text-destructive rounded p-3 mb-4">
          <span className="icon-destructive" aria-hidden="true" /> <p>{error}</p>
        </div>
      )}

      <form className="grid gap-4 mb-6">
        <Input
          name="name"
          placeholder="Filial adı"
          value={form.name}
          onChange={handleNameChange}
          required
        />
        <Input
          name="code"
          placeholder="Filial kodu"
          value={form.code}
          onChange={handleCodeChange}
          required
        />
        <Input
          name="address"
          placeholder="Adres"
          value={form.address}
          onChange={handleAddressChange}
        />
        <Input
          name="phone"
          placeholder="Telefon"
          value={form.phone}
          onChange={handlePhoneChange}
        />
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isActive"
            checked={form.isActive}
            onChange={handleIsActiveChange}
            className="rounded border-input"
          />
          <span>Aktiv</span>
        </div>

        <Button type="submit" className="mt-4 w-full">
          Yadda saxla
        </Button>
      </form>

      {branches.length > 0 && (
        <div className="mt-6">
          <h4 className="mb-3">Mövcud filialar</h4>
          {branches.map((branch) => (
            <div key={branch.id} className="mb-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={branch.isActive}
                  onChange={() => handleToggle(branch.id)}
                  className="rounded border-input"
                />
                <span>
                  {branch.code} - {branch.name} {branch.isActive ? " (Aktiv)" : " (Inaktiv)"}
                </span>
              </label>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
