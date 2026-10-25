"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-ui";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/components/session-provider";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { EditUserDialog } from "@/components/users/edit-user-dialog";
import { RoleManagementDialog } from "@/components/users/role-management-dialog";
import { Button } from "@/components/ui/button";

type Branch = { id: string; name: string; isActive: boolean };
type UserListItem = {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  roles: string[];
  branches: Branch[];
};

type UsersResponse = {
  data: UserListItem[];
  total: number;
  page: number;
  totalPages: number;
};

export default function Page() {
  const { request } = useSession();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [pagination, setPagination] = useState<{ page: number; totalPages: number }>({
    page: 1,
    totalPages: 1,
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isRoleOpen, setIsRoleOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string>("");
  const [roleManagementUserId, setRoleManagementUserId] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await request<UsersResponse>(
          "/users?" +
            (search ? `search=${encodeURIComponent(search)}` : "") +
            (selectedBranch ? `&branch=${selectedBranch}` : "") +
            (selectedRole ? `&role=${selectedRole}` : "") +
            (selectedStatus ? `&status=${selectedStatus}` : "") +
            (pagination.page > 1 ? `&page=${pagination.page}` : "")
        );
        setUsers(result.data);
        setPagination({ page: result.page, totalPages: result.totalPages });
        setLoading(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Yüklənmədi.");
        setLoading(false);
      }
    };
    void load();
  }, [request, search, selectedBranch, selectedRole, selectedStatus, pagination.page]);

  const handleCreateSuccess = () => {
    setIsDialogOpen(false);
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await request<UsersResponse>(
          "/users?" +
            (search ? `search=${encodeURIComponent(search)}` : "") +
            (selectedBranch ? `&branch=${selectedBranch}` : "") +
            (selectedRole ? `&role=${selectedRole}` : "") +
            (selectedStatus ? `&status=${selectedStatus}` : "") +
            (pagination.page > 1 ? `&page=${pagination.page}` : "")
        );
        setUsers(result.data);
        setPagination({ page: result.page, totalPages: result.totalPages });
        setLoading(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Yüklənmədi.");
        setLoading(false);
      }
    };
    void load();
  };

  const handleEditSuccess = () => {
    setIsEditOpen(false);
    setEditingUserId("");
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await request<UsersResponse>(
          "/users?" +
            (search ? `search=${encodeURIComponent(search)}` : "") +
            (selectedBranch ? `&branch=${selectedBranch}` : "") +
            (selectedRole ? `&role=${selectedRole}` : "") +
            (selectedStatus ? `&status=${selectedStatus}` : "") +
            (pagination.page > 1 ? `&page=${pagination.page}` : "")
        );
        setUsers(result.data);
        setPagination({ page: result.page, totalPages: result.totalPages });
        setLoading(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Yüklənmədi.");
        setLoading(false);
      }
    };
    void load();
  };

  const handleRoleSuccess = () => {
    setIsRoleOpen(false);
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await request<UsersResponse>(
          "/users?" +
            (search ? `search=${encodeURIComponent(search)}` : "") +
            (selectedBranch ? `&branch=${selectedBranch}` : "") +
            (selectedRole ? `&role=${selectedRole}` : "") +
            (selectedStatus ? `&status=${selectedStatus}` : "") +
            (pagination.page > 1 ? `&page=${pagination.page}` : "")
        );
        setUsers(result.data);
        setPagination({ page: result.page, totalPages: result.totalPages });
        setLoading(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Yüklənmədi.");
        setLoading(false);
      }
    };
    void load();
  };

  if (loading) {
    return <Card><div className="skeleton min-h-[400px] animate-pulse" /></Card>;
  }

  if (error) {
    return <Card><div className="p-4 text-destructive"><span className="icon-destructive" aria-hidden="true" /><p>{error}</p></div></Card>;
  }

  return (
    <Card>
      <PageHeader
        eyebrow="İŞ SAHƏSİ"
        title="İstifadəçilər və satıcılar"
        description="Komandanız, rollar və filial təyinatları."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Input
          placeholder="İstifadəçi adı və ya email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={loading}
        />
        <select
          onChange={(e) => setSelectedBranch(e.target.value)}
          disabled={loading}
        >
          <option value="">Bütün filiallar</option>
        </select>
        <select
          onChange={(e) => setSelectedRole(e.target.value)}
          disabled={loading}
        >
          <option value="">Rol seçin</option>
          <option value="SUPER_ADMIN">SUPER_ADMIN</option>
          <option value="CENTRAL_ADMIN">CENTRAL_ADMIN</option>
          <option value="BRANCH_MANAGER">BRANCH_MANAGER</option>
          <option value="SELLER">SELLER</option>
          <option value="OMR_OPERATOR">OMR_OPERATOR</option>
        </select>
        <select
          onChange={(e) => setSelectedStatus(e.target.value)}
          disabled={loading}
        >
          <option value="">Status</option>
          <option value="active">Aktiv</option>
          <option value="inactive">Inaktiv</option>
        </select>
      </div>

      <Button
        onClick={() => setIsDialogOpen(true)}
        className="mt-2 mb-4 mr-2"
        variant="outline"
      >
        Yeni istifadəçi
      </Button>

      {isDialogOpen && (
        <CreateUserDialog
          onClose={() => setIsDialogOpen(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {isEditOpen && (
        <EditUserDialog
          userId={editingUserId}
          onClose={() => setIsEditOpen(false)}
          onSuccess={handleEditSuccess}
        />
      )}

      {isRoleOpen && (
        <RoleManagementDialog
          userId={roleManagementUserId}
          onClose={() => setIsRoleOpen(false)}
          onSuccess={handleRoleSuccess}
        />
      )}

      <Button
        onClick={() => setIsDialogOpen(true)}
        className="mt-2 mb-4 mr-2"
        variant="outline"
      >
        Yeni istifadəçi
      </Button>

      <table className="w-full caption-bottom">
        <thead>
          <tr className="border-b">
            <th className="p-3 text-left font-medium">İsim</th>
            <th className="p-3 text-left font-medium">Email</th>
            <th className="p-3 text-left font-medium">Rol</th>
            <th className="p-3 text-left font-medium">Filial</th>
            <th className="p-3 text-left font-medium">Status</th>
            <th className="p-3 text-left font-medium">Ədİt</th>
            <th className="p-3 text-left font-medium">Rollar</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const branches = user.branches || [];
            return (
              <tr key={user.id} className="border-b">
                <td className="p-3">{user.fullName}</td>
                <td className="p-3">{user.email}</td>
                <td className="p-3">
                  {user.roles.length > 0
                    ? user.roles.map((r) => <Badge variant="secondary" key={r}>{r}</Badge>)
                    : <span>Rol yox</span>}
                </td>
                <td className="p-3">
                  {branches.length > 0
                    ? branches.map((b) => b.name).join(", ")
                    : "-"}
                </td>
                <td className="p-3">
                  {user.isActive ? (<Badge>Kapalı</Badge>) : (<Badge variant="destructive">Açık</Badge>)}
                </td>
                <td className="p-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingUserId(user.id)}
                    disabled={loading}
                  >
                    Düzenlə
                  </Button>
                </td>
                <td className="p-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRoleManagementUserId(user.id);
                      setIsRoleOpen(true);
                    }}
                    disabled={loading}
                  >
                    Rəngə qoy
                  </Button>
                </td>
              </tr>
            );
          })}
          {users.length === 0 && (
            <tr>
              <td colSpan={7} className="p-6 text-center text-muted-foreground">
                Heçbir istifadəçi tapılmadı
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
