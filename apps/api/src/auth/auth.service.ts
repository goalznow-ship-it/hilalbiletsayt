import { Injectable, UnauthorizedException, ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import * as argon2 from "argon2";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findFirst({
      where: { email },
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
    const permissions = {
      roles: user.userBranchRoles.map(ubr => ubr.role.name),
      branches: user.userBranchRoles.map(ubr => ubr.branch.id),
      isSuperAdmin: user.userBranchRoles.some(ubr => ubr.role.name === 'SUPER_ADMIN'),
    };

    return permissions;
  }
}
