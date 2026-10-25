import { describe, it, expect, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { RolesGuard } from "./guards/roles.guard";
import {
  assertBranchAllowed,
  getBranchIds,
  isCentralAdmin,
} from "./authorization";

function contextFor(user: any): any {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  };
}

function guardWith(requiredRoles?: string[]) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(requiredRoles),
  } as any;
  return new RolesGuard(reflector);
}

describe("RolesGuard (unit)", () => {
  it("allows handlers without a role requirement", () => {
    expect(guardWith(undefined).canActivate(contextFor({ roles: [] }))).toBe(
      true,
    );
  });

  it("allows a user holding one of the required roles", () => {
    const guard = guardWith(["SUPER_ADMIN", "CENTRAL_ADMIN"]);
    expect(guard.canActivate(contextFor({ roles: ["CENTRAL_ADMIN"] }))).toBe(
      true,
    );
  });

  it("rejects a user without a required role", () => {
    const guard = guardWith(["SUPER_ADMIN", "CENTRAL_ADMIN"]);
    expect(() => guard.canActivate(contextFor({ roles: ["SELLER"] }))).toThrow(
      ForbiddenException,
    );
  });

  it("rejects an unauthenticated request", () => {
    const guard = guardWith(["SUPER_ADMIN"]);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      ForbiddenException,
    );
  });
});

describe("branch authorization helpers (unit)", () => {
  const manager = {
    userId: "u-1",
    roles: ["BRANCH_MANAGER"],
    branches: [{ id: "branch-1" }, { id: "branch-2" }],
  };

  it("central admins bypass branch scoping", () => {
    expect(isCentralAdmin({ userId: "a", roles: ["CENTRAL_ADMIN"] })).toBe(
      true,
    );
    expect(() =>
      assertBranchAllowed({ userId: "a", roles: ["SUPER_ADMIN"] }, "branch-9"),
    ).not.toThrow();
  });

  it("collects unique branch ids", () => {
    expect(getBranchIds(manager).sort()).toEqual(["branch-1", "branch-2"]);
  });

  it("blocks branch managers from other branches", () => {
    expect(() => assertBranchAllowed(manager, "branch-3")).toThrow(
      ForbiddenException,
    );
    expect(() => assertBranchAllowed(manager, "branch-1")).not.toThrow();
  });
});

it("does not turn a seller branch assignment into branch-manager access", () => {
  const user = {
    userId: "mixed",
    roles: ["BRANCH_MANAGER", "SELLER"],
    branches: [{ id: "managed" }, { id: "sales" }],
    userBranchRoles: [
      { branchId: "managed", role: "BRANCH_MANAGER" },
      { branchId: "sales", role: "SELLER" },
    ],
  };
  expect(getBranchIds(user)).toEqual(["managed"]);
  expect(() => assertBranchAllowed(user, "sales")).toThrow(ForbiddenException);
});
