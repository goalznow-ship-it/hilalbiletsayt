import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException, ConflictException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import * as argon2 from "argon2";
import { effectiveAssignments } from "./authorization";
import { AuditService } from "../audit/audit.service";
import { changePasswordSchema } from "./change-password.dto";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private audit: AuditService,
  ) {}

  async changePassword(userId: string, input: unknown) {
    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException("Hazırkı şifrəni və ondan fərqli, 12–128 simvolluq yeni şifrəni daxil edin.");
    const user = await this.prisma.user.findUnique({ where: { id: userId },
      select: { id: true, passwordHash: true, tokenVersion: true, isActive: true } });
    if (!user?.isActive) throw new UnauthorizedException("Yenidən daxil olun.");
    if (!await argon2.verify(user.passwordHash, parsed.data.currentPassword))
      throw new BadRequestException("Hazırkı şifrə düzgün deyil.");
    const passwordHash = await argon2.hash(parsed.data.newPassword);
    return this.prisma.$transaction(async tx => {
      // Compare the verified credential so concurrent resets cannot overwrite each other.
      const updated = await tx.user.updateMany({
        where: { id: userId, isActive: true, passwordHash: user.passwordHash, tokenVersion: user.tokenVersion },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      if (!updated.count) throw new ConflictException("Hesab məlumatları dəyişib. Yenidən daxil olun.");
      await this.audit.log("PASSWORD_CHANGED", userId, "User", userId, { sessionsRevoked: true }, tx);
      return { changed: true };
    });
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: "insensitive" } },
      include: {
        userBranchRoles: {
          include: { role: true, branch: true },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("İstifadəçi tapılmadı veya hesabı aktiv deyil");
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, password);
    if (!isPasswordValid) {
      throw new UnauthorizedException("Düzgün şifrə deyil");
    }

    if (!effectiveAssignments(user.userBranchRoles).length)
      throw new UnauthorizedException("Hesaba aktiv filial üzrə rol təyin edilməyib.");

    return user;
  }

  async login(user: any) {
    const payload = {
      sub: user.id,
      tokenVersion: user.tokenVersion ?? 0,
      email: user.email,
      role: user.userBranchRoles[0]?.role.name,
    };
    return {
      access_token: this.jwtService.sign(payload, { expiresIn: '15m' }),
    };
  }

  async refreshToken(userId: string, previousTokenVersion: number): Promise<any> {
    // Check if user is active
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userBranchRoles: {
          include: { role: true, branch: true },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Hesabı artıq inaktiv edilib");
    }

    // Check token version - prevent old token reuse
    if (user.tokenVersion !== previousTokenVersion) {
      throw new ForbiddenException("Token yenilənmemiş. Zəhmət olmasa, yenidən giriş yapın.");
    }

    // Update token version
    const rotated = await this.prisma.user.updateMany({
      where: { id: userId, isActive: true, tokenVersion: previousTokenVersion },
      data: { tokenVersion: { increment: 1 } },
    });
    if (!rotated.count) throw new UnauthorizedException("Yenidən daxil olun");

    const payload = {
      sub: user.id,
      tokenVersion: previousTokenVersion + 1,
      email: user.email,
      role: user.userBranchRoles[0]?.role.name,
    };

    return {
      access_token: this.jwtService.sign(payload, { expiresIn: '15m' }),
    };
  }

  async getUserPermissions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userBranchRoles: {
          include: { role: true, branch: true },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("İstifadəçi tapılmadı veya hesabı aktiv deyil");
    }

    // Build permission matrix
    const assignments = effectiveAssignments(user.userBranchRoles);
    const permissions = {
      roles: [...new Set(assignments.map(ubr => ubr.role.name))],
      branches: [...new Set(assignments.filter(ubr => ubr.branch.isActive).map(ubr => ubr.branch.id))],
      isSuperAdmin: assignments.some(ubr => ubr.role.name === 'SUPER_ADMIN'),
    };

    return permissions;
  }
}
