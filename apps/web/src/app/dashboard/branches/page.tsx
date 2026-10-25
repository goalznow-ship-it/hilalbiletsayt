"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";
import { useBranches } from "@/hooks/use-branches";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

type Branch = {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  isActive: boolean;
};

type BranchFormValues = {
  name: string;
  code: string;
  address: string;
  phone: string;
  isActive: boolean;
};

export default function Page() {
  const { user, request } = useSession();
  const { branches, loading: branchLoading, reload } = useBranches();

  const [branchesData, setBranchesData] = useState<Branch[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);

  useEffect(() => {
    if (!user) return;
    const loadBranches = async () => {
      const result = user.role === "SUPER_ADMIN"
        ? await request<Branch[]>("/branches")
        : await Promise.all(
            user.branches?.map((b) => request<Branch>(`/branches/${b.id}`)) || [],
          );
      setBranchesData(result.filter((b) => b.isActive));
    };
    loadBranches();
  }, [user, request]);

  const handleCreate = (values: BranchFormValues) => {
    setShowCreate(false);
    setBranchesData(prev => [...prev, {
      id: "new",
      name: values.name,
      code: values.code,
      address: values.address,
      phone: values.phone,
      isActive: values.isActive,
    } as Branch]);
  };

  const handleDelete = (branchId: string) => {
    setBranchesData(prev => prev.filter((b) => b.id !== branchId));
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

  return (
    <div className="min-h-screen">
      <PageHeader
        eyebrow="FİLİAL MƏLUMATLARI"
        title="Filiallar Idarəetmə"
        description="Hilal bilet sistemi filialları"
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <div className="p-4 md:p-6">
            <h3 className="font-medium mb-4">{editing ? "Filialı Redaktə Et" : "Yeni Filial Yarad"}</h3>
            {editing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editing) {
                    handleCreate({
                      name: editing.name,
                      code: editing.code,
                      address: editing.address,
                      phone: editing.phone,
                      isActive: editing.isActive,
                    } as BranchFormValues);
                  }
                }}
              >
                <Input
                  value={editing?.name || ""}
                  onChange={(e) => {}}
                  placeholder="Filial adı"
                  disabled
                />
                <Input
                  value={editing?.code || ""}
                  onChange={(e) => {}}
                  placeholder="Filial kodu"
                  disabled
                />
                <Input
                  value={editing?.address || ""}
                  onChange={(e) => {}}
                  placeholder="Adres"
                  disabled
                />
                <Input
                  value={editing?.phone || ""}
                  onChange={(e) => {}}
                  placeholder="Telefon"
                  disabled
                />
                <Button type="submit" disabled>{editing ? "Redaktə et" : "Yarad"}...</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(null)}
                >
                  Läğv et
                </Button>
              </form>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); handleCreate({ name: "", code: "", address: "", phone: "", isActive: true } as BranchFormValues);}}>
                <Input
                  value=""
                  onChange={(e) => {}}
                  placeholder="Filial adı"
                  disabled
                />
                <Input
                  value=""
                  onChange={(e) => {}}
                  placeholder="Filial kodu"
                  disabled
                />
                <Input
                  value=""
                  onChange={(e) => {}}
                  placeholder="Adres"
                  disabled
                />
                <Input
                  value=""
                  onChange={(e) => {}}
                  placeholder="Telefon"
                  disabled
                />
                <Button type="submit">Filial yarad</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreate(false)}
                >
                  Läğv et
                </Button>
              </form>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-4 md:p-6">
            <h3 className="font-medium mb-4">Filial Listesi</h3>

            {branchLoading ? (
              <Skeleton className="animate-pulse" />
            ) : branchesData.length === 0 ? (
              <p className="text-center text-muted-foreground">
                Filial tapılmadı
              </p>
            ) : (
              <table className="w-full rounded-md border border-border bg-card">
                <thead>
                  <tr className="border-b border-border text-sm font-medium text-muted-foreground">
                    <th className="py-3">Kod</th>
                    <th className="py-3">Adı</th>
                    <th className="py-3">Adres</th>
                    <th className="py-3">Telefon</th>
                    <th className="py-3">Status</th>
                    <th className="py-3">Əməliyyat</th>
                  </tr>
                </thead>
                <tbody>
                  {branchesData.map((branch) => (
                    <tr key={branch.id} className="border-b border-border">
                      <td className="font-mono">{branch.code}</td>
                      <td>{branch.name}</td>
                      <td>{branch.address}</td>
                      <td>{branch.phone}</td>
                      <td>{branch.isActive ? "Aktiv" : "Passiv"}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(branch.id)}
                        >
                          Sil
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
