"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSession } from "@/components/session-provider";
import { useRouter } from "next/navigation";
import { UsersTable } from "./users-table";

type RoleOption = "SUPER_ADMIN" | "CENTRAL_ADMIN" | "BRANCH_MANAGER" | "SELLER" | "OMR_OPERATOR";

interface RoleAssignment {
  role: RoleOption;
  assigned: boolean;
}

export function RoleManagementDialog({
  userId,
  onClose,
  onSuccess,
}: {
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { request } = useSession();
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>(() =>
    ["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER", "SELLER", "OMR_OPERATOR"].map((role) => ({
      role: role as RoleOption,
      assigned: false,
    }))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchAssignments = async () => {
      try {
        const result = await request<{ userBranchRoles: { role: { name: string } }[] }>(
          `/users/${userId}`
        );
        if (!cancelled) {
          const assignedRoles = new Set(
            result.userBranchRoles.map((ubr) => ubr.role.name)
          );
          setRoleAssignments(
            ["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER", "SELLER", "OMR_OPERATOR"].map((role) => ({
              role: role as RoleOption,
              assigned: assignedRoles.has(role),
            }))
          );
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Rol məlumatları alınmadı.");
      }
    };
    void fetchAssignments();
    return () => { cancelled = true; };
  }, [request, userId]);

  const handleToggle = (role: RoleOption) => {
    setRoleAssignments((prev) =>
      prev.map((r) =>
        r.role === role ? { role, assigned: !r.assigned } : r
      )
    );
  };

  const handleSubmit = async () => {
    setError("");
    setSuccess(false);
    setLoading(true);

    try {
      const roleIds = roleAssignments
        .filter((r) => r.assigned)
        .map((r) => r.role);

      await request(`/users/${userId}/roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleIds }),
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
      <h3 className="mb-4 text-lg font-medium">Rolə təyinat</h3>

      {error && (
        <div className="bg-destructive/10 text-destructive rounded p-3 mb-4">
          <span className="icon-destructive" aria-hidden="true" /> <p>{error}</p>
        </div>
      )}

      {roleAssignments.map((assignment) => (
        <div key={assignment.role} className="mb-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={assignment.assigned}
              onChange={() => handleToggle(assignment.role)}
              className="rounded border-input"
            />
            <span>{assignment.role}</span>
          </label>
        </div>
      ))}

      <div className="mt-6">
        <Button type="button" onClick={handleSubmit} disabled={loading} className="w-full">
          {loading ? "Yüklənir..." : "Göndər"} 
        </Button>
      </div>
    </Card>
  );
}
