import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PublicRateGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    const write = request.method === "POST";
    const key = createHash("sha256")
      .update(`${request.ip}:${write}:${Math.floor(Date.now() / 60000)}`)
      .digest("hex");
    // Express resolves the IP using only explicitly configured trusted proxies.
    const allowed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text",
        key,
      );
      const count = await tx.auditLog.count({
        where: { entityType: "PublicRate", entityId: key },
      });
      if (count >= (write ? 10 : 120)) return false;
      await tx.auditLog.create({
        data: {
          action: "PUBLIC_RATE",
          entityType: "PublicRate",
          entityId: key,
        },
      });
      return true;
    });
    if (!allowed) {
      response.setHeader("Retry-After", "60");
      throw new HttpException(
        "Çox sayda sorğu göndərilib. Bir dəqiqə sonra yenidən cəhd edin.",
        429,
      );
    }
    return true;
  }
}
