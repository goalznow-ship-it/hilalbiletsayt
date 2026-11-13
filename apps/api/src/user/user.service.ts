import {
  getBranchIds,
  isCentralAdmin,
  type AuthenticatedUser,
} from "../auth/authorization";
import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as argon2 from "argon2";
import { AuditService } from "../audit/audit.service";
import { CreateUserDto, UpdateUserDto } from "../dto/create-user.dto";
import type { Prisma } from "@prisma/client";

type AssignedUser = { id: string; isActive: boolean; userBranchRoles: Array<{
  branchId: string; roleId: string; role: { name: string };
}> };

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditService,
  ) {}

  private async checkBranches(tx: Prisma.TransactionClient, branchIds: string[]) {
    if (!branchIds.length || await tx.branch.count({ where: { id: { in: branchIds }, isActive: true } }) !== branchIds.length)
      throw new BadRequestException("Mövcud və aktiv filial seçin.");
  }

  private async replaceAssignments(tx: Prisma.TransactionClient, user: AssignedUser, assignments: Array<{ branchId: string; roleId: string }>) {
    if (!assignments.length) throw new BadRequestException("Ən azı bir filial və rol saxlayın. Girişi bağlamaq üçün hesabı deaktiv edin.");
    const superRole = user.userBranchRoles.find(entry => entry.role.name === "SUPER_ADMIN");
    if (user.isActive && superRole && !assignments.some(entry => entry.roleId === superRole.roleId)) {
      const others = await tx.user.count({ where: { id: { not: user.id }, isActive: true,
        userBranchRoles: { some: { role: { name: "SUPER_ADMIN" } } } } });
      if (!others) throw new ForbiddenException("Son aktiv SUPER_ADMIN rolunu silmək olmaz.");
    }
    const before = new Set(user.userBranchRoles.map(entry => `${entry.branchId}:${entry.roleId}`));
    if (before.size === assignments.length && assignments.every(entry => before.has(`${entry.branchId}:${entry.roleId}`))) return;
    await tx.userBranchRole.deleteMany({ where: { userId: user.id } });
    await tx.userBranchRole.createMany({ data: assignments.map(entry => ({ userId: user.id, ...entry })) });
    await tx.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
  }

  private assignmentsForBranches(user: AssignedUser, branchIds: string[]) {
    const retained = user.userBranchRoles.filter(entry => branchIds.includes(entry.branchId));
    const added = branchIds.filter(id => !user.userBranchRoles.some(entry => entry.branchId === id));
    const roleIds = [...new Set(user.userBranchRoles.map(entry => entry.roleId))];
    const existingBranches = [...new Set(user.userBranchRoles.map(entry => entry.branchId))];
    if (added.length && (!roleIds.length || existingBranches.some(id =>
      roleIds.some(roleId => !user.userBranchRoles.some(entry => entry.branchId === id && entry.roleId === roleId)))))
      throw new BadRequestException("Yeni filialın rolunu “Rolları dəyiş” bölməsində ayrıca seçin.");
    return [...retained.map(({ branchId, roleId }) => ({ branchId, roleId })),
      ...added.flatMap(branchId => roleIds.map(roleId => ({ branchId, roleId })))];
  }

  async create(data: CreateUserDto, actorId?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(724901)::text");
      const branchIds = [...new Set(data.branchIds)];
      await this.checkBranches(tx, branchIds);
      // Check if user already exists with this email
      const existingUser = await tx.user.findFirst({
        where: { email: { equals: data.email, mode: "insensitive" } },
      });

      if (existingUser) {
        throw new ConflictException("Bu e-poçt ünvanı ilə istifadəçi artıq mövcuddur.");
      }

      // Hash password
      const passwordHash = await argon2.hash(data.password);

      // Create user first
      const user = await tx.user.create({
        data: {
          email: data.email,
          fullName: data.fullName,
          passwordHash,
          isActive: data.isActive,
          tokenVersion: 0,
        },
      });

      // Create user-branch-role assignments separately
      if (branchIds.length > 0) {
        const roleName = data.role || "SELLER";
        const role = await tx.role.findUniqueOrThrow({
          where: { name: roleName },
        });
        await tx.userBranchRole.createMany({
          data: branchIds.map((branchId: string) => ({
            userId: user.id,
            branchId,
            roleId: role.id,
          })),
        });
      }

      // Refresh user with relationships
      const updatedUser = (await tx.user.findUnique({
        where: { id: user.id },
        include: {
          userBranchRoles: {
            include: { role: true, branch: true },
          },
        },
      }))!;

      // Audit log: user creation
      await this.auditLog.log(
        "user_created",
        actorId,
        "user",
        updatedUser.id,
        {
          email: updatedUser.email,
          role: data.role,
          branchIds: data.branchIds,
        },
        tx,
      );

      // Return user without password hash
      const { passwordHash: _, ...result } = updatedUser as any;
      return result;
    });
  }

  async findAll(
    filters?: {
      branchId?: string;
      roleId?: string;
      status?: "active" | "inactive";
      search?: string;
      page?: number;
      limit?: number;
    },
    user?: AuthenticatedUser,
  ) {
    const page = Math.max(1, Number(filters?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters?.limit) || 20));
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (filters?.status === "active") {
      where.isActive = true;
    } else if (filters?.status === "inactive") {
      where.isActive = false;
    }

    const scopedBranches = user && !isCentralAdmin(user) ? getBranchIds(user) : null;
    if (filters?.branchId || filters?.roleId || scopedBranches) {
      where.userBranchRoles = { some: {
        ...(scopedBranches ? { branchId: { in: scopedBranches.filter(id => !filters?.branchId || id === filters.branchId) } }
          : filters?.branchId ? { branchId: filters.branchId } : {}),
        ...(filters?.roleId ? /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(filters.roleId)
          ? { roleId: filters.roleId } : { role: { name: filters.roleId } } : {}),
      } };
    }

    if (filters?.search) {
      where.OR = [
        { email: { contains: filters.search, mode: "insensitive" } },
        { fullName: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    if (user && !isCentralAdmin(user)) {
      where.AND = [
        { userBranchRoles: { some: { branchId: { in: getBranchIds(user) } } } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          userBranchRoles: {
            ...(user && !isCentralAdmin(user) ? { where: { branchId: { in: getBranchIds(user) } } } : {}),
            include: { role: true, branch: true },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        isActive: u.isActive,
        roles: [...new Set(u.userBranchRoles.map(ubr => ubr.role.name))],
        branches: [...new Map(u.userBranchRoles.map(ubr => [ubr.branchId, ubr.branch])).values()],
        assignments: u.userBranchRoles.map(ubr => ({ branchId: ubr.branchId, role: ubr.role.name })),
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        userBranchRoles: {
          include: { role: true, branch: true },
        },
      },
    });

    if (!user) {
      throw new ForbiddenException("İstifadəçi tapılmadı");
    }

    const { passwordHash: _, ...result } = user as any;
    return result;
  }

  async update(id: string, data: UpdateUserDto, actorId?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(724901)::text");
      // Find existing user
      const existingUser = await tx.user.findUnique({
        where: { id },
        include: {
          userBranchRoles: {
            include: { role: true, branch: true },
          },
        },
      });

      if (!existingUser) {
        throw new ForbiddenException("İstifadəçi tapılmadı");
      }

      // Check if email is being changed and if new email already exists
      if (data.email && data.email !== existingUser.email) {
        const emailExists = await tx.user.findFirst({
          where: { id: { not: id }, email: { equals: data.email, mode: "insensitive" } },
        });

        if (emailExists) {
          throw new ConflictException("Bu e-poçt ünvanı ilə istifadəçi artıq mövcuddur.");
        }
      }

      if (
        (data.isActive === false || (data.role !== undefined && data.role !== "SUPER_ADMIN")) &&
        existingUser.isActive && existingUser.userBranchRoles.some(
          (entry) => entry.role.name === "SUPER_ADMIN",
        )
      ) {
        const others = await tx.user.count({
          where: {
            id: { not: id },
            isActive: true,
            userBranchRoles: { some: { role: { name: "SUPER_ADMIN" } } },
          },
        });
        if (!others)
          throw new ForbiddenException(
            "Son aktiv SUPER_ADMIN deaktiv edilə bilməz",
          );
      }
      // Prepare update data
      const updateData: any = {
        ...(data.email && { email: data.email }),
        ...(data.fullName && { fullName: data.fullName }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.isActive === false && { tokenVersion: { increment: 1 } }),
      };

      if (data.role !== undefined || data.branchIds !== undefined) {
        const branchIds = [...new Set(data.branchIds ?? existingUser.userBranchRoles.map(entry => entry.branchId))];
        await this.checkBranches(tx, branchIds);
        const role = data.role ? await tx.role.findUniqueOrThrow({ where: { name: data.role } }) : null;
        const assignments = role ? branchIds.map(branchId => ({ branchId, roleId: role.id }))
          : this.assignmentsForBranches(existingUser, branchIds);
        await this.replaceAssignments(tx, existingUser, assignments);
      }

      const user = await tx.user.update({
        where: { id },
        data: updateData,
        include: {
          userBranchRoles: {
            include: { role: true, branch: true },
          },
        },
      });

      // Audit log: user update
      await this.auditLog.log(
        "user_updated",
        actorId,
        "user",
        user.id,
        {
          email: user.email,
          updatedFields: Object.keys(data),
        },
        tx,
      );

      const { passwordHash: _, ...result } = user as any;
      return result;
    });
  }

  async updateStatus(id: string, isActive: boolean, actorId?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(724901)::text");
      // Check if trying to deactivate the last SUPER_ADMIN
      const user = await tx.user.findUnique({
        where: { id },
        include: {
          userBranchRoles: {
            include: { role: true, branch: true },
          },
        },
      });

      if (!user) {
        throw new ForbiddenException("İstifadəçi tapılmadı");
      }

      // Prevent deactivation of the last active SUPER_ADMIN
      if (!isActive && user.isActive) {
        const superAdminCount = await tx.userBranchRole.count({
          where: {
            role: { name: "SUPER_ADMIN" },
            userId: user.id,
          },
        });

        // Also check if there are other SUPER_ADMIN users
        const otherSuperAdmins = (await tx.user.count({
          where: {
            id: { not: user.id },
            isActive: true,
            userBranchRoles: { some: { role: { name: "SUPER_ADMIN" } } },
          },
        })) as number;

        if (superAdminCount > 0 && otherSuperAdmins === 0) {
          throw new ForbiddenException(
            "Son active SUPER_ADMIN deaktiv edileməz",
          );
        }
      }

      const updatedUser = (await tx.user.update({
        where: { id },
        data: { isActive, ...(!isActive && { tokenVersion: { increment: 1 } }) },
        include: {
          userBranchRoles: {
            include: { role: true, branch: true },
          },
        },
      }))!;

      // Audit log: status change
      await this.auditLog.log(
        isActive ? "user_activated" : "user_deactivated",
        actorId,
        "user",
        updatedUser.id,
        { email: updatedUser.email, isActive: updatedUser.isActive },
        tx,
      );

      const { passwordHash: _, ...result } = updatedUser as any;
      return result;
    });
  }

  async assignBranches(userId: string, branchIds: string[], actorId?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(724901)::text");
      // First get the user with existing branch roles
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: {
          userBranchRoles: {
            include: { role: true, branch: true },
          },
        },
      });

      if (!user) {
        throw new ForbiddenException("İstifadəçi tapılmadı");
      }

      branchIds = [...new Set(branchIds)];
      await this.checkBranches(tx, branchIds);
      // Remove existing branch assignments
      // Assign new branches
      await this.replaceAssignments(tx, user, this.assignmentsForBranches(user, branchIds));

      // Refresh the user data
      const updatedUser = (await tx.user.findUnique({
        where: { id: userId },
        include: {
          userBranchRoles: {
            include: { role: true, branch: true },
          },
        },
      }))!;

      // Audit log: branch assignment
      await this.auditLog.log(
        "user_branches_assigned",
        actorId,
        "user",
        updatedUser.id,
        {
          email: updatedUser.email,
          branchIds,
        },
        tx,
      );

      const { passwordHash: _, ...result } = updatedUser as any;
      return result;
    });
  }

  async assignRoles(userId: string, roleIds: string[], actorId?: string, branchId?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(724901)::text");
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: {
          userBranchRoles: {
            include: { role: true, branch: true },
          },
        },
      });

      if (!user) {
        throw new ForbiddenException("İstifadəçi tapılmadı");
      }

      roleIds = [...new Set(roleIds)];
      if (!roleIds.length) throw new BadRequestException("Ən azı bir rol seçin. Girişi bağlamaq üçün hesabı deaktiv edin.");
      const roles = await tx.role.findMany({
        where: {
          OR: [
            { id: { in: roleIds.filter((id) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) } },
            { name: { in: roleIds } },
          ],
        },
      });
      if (roles.length !== new Set(roleIds).size)
        throw new ForbiddenException("Rol tapılmadı");

      const branchIds = branchId ? [branchId] : [...new Set(user.userBranchRoles.map(entry => entry.branchId))];
      await this.checkBranches(tx, branchIds);

      // Remove existing role assignments across all branches
      // Assign new roles per branch
      const retained = branchId ? user.userBranchRoles.filter(entry => entry.branchId !== branchId)
        .map(({ branchId, roleId }) => ({ branchId, roleId })) : [];
      const newAssignments = roles.flatMap(({ id: roleId }) => branchIds.map(branchId => ({ branchId, roleId })));
      await this.replaceAssignments(tx, user, [...retained, ...newAssignments]);

      // Refresh the user data
      const updatedUser = (await tx.user.findUnique({
        where: { id: userId },
        include: {
          userBranchRoles: {
            include: { role: true, branch: true },
          },
        },
      }))!;

      // Audit log: role assignment
      await this.auditLog.log(
        "user_roles_assigned",
        actorId,
        "user",
        updatedUser.id,
        {
          email: updatedUser.email,
          roleIds,
          branchId,
          branchCount: user.userBranchRoles.length,
        },
        tx,
      );

      const { passwordHash: _, ...result } = updatedUser as any;
      return result;
    });
  }

  async requestPasswordReset(userId: string, actorId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        "İstifadəçi tapılmadı veya hesabı aktiv deyil",
      );
    }

    // Audit log: password reset request
    await this.auditLog.log(
      "password_reset_requested",
      actorId,
      "user",
      user.id,
      {
        email: user.email,
      },
    );

    // In a real system, this would send a reset link via email
    // For now, return success and note that a reset is needed
    return {
      message:
        "Şifrə yenilənmesi tələb ediliyor. İdari təqdimatla sıfırlanmalıdır.",
    };
  }

  async resetPassword(userId: string, newPassword: string, actorId?: string) {
    return this.prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        "İstifadəçi tapılmadı veya hesabı aktiv deyil",
      );
    }

    // Hash new password
    const passwordHash = await argon2.hash(newPassword);

    // Update password and increment token version to invalidate existing sessions
    const updatedUser = (await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
      },
      include: {
        userBranchRoles: {
          include: { role: true, branch: true },
        },
      },
    }))!;

    // Audit log: password reset completed
    await this.auditLog.log(
      "password_reset_completed",
      actorId,
      "user",
      updatedUser.id,
      {
        email: updatedUser.email,
      },
      tx,
    );

    // Invalidate all existing sessions by rotating token version
    // The new tokenVersion will cause refresh tokens to be rejected

    const { passwordHash: _, ...result } = updatedUser as any;
    return result;
    });
  }
}
