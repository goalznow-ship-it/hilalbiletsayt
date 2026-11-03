import * as argon2 from "argon2";
import type { PrismaClient } from "@prisma/client";

export const ROLE_CATALOGUE: Array<[string, string]> = [
  ["SUPER_ADMIN", "Super administrator"],
  ["CENTRAL_ADMIN", "Mərkəzi administrator"],
  ["BRANCH_MANAGER", "Filial rəhbəri"],
  ["SELLER", "Satıcı"],
  ["OMR_OPERATOR", "OMR / nəticə operatoru"],
];

export type BootstrapConfig = {
  email?: string;
  password?: string;
  fullName?: string;
  branchCode?: string;
  branchName?: string;
};

export type BootstrapOutcome =
  | "skipped-not-configured"
  | "skipped-admin-exists"
  | "skipped-email-taken"
  | "created";

/**
 * Creates the first SUPER_ADMIN exactly once. It never overwrites or resets an
 * existing account, so leaving the variables set after the first start is
 * harmless (but the password should still be removed from the environment).
 */
export async function bootstrapAdmin(
  prisma: PrismaClient,
  config: BootstrapConfig,
): Promise<BootstrapOutcome> {
  if (!config.email || !config.password) return "skipped-not-configured";
  const email = config.email.trim().toLowerCase();
  const passwordHash = await argon2.hash(config.password);

  return prisma.$transaction(async (tx) => {
    // Several API replicas may start at once; only one may create the admin.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('hilal-bootstrap-admin', 0))::text`;
    for (const [name, description] of ROLE_CATALOGUE)
      await tx.role.upsert({ where: { name }, create: { name, description }, update: {} });

    const existingAdmin = await tx.userBranchRole.findFirst({
      where: { role: { name: "SUPER_ADMIN" }, user: { isActive: true } },
      select: { id: true },
    });
    if (existingAdmin) return "skipped-admin-exists";
    if (await tx.user.findUnique({ where: { email }, select: { id: true } }))
      return "skipped-email-taken";

    const role = await tx.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });
    const code = config.branchCode ?? "MERKEZ";
    const branch = await tx.branch.upsert({
      where: { code },
      create: { code, name: config.branchName ?? "Mərkəzi ofis" },
      update: {},
    });
    const user = await tx.user.create({
      data: {
        email,
        fullName: config.fullName ?? "Sistem administratoru",
        passwordHash,
        userBranchRoles: { create: { roleId: role.id, branchId: branch.id } },
      },
    });
    await tx.auditLog.create({
      data: { action: "BOOTSTRAP_ADMIN_CREATED", entityType: "User", entityId: user.id, metadata: { branchId: branch.id } },
    });
    return "created";
  });
}
