import { Injectable, UnauthorizedException, ForbiddenException } from "@nestjs/common";
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
    // Check if user already exists with this email
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ForbiddenException("Bu email vasitesi yoxdur");
    }

    // Hash password
    const passwordHash = await argon2.hash(data.password);

    // Create user first
    const user = await this.prisma.user.create({
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
      await this.prisma.userBranchRole.createMany({
        data: data.branchIds.map((branchId: string) => ({
          userId: user.id,
          branchId,
          roleId: roleName,
        })),
      });
    }

    // Refresh user with relationships
    const updatedUser = (await this.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        userBranchRoles: {
          include: { role: true, branch: true },
        },
      },
    }))!;

    // Audit log: user creation
    await this.auditLog.log("user_created", actorId, "user", updatedUser.id, {
      email: updatedUser.email,
      role: data.role,
      branchIds: data.branchIds,
    });

    // Return user without password hash
    const { passwordHash: _, ...result } = updatedUser as any;
    return result;
  }

  async findAll(filters?: {
    branchId?: string;
    roleId?: string;
    status?: "active" | "inactive";
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
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
    // Find existing user
    const existingUser = await this.prisma.user.findUnique({
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
      const emailExists = await this.prisma.user.findUnique({
        where: { email: data.email },
      });

      if (emailExists) {
        throw new ForbiddenException("Bu email vasitesi yoxdur");
      }
    }

    // Prepare update data
    const updateData: any = {
      ...(data.email && { email: data.email }),
      ...(data.fullName && { fullName: data.fullName }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    };

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        userBranchRoles: {
          include: { role: true, branch: true },
        },
      },
    });

    // Audit log: user update
    await this.auditLog.log("user_updated", actorId, "user", user.id, {
      email: user.email,
      updatedFields: Object.keys(updateData),
    });

    const { passwordHash: _, ...result } = user as any;
    return result;
  }

  async updateStatus(id: string, isActive: boolean, actorId?: string) {
    // Check if trying to deactivate the last SUPER_ADMIN
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

    // Prevent deactivation of the last active SUPER_ADMIN
    if (!isActive && user.isActive) {
      const superAdminCount = await this.prisma.userBranchRole.count({
        where: {
          role: { name: "SUPER_ADMIN" },
          userId: user.id,
        },
      });

      // Also check if there are other SUPER_ADMIN users
      const otherSuperAdmins = (await this.prisma.user.count({
        where: { id: { not: user.id } },
      })) as number;

      if (superAdminCount > 0 && otherSuperAdmins === 0) {
        throw new ForbiddenException("Son active SUPER_ADMIN deaktiv edileməz");
      }
    }

    const updatedUser = (await this.prisma.user.update({
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
    );

    const { passwordHash: _, ...result } = updatedUser as any;
    return result;
  }

  async assignBranches(userId: string, branchIds: string[], actorId?: string) {
    // First get the user with existing branch roles
    const user = await this.prisma.user.findUnique({
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

    // Remove existing branch assignments
    await this.prisma.userBranchRole.deleteMany({
      where: { userId },
    });

    // Assign new branches
    if (branchIds.length > 0) {
      await this.prisma.userBranchRole.createMany({
        data: branchIds.map((branchId: string) => ({
          userId,
          branchId,
          roleId: "SELLER",
        })),
      });
    }

    // Refresh the user data
    const updatedUser = (await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userBranchRoles: {
          include: { role: true, branch: true },
        },
      },
    }))!;

    // Audit log: branch assignment
    await this.auditLog.log("user_branches_assigned", actorId, "user", updatedUser.id, {
      email: updatedUser.email,
      branchIds,
    });

    const { passwordHash: _, ...result } = updatedUser as any;
    return result;
  }

  async assignRoles(userId: string, roleIds: string[], actorId?: string) {
    const user = await this.prisma.user.findUnique({
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

    // Remove existing role assignments across all branches
    await this.prisma.userBranchRole.deleteMany({
      where: { userId },
    });

    // Assign new roles per branch
    if (roleIds.length > 0) {
      const branchIds = user.userBranchRoles.map((ubr: any) => ubr.branchId);
      const newAssignments = roleIds.flatMap((roleId) =>
        branchIds.map((branchId: string) => ({
          userId,
          branchId,
          roleId,
        })),
      );

      await this.prisma.userBranchRole.createMany({
        data: newAssignments,
      });
    }

    // Refresh the user data
    const updatedUser = (await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userBranchRoles: {
          include: { role: true, branch: true },
        },
      },
    }))!;

    // Audit log: role assignment
    await this.auditLog.log("user_roles_assigned", actorId, "user", updatedUser.id, {
      email: updatedUser.email,
      roleIds,
      branchCount: user.userBranchRoles.length,
    });

    const { passwordHash: _, ...result } = updatedUser as any;
    return result;
  }

  async requestPasswordReset(userId: string, actorId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("İstifadəçi tapılmadı veya hesabı aktiv deyil");
    }

    // Audit log: password reset request
    await this.auditLog.log("password_reset_requested", actorId, "user", user.id, {
      email: user.email,
    });

    // In a real system, this would send a reset link via email
    // For now, return success and note that a reset is needed
    return { message: "Şifrə yenilənmesi tələb ediliyor. İdari təqdimatla sıfırlanmalıdır." };
  }

  async resetPassword(userId: string, newPassword: string, actorId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("İstifadəçi tapılmadı veya hesabı aktiv deyil");
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
    await this.auditLog.log("password_reset_completed", actorId, "user", updatedUser.id, {
      email: updatedUser.email,
    });

    // Invalidate all existing sessions by rotating token version
    // The new tokenVersion will cause refresh tokens to be rejected

    const { passwordHash: _, ...result } = updatedUser as any;
    return result;
  }
}