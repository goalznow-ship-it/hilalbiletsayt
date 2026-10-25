import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { AuditService, sanitizeAuditMetadata } from "./audit.service";
import { PrismaService } from "../prisma/prisma.service";

describe("AuditService", () => {
  it("persists actor, entity, action, and sanitized metadata", async () => {
    const create = vi.fn(
      async (_args: { data: Prisma.AuditLogUncheckedCreateInput }) => ({
        id: randomUUID(),
      }),
    );
    const prisma = {
      auditLog: { create },
    } as unknown as PrismaService;
    const service = new AuditService(prisma);
    const actorId = randomUUID();
    const entityId = randomUUID();

    await service.log("CANDIDATE_CREATED", actorId, "Candidate", entityId, {
      candidate_number: "QD123",
      email: "candidate@example.com",
      phone: "+994501112233",
      password: "never-store-this",
      nested: { accessToken: "secret-token", is_active: true },
    });

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({
      action: "CANDIDATE_CREATED",
      actorId,
      entityType: "Candidate",
      entityId,
    });
    expect(data?.metadata).toEqual({
      candidate_number: "QD123",
      email: "[REDACTED]",
      phone: "[REDACTED]",
      password: "[REDACTED]",
      nested: { accessToken: "[REDACTED]", is_active: true },
    });
  });

  it("redacts sensitive keys recursively and truncates deep values", () => {
    const sanitized = sanitizeAuditMetadata({
      password: "secret",
      user: {
        full_name: "Test User",
        refreshToken: "token",
        contact: { email: "test@example.com", city: "Bakı" },
      },
      levels: { one: { two: { three: { four: { five: { six: "deep" } } } } } },
    });

    expect(sanitized).toEqual({
      password: "[REDACTED]",
      user: {
        full_name: "[REDACTED]",
        refreshToken: "[REDACTED]",
        contact: { email: "[REDACTED]", city: "Bakı" },
      },
      levels: { one: { two: { three: { four: { five: "[TRUNCATED]" } } } } },
    });
  });

  it("propagates audit failure so the transaction can roll back", async () => {
    const prisma = {
      auditLog: {
        create: vi.fn(async () => {
          throw new Error("database unavailable");
        }),
      },
    } as unknown as PrismaService;
    const service = new AuditService(prisma);

    await expect(
      service.log("CANDIDATE_UPDATED", randomUUID(), "Candidate", randomUUID()),
    ).rejects.toThrow("database unavailable");
  });
});
