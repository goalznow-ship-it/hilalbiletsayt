"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/session-provider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-ui";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { RoleManagementDialog } from "@/components/users/role-management-dialog";
import { EditUserDialog } from "@/components/users/edit-user-dialog";
type User = {
  id: string;
  fullName: string;
  email: string;
  roles: string[];
  branches: { id: string; name: string }[];
  isActive: boolean;
};
export default function UsersPage() {
  const { user, initializing, selectedBranch, request } = useSession();
  const [result, setResult] = useState<{ data: User[]; total: number } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [create, setCreate] = useState(false);
  const [roles, setRoles] = useState("");
  const [edit, setEdit] = useState("");
  const central = user?.roles?.some((role) =>
    ["SUPER_ADMIN", "CENTRAL_ADMIN"].includes(role),
  );
  useEffect(() => {
    if (!user) return;
    let active = true;
    request<{ data: User[]; total: number }>(
      `/users?page=${page}${selectedBranch ? `&branchId=${selectedBranch}` : ""}`,
    )
      .then((data) => {
        if (active) {
          setResult(data);
          setError("");
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [user, request, selectedBranch, page, reload]);
  if (initializing) return <p role="status">Yüklənir…</p>;
  if (!user) return <Link href="/login">İdarəetmə panelinə daxil olun</Link>;
  return (
    <>
      <PageHeader
        title="İstifadəçilər və rollar"
        description="İcazəniz olan istifadəçilər"
      />
      {error && <p role="alert">{error}</p>}
      {central && (
        <Button className="mb-6" onClick={() => setCreate(true)}>
          Yeni istifadəçi
        </Button>
      )}
      {create && (
        <CreateUserDialog
          onClose={() => setCreate(false)}
          onSuccess={() => setReload((value) => value + 1)}
        />
      )}
      {roles && (
        <RoleManagementDialog
          userId={roles}
          onClose={() => setRoles("")}
          onSuccess={() => setReload((value) => value + 1)}
        />
      )}
      {edit && <EditUserDialog key={edit} userId={edit} onClose={() => setEdit("")} onSuccess={() => setReload(value => value + 1)} />}
      <div className="grid gap-4 md:grid-cols-2">
        {result?.data.map((item) => (
          <Card key={item.id} className="p-5">
            <h2>{item.fullName}</h2>
            <p>{item.email}</p>
            <p>{item.roles.join(", ")}</p>
            <p>{item.branches.map((branch) => branch.name).join(", ")}</p>
            <p>{item.isActive ? "Aktiv" : "Passiv"}</p>
            {central && (
              <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => { setRoles(""); setCreate(false); setEdit(item.id); }}>Redaktə et</Button>
              <Button variant="outline" onClick={() => { setEdit(""); setCreate(false); setRoles(item.id); }}>
                Rolları dəyiş
              </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
      {result?.data.length === 0 && <p>İstifadəçi tapılmadı.</p>}
      <div className="my-6 flex gap-4">
        <Button
          disabled={page <= 1}
          onClick={() => setPage((value) => value - 1)}
        >
          Əvvəlki
        </Button>
        <Button
          disabled={!result || page * 20 >= result.total}
          onClick={() => setPage((value) => value + 1)}
        >
          Növbəti
        </Button>
      </div>
    </>
  );
}
