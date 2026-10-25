import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import type { Branch } from "@prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { TicketService } from "../src/ticket/ticket.service";
import type { AuthenticatedUser } from "../src/auth/authorization";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (!TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL tələb olunur. Məsələn: postgresql://hilal:hilal@localhost:5432/hilal_test",
  );
}

const testDatabaseName = new URL(TEST_DATABASE_URL).pathname.replace(/^\//, "");
if (!testDatabaseName.endsWith("_test")) {
  throw new Error(
    `Təhlükəsizlik: inteqrasiya testləri yalnız *_test verilənlər bazasında işləyir (cari: ${testDatabaseName})`,
  );
}

if (process.env.DATABASE_URL !== TEST_DATABASE_URL)
  throw new Error(
    "Both database URLs must point to the same isolated test database",
  );

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const ticketService = new TicketService(prisma, audit);

let admin: AuthenticatedUser;

let branchA: Branch;
let branchB: Branch;

async function seedExamSession(options?: {
  price?: number;
  capacity?: number;
  sessionStatus?: string;
  examStatus?: string;
}) {
  const exam = await prisma.exam.create({
    data: {
      code: `EX-${randomUUID().slice(0, 8)}`,
      title: "Bilet imtahanı",
      price: options?.price ?? 35,
      status: options?.examStatus ?? "PUBLISHED",
      createdBy: randomUUID(),
    },
  });

  const session = await prisma.examSession.create({
    data: {
      examId: exam.id,
      sessionCode: `S-${randomUUID().slice(0, 8)}`,
      startsAt: new Date("2026-11-01T09:00:00Z"),
      endsAt: new Date("2026-11-01T11:00:00Z"),
      venue: "Otaq A",
      capacity: options?.capacity ?? 10,
      status: options?.sessionStatus ?? "OPEN",
    },
  });

  const candidate = await prisma.candidate.create({
    data: {
      candidate_number: `QD${randomUUID().slice(0, 10).toUpperCase()}`,
      full_name: "Aysel Məmmədova",
      branch_id: options ? branchA.id : null,
    },
  });

  return { exam, session, candidate };
}

beforeAll(async () => {
  await prisma.$connect();

  const seller = await prisma.user.upsert({
    where: { email: "ticket-test-seller@example.com" },
    update: {},
    create: {
      email: "ticket-test-seller@example.com",
      fullName: "Bilet Test Satıcısı",
      passwordHash: "not-used-in-tests",
      isActive: true,
    },
  });

  admin = {
    userId: seller.id,
    email: seller.email,
    roles: ["SUPER_ADMIN"],
    branches: [],
  };
});

beforeEach(async () => {
  await prisma.ticket.deleteMany();
  await prisma.examinationRegistration.deleteMany();
  await prisma.examSession.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.candidate.deleteMany();

  branchA = await prisma.branch.upsert({
    where: { code: "TEST-BRANCH-A" },
    update: { name: "Test filialı A", isActive: true },
    create: { name: "Test filialı A", code: "TEST-BRANCH-A" },
  });
  branchB = await prisma.branch.upsert({
    where: { code: "TEST-BRANCH-B" },
    update: { name: "Test filialı B", isActive: true },
    create: { name: "Test filialı B", code: "TEST-BRANCH-B" },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Ticket purchase integration (real PostgreSQL test database)", () => {
  it("creates a ticket with the server-side exam price and a random QR token", async () => {
    const { exam, session, candidate } = await seedExamSession({ price: 35 });

    const ticket = await ticketService.generate(
      {
        examId: exam.id,
        sessionId: session.id,
        candidateId: candidate.id,
        price: 35,
        type: "STANDARD",
        paymentMethod: "CASH",
      },
      admin,
    );

    expect(ticket.price).toBe(35);
    expect(ticket.status).toBe("ACTIVE");
    expect(ticket.paymentStatus).toBe("PENDING");
    expect(ticket.qrCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ticket.qrPayload).toBe(`/tickets/verify/${ticket.qrCode}`);
    expect(ticket.candidateFullName).toBe("Aysel Məmmədova");

    const stored = await prisma.ticket.findUnique({
      where: { id: ticket.id },
    });
    expect(stored?.paymentStatus).toBe("PENDING");
    expect(stored?.registeredAt).toBeInstanceOf(Date);
  });

  it("rejects a client-supplied price that differs from the exam price", async () => {
    const { exam, session, candidate } = await seedExamSession({ price: 35 });

    await expect(
      ticketService.generate(
        {
          examId: exam.id,
          sessionId: session.id,
          candidateId: candidate.id,
          price: 10,
          type: "STANDARD",
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a duplicate active ticket for the same candidate and session", async () => {
    const { exam, session, candidate } = await seedExamSession();

    await ticketService.generate(
      { examId: exam.id, sessionId: session.id, candidateId: candidate.id },
      admin,
    );

    await expect(
      ticketService.generate(
        { examId: exam.id, sessionId: session.id, candidateId: candidate.id },
        admin,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("enforces session capacity using active tickets", async () => {
    const { exam, session, candidate } = await seedExamSession({ capacity: 1 });
    const secondCandidate = await prisma.candidate.create({
      data: {
        candidate_number: `QD${randomUUID().slice(0, 10).toUpperCase()}`,
        full_name: "Rəşad Əliyev",
        branch_id: branchA.id,
      },
    });

    await ticketService.generate(
      { examId: exam.id, sessionId: session.id, candidateId: candidate.id },
      admin,
    );

    await expect(
      ticketService.generate(
        {
          examId: exam.id,
          sessionId: session.id,
          candidateId: secondCandidate.id,
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      await prisma.ticket.count({
        where: { sessionId: session.id, status: "ACTIVE" },
      }),
    ).toBe(1);
  });

  it("rejects sales for an unpublished exam or a non-open session", async () => {
    const draft = await seedExamSession({ examStatus: "DRAFT" });
    await expect(
      ticketService.generate(
        {
          examId: draft.exam.id,
          sessionId: draft.session.id,
          candidateId: draft.candidate.id,
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const closed = await seedExamSession({ sessionStatus: "CLOSED" });
    await expect(
      ticketService.generate(
        {
          examId: closed.exam.id,
          sessionId: closed.session.id,
          candidateId: closed.candidate.id,
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("enforces branch scope for non-central users", async () => {
    const { exam, session, candidate } = await seedExamSession();
    await prisma.candidate.update({
      where: { id: candidate.id },
      data: { branch_id: branchB.id },
    });

    const branchManager: AuthenticatedUser = {
      userId: randomUUID(),
      roles: ["BRANCH_MANAGER"],
      branches: [{ id: branchA.id }],
    };

    await expect(
      ticketService.generate(
        {
          examId: exam.id,
          sessionId: session.id,
          candidateId: candidate.id,
        },
        branchManager,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("verifies by opaque QR token without exposing private candidate data", async () => {
    const { exam, session, candidate } = await seedExamSession();
    const ticket = await ticketService.generate(
      { examId: exam.id, sessionId: session.id, candidateId: candidate.id },
      admin,
    );

    const verified = await ticketService.verifyByToken(ticket.qrCode);
    expect(verified.valid).toBe(true);
    expect(verified.examTitle).toBe("Bilet imtahanı");
    expect(verified.candidateNameMasked).toBe("A**** M********");
    expect(verified).not.toHaveProperty("candidateFullName");
    expect(verified).not.toHaveProperty("candidateId");
    expect(verified).not.toHaveProperty("sellerEmail");

    await expect(
      ticketService.verifyByToken("not-a-real-token"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
