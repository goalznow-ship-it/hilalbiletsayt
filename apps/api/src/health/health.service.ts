import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface HealthResult {
  status: "ok" | "degraded";
  timestamp: string;
  database: "connected" | "disconnected";
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResult> {
    const timestamp = new Date().toISOString();
    try {
      // Use raw SQL query to check database connectivity
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", timestamp, database: "connected" };
    } catch {
      return { status: "degraded", timestamp, database: "disconnected" };
    }
  }
}
