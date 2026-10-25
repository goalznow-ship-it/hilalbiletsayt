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
import { Users, LoaderCircle, CheckCircle, X } from "lucide-react";

type User = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  branchId?: string;
  isActive: boolean;
  createdAt: string;
};

type UserFormValues = {
  fullName: string;
  email: string;
  role: string;
  branchId: string;
  isActive: boolean;
};

export default function Page() {
  const { user, request } = useSession();
  const { branches, loading: branchLoading } = useBranches();

  const [usersData, setUsersData] = useState<User[]>([]);

  useEffect(() => {
    if (!user) return;
    request<User[]>(`/api/user?branchId=${user.branches?.[0]?.id}`).then((data) => {
      setUsersData(data);
    });
  }, [user]);

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
        eyebrow="İSTİFADƏÇİLƏR"
        title="İstifadəçi Idarəetmə"
        description="Sistema əlavə olunan istifadəçilər"
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <div className="p-4 md:p-6">
            <h3 className="font-medium mb-4">Yeni İstifadəçi Yarad</h3>

            {branchLoading ? (
              <Skeleton className="animate-pulse" />
            ) : usersData.length === 0 ? (
              <p className="text-center text-muted-foreground">
                İstifadəçi yoxdur
              </p>
            ) : (
              <table className="w-full rounded-md border border-border bg-card">
                <thead>
                  <tr className="border-b border-border text-sm font-medium text-muted-foreground">
                    <th className="py-3">Adı</th>
                    <th className="py-3">Email</th>
                    <th className="py-3">Rol</th>
                    <th className="py-3">Filial</th>
                    <th className="py-3">Status</th>
                    <th className="py-3">Əməliyyat</th>
                  </tr>
                </thead>
                <tbody>
                  {usersData.map((user) => (
                    <tr key={user.id} className="border-b border-border">
                      <td>{user.fullName}</td>
                      <td>{user.email}</td>
                      <td>{user.role}</td>
                      <td>{user.branchId || "Filial yoxdur"}</td>
                      <td>{user.isActive ? "Aktiv" : "Passiv"}</td>
                      <td>
                        <Button size="sm" variant="outline">
                          Redaktə et
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-4 md:p-6">
            <h3 className="font-medium mb-4">Istifadəçi Statistikası</h3>
            {branchLoading ? (
              <Skeleton className="animate-pulse" />
            ) : usersData.length === 0 ? (
              <p className="text-center text-muted-foreground">
                Statistika yoxdur
              </p>
            ) : (
              <div>
                <p className="text-sm text-success">
                  ✓ Umumi istifadəçi: {usersData.length}
                </p>
                <p className="text-sm text-muted-foreground">
                  ✓ Aktiv: {usersData.filter((u) => u.isActive).length}
                  | Passiv: {usersData.filter((u) => !u.isActive).length}
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
