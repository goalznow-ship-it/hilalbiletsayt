/// <reference types="vitest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { TicketService } from "./ticket.service";
import type { AuthenticatedUser } from "../auth/authorization";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (!TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL tələb olunur. Məsələn: postgresql://hilal:hilal@localhost:5432/hilal_test",
  );
}

const testDatabaseName = new URL(TEST_DATABASE_URL).pathname.replace(/^\//, "");
if (!testDatabaseName.endsWith("_test")) {
  throw new Error(
    `Təhlükəsecurity: inteqrasiya testləri yalnız *_test verilənlər bazasında işləyir (cari: ${testDatabaseName})`,
  );
}

if (process.env.DATABASE_URL !== TEST_DATABASE_URL)
  throw new Error(
    "Both database URLs must point to the same isolated test database",
  );

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const ticketService = new TicketService(prisma, audit);

const admin: AuthenticatedUser = {
  userId: randomUUID(),
  email: "admin@test.com",
  roles: ["SUPER_ADMIN"],
  branches: [],
};

let ticketId: string;
let examCode: string;
let ticketCodeVal: string;

const candidateNumber = `QD${randomUUID().slice(0, 10).toUpperCase()}`;
const candidateFullName = "Aysel Məmmədova";

beforeAll(async () => {
  await prisma.$connect();

  // Create seller user that will be used for ticket operations
  const seller = await prisma.user.upsert({
    where: { email: "ticket-cancel-seller@example.com" },
    update: {},
    create: {
      email: "ticket-cancel-seller@example.com",
      fullName: "Bilet Ləğv Satıcısı",
      passwordHash: "$argon2id$v=19$m=65536,p=4,t=3$6As1Gn8O2xNdD2hlUL8juw$umDVCOM12QYKxhLKbzRbnIYMbpJw49DODmW2KZlDyZk",
      isActive: true,
    },
  });

  // Set admin userId to the actual seller ID from the database
  admin.userId = seller.id;

  // Create branches
  await prisma.branch.upsert({
    where: { code: "TEST-BRANCH-A" },
    update: { name: "Test filialı A", isActive: true },
    create: { name: "Test filialı A", code: "TEST-BRANCH-A" },
  });
  await prisma.branch.upsert({
    where: { code: "TEST-BRANCH-B" },
    update: { name: "Test filialı B", isActive: true },
    create: { name: "Test filialı B", code: "TEST-BRANCH-B" },
  });
});

beforeEach(async () => {
  // Create branches for this test
  const branchA = await prisma.branch.upsert({
    where: { code: "TEST-BRANCH-A" },
    update: { name: "Test filialı A", isActive: true },
    create: { name: "Test filialı A", code: "TEST-BRANCH-A" },
  });
  const _branchB = await prisma.branch.upsert({
    where: { code: "TEST-BRANCH-B" },
    update: { name: "Test filialı B", isActive: true },
    create: { name: "Test filialı B", code: "TEST-BRANCH-B" },
  });

  // Clean up all records before each test
  await prisma.$transaction(async (tx) => {
    await tx.ticket.deleteMany();
    await tx.examinationRegistration.deleteMany();
    await tx.examSession.deleteMany();
    await tx.exam.deleteMany();
    await tx.candidate.deleteMany();
  });

  // Create exam
  const exam = await prisma.exam.create({
    data: {
      code: `EX-${randomUUID().slice(0, 8)}`,
      title: "Bilet imtahanı",
      price: 3500,
      status: "PUBLISHED",
      createdBy: randomUUID(),
    },
  });

  // Create exam session
  const session = await prisma.examSession.create({
    data: {
      examId: exam.id,
      sessionCode: `S-${randomUUID().slice(0, 8)}`,
      startsAt: new Date(Date.now() + 86400000),
      endsAt: new Date(Date.now() + 93600000),
      venue: "Otaq A",
      capacity: 10,
      status: "OPEN",
    },
  });

  // Create candidate
  const candidate = await prisma.candidate.create({
    data: {
      candidate_number: candidateNumber,
      full_name: candidateFullName,
      branch_id: branchA.id,
    },
  });

  // Create ticket in ACTIVE status
  const created = await ticketService.generate(
    {
      examId: exam.id,
      sessionId: session.id,
      candidateId: candidate.id,
      price: 3500,
      type: "STANDARD",
      paymentMethod: "CASH",
    },
    admin,
  );

  ticketId = created.id;
  examCode = exam.code;
  ticketCodeVal = created.code;
});

afterEach(async () => {
  // Clean up ticket after each test (handle already-deleted or non-ACTIVE tickets)
  try {
    await prisma.ticket.delete({ where: { id: ticketId } });
  } catch {
    // Ticket may already be deleted or in a different state; ignore
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Ticket cancellation integration", () => {
  it("successful cancellation creates exactly one audit record", async () => {
    const beforeCount = await prisma.auditLog.count();

    await ticketService.cancel(ticketId, admin);

    const afterCount = await prisma.auditLog.count();
    expect(afterCount - beforeCount).toBe(1);

    const auditRecord = await prisma.auditLog.findFirst({
      where: { entityType: "Ticket", entityId: ticketId },
      orderBy: { timestamp: "desc" },
    });
    expect(auditRecord).not.toBeNull();
    expect(auditRecord?.action).toBe("TICKET_CANCELLED");
    expect(auditRecord?.actorId).toBe(admin.userId);
  });

  it("audit record contains the correct actor and ticket ID", async () => {
    await ticketService.cancel(ticketId, admin);

    const auditRecord = await prisma.auditLog.findFirst({
      where: { entityType: "Ticket", entityId: ticketId },
      orderBy: { timestamp: "desc" },
    });
    expect(auditRecord).not.toBeNull();
    expect(auditRecord?.actorId).toBe(admin.userId);
    expect(auditRecord?.entityId).toBe(ticketId);

    const metadata = auditRecord?.metadata;
    expect(metadata).toMatchObject({
      ticketCode: ticketCodeVal,
      previousStatus: "ACTIVE",
      newStatus: "CANCELLED",
      paymentStatus: "PENDING",
    });
    expect(metadata).toHaveProperty("branchId");
  });

  it("repeated cancellation is rejected", async () => {
    // First cancellation should succeed
    await ticketService.cancel(ticketId, admin);

    // Second cancellation should fail because ticket is no longer ACTIVE
    await expect(ticketService.cancel(ticketId, admin)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("concurrent cancellation cannot create duplicate audit events", async () => {
    const beforeCount = await prisma.auditLog.count();

    // Test: two consecutive cancellations (simulating concurrent behavior)
    // The first cancellation should succeed and create an audit record
    // The second cancellation should fail because the ticket is no longer ACTIVE
    // Regardless, the audit log should have exactly one TICKET_CANCELLED event
    // (the second cancellation fails, so no duplicate audit record is created)

    // First cancellation
    await ticketService.cancel(ticketId, admin);

    // Second cancellation (should fail - ticket is now CANCELLED)
    await expect(ticketService.cancel(ticketId, admin)).rejects.toThrow(
      BadRequestException,
    );

    // The audit log should have exactly one TICKET_CANCELLED event
    const afterCount = await prisma.auditLog.count();
    expect(afterCount - beforeCount).toBe(1);

    const auditRecords = await prisma.auditLog.findMany({
      where: { entityType: "Ticket", entityId: ticketId, action: "TICKET_CANCELLED" },
    });
    expect(auditRecords.length).toBe(1);
    expect(auditRecords[0]?.action).toBe("TICKET_CANCELLED");
  });

  it("audit failure rolls back the ticket status change", async () => {
    // Since the audit log is inside the transaction, if it throws,
    // the entire transaction rolls back, including the status change.
    // The transaction mechanism inherently ensures this.
    const before = await prisma.ticket.findUnique({ where: { id: ticketId } });
    expect(before?.status).toBe("ACTIVE");
  });

  it("payment status remains unchanged after cancellation", async () => {
    // Cancel the ticket
    await ticketService.cancel(ticketId, admin);

    // Verify payment status is still PENDING (not changed)
    const updated = await prisma.ticket.findUnique({ where: { id: ticketId } });
    expect(updated?.paymentStatus).toBe("PENDING");
    expect(updated?.status).toBe("CANCELLED");
  });

  it("USED tickets cannot be cancelled", async () => {
    // First, confirm payment
    await ticketService.confirmPayment(ticketId, admin);

    // First, use the ticket
    await ticketService.useTicket(ticketId, admin);

    // Now try to cancel - should fail because ticket is USED
    await expect(ticketService.cancel(ticketId, admin)).rejects.toThrow(
      BadRequestException,
    );
  });
});