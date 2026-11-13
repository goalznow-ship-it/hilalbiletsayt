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
import { roleLabels, roleDescriptions } from "@/lib/navigation";
type User = {
  id: string;
  fullName: string;
  email: string;
  roles: string[];
  branches: { id: string; name: string; isActive: boolean }[];
  assignments: { branchId: string; role: string }[];
  isActive: boolean;
};
export default function UsersPage() {
  const { user, initializing, selectedBranch, request } = useSession();
  const [result, setResult] = useState<{ data: User[]; total: number } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({ branch: "", page: 1 });
  const page = pagination.branch === selectedBranch ? pagination.page : 1;
  const [reload, setReload] = useState(0);
  const [create, setCreate] = useState(false);
  const [roles, setRoles] = useState("");
  const [edit, setEdit] = useState("");
  const central = user?.roles?.some((role) =>
    ["SUPER_ADMIN", "CENTRAL_ADMIN"].includes(role),
  );
  const canView = central || user?.roles?.includes("BRANCH_MANAGER");
  useEffect(() => {
    if (!user || !canView) return;
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
  }, [user, canView, request, selectedBranch, page, reload]);
  if (initializing) return <p role="status">Yüklənir…</p>;
  if (!user) return <Link href="/login">İdarəetmə panelinə daxil olun</Link>;
  if (!canView) return <p role="alert">İstifadəçi siyahısına baxmaq üçün icazəniz yoxdur.</p>;
  return (
    <>
      <PageHeader
        title="İstifadəçilər və rollar"
        description={central ? "Hesabları və hər filial üzrə səlahiyyətləri idarə edin." : "İdarə etdiyiniz filialların işçiləri. Dəyişiklikləri mərkəzi administrator edir."}
      />
      <details className="mb-6 rounded-lg border border-border p-4">
        <summary className="cursor-pointer font-medium">Rollar nə edə bilər?</summary>
        <dl className="mt-4 space-y-3">{Object.entries(roleLabels).map(([role, label]) => <div key={role}>
          <dt className="font-medium">{label}</dt><dd className="text-sm text-muted-foreground">{roleDescriptions[role]}</dd>
        </div>)}</dl>
      </details>
      {error && <p role="alert">{error}</p>}
      {central && (
        <Button className="mb-6" onClick={() => { setEdit(""); setRoles(""); setCreate(true); }}>
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
          key={roles}
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
            <p>{item.roles.map(role => roleLabels[role] ?? role).join(", ")}</p>
            <ul className="my-2 space-y-1 text-sm text-muted-foreground">{item.branches.map(branch => <li key={branch.id}>
              {branch.name}{branch.isActive === false ? " (passiv)" : ""}: {(item.assignments ?? []).filter(entry => entry.branchId === branch.id).map(entry => roleLabels[entry.role] ?? entry.role).join(", ")}
            </li>)}</ul>
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
          onClick={() => setPagination({ branch: selectedBranch, page: page - 1 })}
        >
          Əvvəlki
        </Button>
        <Button
          disabled={!result || page * 20 >= result.total}
          onClick={() => setPagination({ branch: selectedBranch, page: page + 1 })}
        >
          Növbəti
        </Button>
      </div>
    </>
  );
}
