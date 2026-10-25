import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";

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

    const roles = [...new Set(user.userBranchRoles.map((entry) => entry.role.name))];

    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      role: roles[0],
      roles,
      branches: user.userBranchRoles.map((entry) => entry.branch),
      userBranchRoles: user.userBranchRoles.map((entry) => ({
        branchId: entry.branchId,
        role: entry.role.name,
      })),
    };
  }
}
