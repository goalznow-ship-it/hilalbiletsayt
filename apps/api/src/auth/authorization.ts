import type { Prisma } from "@prisma/client";
import { ForbiddenException } from "@nestjs/common";

export const CENTRAL_ADMIN_ROLES = ["SUPER_ADMIN", "CENTRAL_ADMIN"];
export const CANDIDATE_MANAGER_ROLES = [
  "SUPER_ADMIN",
  "CENTRAL_ADMIN",
  "BRANCH_MANAGER",
];

export type AuthenticatedUser = {
  userId: string;
  email?: string;
  roles?: string[];
  branches?: Array<{ id: string }>;
  userBranchRoles?: Array<{ branchId: string; role: string }>;
};

export function hasAnyRole(
  user: AuthenticatedUser | undefined,
  allowed: readonly string[],
): boolean {
  const roles = user?.roles ?? [];
  return roles.some((role) => allowed.includes(role));
}

export function isCentralAdmin(user: AuthenticatedUser | undefined): boolean {
  return hasAnyRole(user, CENTRAL_ADMIN_ROLES);
}

export function getBranchIds(user: AuthenticatedUser | undefined): string[] {
  const ids = user?.userBranchRoles
    ? user.userBranchRoles
        .filter((entry) => entry.role === "BRANCH_MANAGER")
        .map((entry) => entry.branchId)
    : (user?.branches ?? []).map((branch) => branch.id);
  return [...new Set(ids.filter(Boolean))];
}

export function isBranchAllowed(
  user: AuthenticatedUser | undefined,
  branchId: string,
): boolean {
  return isCentralAdmin(user) || getBranchIds(user).includes(branchId);
}

export function assertBranchAllowed(
  user: AuthenticatedUser | undefined,
  branchId: string,
): void {
  if (!isBranchAllowed(user, branchId)) {
    throw new ForbiddenException("Bu filial üçün icazəniz yoxdur");
  }
}

export function candidateVisibilityWhere(
  user: AuthenticatedUser,
): Prisma.CandidateWhereInput {
  if (isCentralAdmin(user)) return {};
  const branchIds = getBranchIds(user);
  return {
    OR: [
      { branch_id: { in: branchIds } },
      { registrations: { some: { branch_id: { in: branchIds } } } },
    ],
  };
}
