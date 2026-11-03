import type { Prisma } from "@prisma/client";
import { ForbiddenException } from "@nestjs/common";

export const CENTRAL_ADMIN_ROLES = ["SUPER_ADMIN", "CENTRAL_ADMIN"];
export const CANDIDATE_MANAGER_ROLES = [
  "SUPER_ADMIN",
  "CENTRAL_ADMIN",
  "BRANCH_MANAGER",
];

/** Roles that may sell tickets and see their own branch's sales. */
export const SALES_ROLES = ["BRANCH_MANAGER", "SELLER"];
export const TICKET_SELLER_ROLES = [...CENTRAL_ADMIN_ROLES, ...SALES_ROLES];

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

export function getBranchIdsForRoles(
  user: AuthenticatedUser | undefined,
  roles: readonly string[],
): string[] {
  const ids = user?.userBranchRoles
    ? user.userBranchRoles
        .filter((entry) => roles.includes(entry.role))
        .map((entry) => entry.branchId)
    : (user?.branches ?? []).map((branch) => branch.id);
  return [...new Set(ids.filter(Boolean))];
}

/** Branches the user manages (candidate administration). */
export function getBranchIds(user: AuthenticatedUser | undefined): string[] {
  return getBranchIdsForRoles(user, ["BRANCH_MANAGER"]);
}

/**
 * Branches whose ticket sales the user may create and see. A seller of
 * branch A never receives branch B here, so every sales query scoped by this
 * list is isolated per branch.
 */
export function getSalesBranchIds(user: AuthenticatedUser | undefined): string[] {
  return getBranchIdsForRoles(user, SALES_ROLES);
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
  branchIds: string[] = getBranchIds(user),
): Prisma.CandidateWhereInput {
  if (isCentralAdmin(user)) return {};
  return {
    OR: [
      { branch_id: { in: branchIds } },
      { registrations: { some: { branch_id: { in: branchIds } } } },
    ],
  };
}
