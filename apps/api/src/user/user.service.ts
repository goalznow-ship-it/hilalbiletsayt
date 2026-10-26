import {
  getBranchIds,
  isCentralAdmin,
  type AuthenticatedUser,
} from "../auth/authorization";
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as argon2 from "argon2";
import { AuditService } from "../audit/audit.service";
import { CreateUserDto, UpdateUserDto } from "../dto/create-user.dto";

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditService,
  ) {}

  async create(data: CreateUserDto, actorId?: string) {
    return this.prisma.$transaction(async (tx) => {
      // Check if user already exists with this email
      const existingUser = await tx.user.findUnique({
        where: { email: data.email },
      });

      if (existingUser) {
        throw new ForbiddenException("Bu email vasitesi yoxdur");
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
      if (data.branchIds.length > 0) {
        const roleName = data.role || "SELLER";
        const role = await tx.role.findUniqueOrThrow({
          where: { name: roleName },
        });
        await tx.userBranchRole.createMany({
          data: data.branchIds.map((branchId: string) => ({
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

    if (filters?.branchId) {
      where.userBranchRoles = {
        some: { branchId: filters.branchId },
      };
    }

    if (filters?.roleId) {
      where.userBranchRoles = {
        ...where.userBranchRoles,
        some: { roleId: filters.roleId },
      };
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
        roles: u.userBranchRoles.map((ubr: any) => ubr.role.name),
        branches: u.userBranchRoles.map((ubr: any) => ubr.branch),
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
        const emailExists = await tx.user.findUnique({
          where: { email: data.email },
        });

        if (emailExists) {
          throw new ForbiddenException("Bu email vasitesi yoxdur");
        }
      }

      if (
        data.isActive === false &&
        existingUser.userBranchRoles.some(
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
      };

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
          updatedFields: Object.keys(updateData),
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
        data: { isActive },
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

      if (!branchIds.length)
        throw new ForbiddenException("Ən azı bir filial seçin");
      const retainedRoles = [
        ...new Set(user.userBranchRoles.map((entry) => entry.roleId)),
      ];
      // Remove existing branch assignments
      await tx.userBranchRole.deleteMany({
        where: { userId },
      });

      // Assign new branches
      const sellerRole = await tx.role.findUniqueOrThrow({
        where: { name: "SELLER" },
      });
      if (branchIds.length > 0) {
        await tx.userBranchRole.createMany({
          data: branchIds.flatMap((branchId: string) =>
            (retainedRoles.length ? retainedRoles : [sellerRole.id]).map(
              (roleId) => ({ userId, branchId, roleId }),
            ),
          ),
        });
      }

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

  async assignRoles(userId: string, roleIds: string[], actorId?: string) {
    return this.prisma.$transaction(async (tx) => {
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

      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(724901)::text");
      if (
        user.userBranchRoles.some(
          (entry) => entry.role.name === "SUPER_ADMIN",
        ) &&
        !roleIds.includes("SUPER_ADMIN") &&
        !roleIds.includes(
          user.userBranchRoles.find(
            (entry) => entry.role.name === "SUPER_ADMIN",
          )!.roleId,
        )
      ) {
        const others = await tx.user.count({
          where: {
            id: { not: userId },
            isActive: true,
            userBranchRoles: { some: { role: { name: "SUPER_ADMIN" } } },
          },
        });
        if (!others)
          throw new ForbiddenException(
            "Son aktiv SUPER_ADMIN rolunu silmək olmaz",
          );
      }
      const roles = await tx.role.findMany({
        where: {
          OR: [
            { id: { in: roleIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)) } },
            { name: { in: roleIds } },
          ],
        },
      });
      if (roles.length !== new Set(roleIds).size)
        throw new ForbiddenException("Rol tapılmadı");

      // Remove existing role assignments across all branches
      await tx.userBranchRole.deleteMany({
        where: { userId },
      });

      // Assign new roles per branch
      if (roleIds.length > 0) {
        const branchIds = [
          ...new Set(user.userBranchRoles.map((ubr: any) => ubr.branchId)),
        ];
        const newAssignments = roles.flatMap(({ id: roleId }) =>
          branchIds.map((branchId: string) => ({
            userId,
            branchId,
            roleId,
          })),
        );

        await tx.userBranchRole.createMany({
          data: newAssignments,
        });
      }

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
    const user = await this.prisma.user.findUnique({
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
    const updatedUser = (await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        tokenVersion: user.tokenVersion ? user.tokenVersion + 1 : 1,
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
    );

    // Invalidate all existing sessions by rotating token version
    // The new tokenVersion will cause refresh tokens to be rejected

    const { passwordHash: _, ...result } = updatedUser as any;
    return result;
  }
}
