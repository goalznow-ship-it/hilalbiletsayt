import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { effectiveAssignments } from "./authorization";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService, private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow("JWT_SECRET"),
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        userBranchRoles: {
          include: { role: true, branch: true },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException("İstifadəçi tapılmadı");
    }
    if (!user.isActive) {
      throw new UnauthorizedException("İstifadəçi hesabı aktiv deyil");
    }
    if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException("Sessiya bitib. Yenidən daxil olun");
    }

    const assignments = effectiveAssignments(user.userBranchRoles);
    const roles = [...new Set(assignments.map((entry) => entry.role.name))];
    if (!roles.length) throw new UnauthorizedException("Hesaba aktiv filial üzrə rol təyin edilməyib.");

    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      role: roles[0],
      roles,
      branches: [...new Map(assignments.filter(entry => entry.branch.isActive).map(entry => [entry.branchId, entry.branch])).values()],
      userBranchRoles: assignments.map((entry) => ({
        branchId: entry.branchId,
        role: entry.role.name,
      })),
    };
  }
}
