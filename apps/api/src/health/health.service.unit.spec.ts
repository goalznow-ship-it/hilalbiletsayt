import { describe, expect, it, vi } from "vitest";
import { HealthService } from "./health.service";
import { PrismaService } from "../prisma/prisma.service";

describe("Public health response", () => {
  it("does not expose connection details when the database is unavailable", async () => {
    const database = { $queryRaw: vi.fn().mockRejectedValue(new Error("internal-host:5432 secret-password")) };
    const result = await new HealthService(database as unknown as PrismaService).check();
    expect(result).toEqual({ status: "degraded", database: "disconnected", timestamp: expect.any(String) });
  });
});
