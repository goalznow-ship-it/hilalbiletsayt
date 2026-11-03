import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as argon2 from "argon2";
import { bootstrapAdmin } from "../src/bootstrap/bootstrap-admin";
import { signTicketToken } from "../src/common/qr-signature";
import { bakuBusinessDate } from "../src/common/business-date";

// Definition-of-Done acceptance tests over HTTP against an isolated database.

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL tələb olunur");
if (!new URL(databaseUrl).pathname.endsWith("_test"))
  throw new Error("Təhlükəsizlik: yalnız *_test verilənlər bazası");

// Concurrency tests send many requests from one address; the per-IP limit is
// covered separately in rate-limiting.integration.spec.ts.
process.env.API_RATE_LIMIT_PER_MINUTE = "100000";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const PASSWORD = "dod-password-123";
let app: INestApplication;
const http = () => request(app.getHttpServer());

const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

async function wipe() {
  await prisma.$transaction([
    prisma.$executeRawUnsafe("SET LOCAL hilal.allow_closure_delete = 'on'"),
    prisma.businessDayClosure.deleteMany(),
  ]);
  await prisma.omrPage.deleteMany();
  await prisma.omrUpload.deleteMany();
  await prisma.omrSheet.deleteMany();
  await prisma.omrAnswerKey.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.examinationRegistration.deleteMany();
  await prisma.question.deleteMany();
  await prisma.examSession.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.userBranchRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();
}

async function login(email: string, password = PASSWORD) {
  const response = await http().post("/api/auth/login").send({ email, password }).expect(201);
  return response.body.access_token as string;
}

async function staff(email: string, role: string, branchId: string) {
  const roleRow = await prisma.role.upsert({ where: { name: role }, create: { name: role }, update: {} });
  await prisma.user.create({
    data: {
      email, fullName: email, passwordHash: await argon2.hash(PASSWORD),
      userBranchRoles: { create: { roleId: roleRow.id, branchId } },
    },
  });
  return login(email);
}

async function candidate(branchId: string) {
  return prisma.candidate.create({
    data: {
      candidate_number: `C${randomUUID().slice(0, 10).toUpperCase()}`,
      full_name: "Leyla Həsənova",
      branch_id: branchId,
    },
  });
}

async function examWithSession(capacity: number) {
  const exam = await prisma.exam.create({
    data: { code: `DOD-${randomUUID().slice(0, 8)}`, title: "DoD imtahanı", price: 2000, status: "PUBLISHED", createdBy: randomUUID() },
  });
  const session = await prisma.examSession.create({
    data: {
      examId: exam.id, sessionCode: `S-${randomUUID().slice(0, 6)}`, capacity, status: "OPEN",
      startsAt: new Date(Date.now() + 7 * 864e5), endsAt: new Date(Date.now() + 7 * 864e5 + 72e5),
    },
  });
  return { exam, session };
}

const sell = (token: string, body: Record<string, unknown>) =>
  http().post("/api/ticket").set("Authorization", `Bearer ${token}`).send(body);

beforeAll(async () => {
  await prisma.$connect();
  await wipe();
  const { AppModule } = await import("../src/app.module");
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
});

afterAll(async () => {
  await wipe();
  await app?.close();
  await prisma.$disconnect();
});

describe("DoD: first administrator from environment", () => {
  it("creates exactly one SUPER_ADMIN, idempotently, who can log in", async () => {
    await prisma.userBranchRole.deleteMany({ where: { role: { name: "SUPER_ADMIN" } } });
    const config = { email: "Owner@Hilal.test", password: "bootstrap-password-1", branchCode: "MERKEZ" };
    const [first, second] = await Promise.all([bootstrapAdmin(prisma, config), bootstrapAdmin(prisma, config)]);
    expect([first, second].sort()).toEqual(["created", "skipped-admin-exists"]);
    expect(await bootstrapAdmin(prisma, { ...config, email: "other@hilal.test" })).toBe("skipped-admin-exists");
    expect(await prisma.user.count({ where: { email: "owner@hilal.test" } })).toBe(1);

    tokens.admin = await login("owner@hilal.test", "bootstrap-password-1");
    const me = await http().get("/api/auth/me").set("Authorization", `Bearer ${tokens.admin}`).expect(200);
    expect(JSON.stringify(me.body)).toContain("SUPER_ADMIN");
  });

  it("does nothing when not configured", async () => {
    expect(await bootstrapAdmin(prisma, {})).toBe("skipped-not-configured");
  });
});

describe("DoD: branch-isolated seller sales", () => {
  beforeAll(async () => {
    const [a, b] = await Promise.all([
      prisma.branch.create({ data: { name: "Filial A", code: `A-${randomUUID().slice(0, 6)}` } }),
      prisma.branch.create({ data: { name: "Filial B", code: `B-${randomUUID().slice(0, 6)}` } }),
    ]);
    ids.branchA = a.id;
    ids.branchB = b.id;
    tokens.sellerA = await staff("seller-a@hilal.test", "SELLER", a.id);
    tokens.sellerB = await staff("seller-b@hilal.test", "SELLER", b.id);
    tokens.managerA = await staff("manager-a@hilal.test", "BRANCH_MANAGER", a.id);
  });

  it("seller of A sells, seller of B can neither see nor sell for A", async () => {
    const { exam, session } = await examWithSession(10);
    const buyer = await candidate(ids.branchA);
    const sold = await sell(tokens.sellerA, { examId: exam.id, sessionId: session.id, candidateId: buyer.id }).expect(201);
    expect(sold.body.branchId).toBe(ids.branchA);
    ids.ticketA = sold.body.id;

    const listA = await http().get("/api/ticket").set("Authorization", `Bearer ${tokens.sellerA}`).expect(200);
    expect(listA.body.data.map((t: { id: string }) => t.id)).toContain(sold.body.id);

    const listB = await http().get("/api/ticket").set("Authorization", `Bearer ${tokens.sellerB}`).expect(200);
    expect(listB.body.data.map((t: { id: string }) => t.id)).not.toContain(sold.body.id);
    await http().get(`/api/ticket/${sold.body.id}`).set("Authorization", `Bearer ${tokens.sellerB}`).expect(403);
    await http().get(`/api/ticket/code/${sold.body.code}`).set("Authorization", `Bearer ${tokens.sellerB}`).expect(403);
    await http().put(`/api/ticket/${sold.body.id}/payment`).set("Authorization", `Bearer ${tokens.sellerB}`).expect(403);

    // Seller B cannot sell into branch A, nor reach a branch-A candidate.
    await sell(tokens.sellerB, { examId: exam.id, sessionId: session.id, branchId: ids.branchA }).expect(403);
    const other = await candidate(ids.branchA);
    await sell(tokens.sellerB, { examId: exam.id, sessionId: session.id, candidateId: other.id }).expect(404);

    const statsB = await http().get("/api/ticket/stats").set("Authorization", `Bearer ${tokens.sellerB}`).expect(200);
    expect(statsB.body).toEqual([]);
  });

  it("seller confirms payment for own branch only", async () => {
    await http().put(`/api/ticket/${ids.ticketA}/payment`).set("Authorization", `Bearer ${tokens.sellerA}`).expect(200);
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ids.ticketA } });
    expect(ticket.paymentStatus).toBe("PAID");
  });
});

describe("DoD: concurrent sales never oversell or duplicate", () => {
  it("20 parallel sales into a 5-seat session yield exactly 5 tickets", async () => {
    const { exam, session } = await examWithSession(5);
    const buyers = await Promise.all(Array.from({ length: 20 }, () => candidate(ids.branchA)));
    const responses = await Promise.all(
      buyers.map((b) => sell(tokens.sellerA, { examId: exam.id, sessionId: session.id, candidateId: b.id })),
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    expect(statuses.filter((s) => s !== 201).every((s) => s === 400)).toBe(true);
    expect(await prisma.ticket.count({ where: { sessionId: session.id, status: { in: ["ACTIVE", "USED"] } } })).toBe(5);
  });

  it("10 parallel sales of the same seat to one candidate yield one ticket", async () => {
    const { exam, session } = await examWithSession(50);
    const buyer = await candidate(ids.branchA);
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => sell(tokens.sellerA, { examId: exam.id, sessionId: session.id, candidateId: buyer.id })),
    );
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(9);
    expect(await prisma.ticket.count({ where: { sessionId: session.id, candidateId: buyer.id } })).toBe(1);
  });

  it("the database rejects oversell and duplicates even when application checks are bypassed", async () => {
    const { exam, session } = await examWithSession(1);
    const buyer = await candidate(ids.branchA);
    const raw = (candidateId: string) => prisma.ticket.create({
      data: {
        code: `HK-${randomBytes(8).toString("hex")}`, examId: exam.id, sessionId: session.id, candidateId,
        branchId: ids.branchA, price: 2000, qrCode: randomBytes(32).toString("base64url"),
      },
    });
    await raw(buyer.id);
    await expect(raw(buyer.id)).rejects.toThrow();
    const second = await candidate(ids.branchA);
    await expect(raw(second.id)).rejects.toThrow(/HILAL_SESSION_CAPACITY_EXCEEDED/);
  });
});

describe("DoD: tamper-proof QR and single admission", () => {
  it("rejects forged codes and admits a paid ticket exactly once under concurrency", async () => {
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ids.ticketA } });
    const signed = signTicketToken(ticket.qrCode);
    const forgedToken = randomBytes(32).toString("base64url");
    const forged = `${forgedToken}.${signed.split(".")[1]}`;

    await http().get(`/api/ticket/verify/${forged}`).expect(404);
    await http().get(`/api/ticket/verify/${ticket.qrCode}`).expect(404);
    const verified = await http().get(`/api/ticket/verify/${signed}`).expect(200);
    expect(verified.body.valid).toBe(true);

    const auth = `Bearer ${tokens.sellerA}`;
    await http().post("/api/ticket/scan").set("Authorization", auth).send({ qr: forged }).expect(400);
    const scans = await Promise.all(
      Array.from({ length: 5 }, () =>
        http().post("/api/ticket/scan").set("Authorization", auth).send({ qr: `https://bilet.example.az/tickets/verify/${signed}` })),
    );
    expect(scans.filter((r) => r.status === 201)).toHaveLength(1);
    expect(scans.filter((r) => r.status === 409)).toHaveLength(4);
    await http().post("/api/ticket/scan").set("Authorization", auth).send({ qr: signed }).expect(409);
  });

  it("a seller of another branch cannot admit the ticket", async () => {
    const { exam, session } = await examWithSession(5);
    const sold = await sell(tokens.sellerA, { examId: exam.id, sessionId: session.id, candidateId: (await candidate(ids.branchA)).id }).expect(201);
    await http().post("/api/ticket/scan").set("Authorization", `Bearer ${tokens.sellerB}`).send({ qr: sold.body.qrCode }).expect(403);
  });
});

describe("DoD: published results only, protected lookup", () => {
  async function scoredSheet(examId: string, ticketId: string, candidateId: string, status: "COMPLETED" | "REVIEW") {
    const key = await prisma.omrAnswerKey.upsert({
      where: { examId_variant_version: { examId, variant: "A", version: 1 } },
      update: {},
      create: {
        examId, variant: "A", version: 1, choiceCount: 5, digest: "test",
        answers: [{ questionId: randomUUID(), correct: "A", points: 1 }, { questionId: randomUUID(), correct: "B", points: 1 }],
        scoring: { wrong: 0, unanswered: 0, multiple: 0, floorAtZero: true },
      },
    });
    const sheet = await prisma.omrSheet.create({
      data: { token: randomBytes(32).toString("base64url"), ticketId, answerKeyId: key.id, candidateId, examId, branchId: ids.branchA },
    });
    const upload = await prisma.omrUpload.create({
      data: { examId, createdBy: randomUUID(), sha256: createHash("sha256").update(randomUUID()).digest("hex"), size: 1, mime: "image/png", status: status === "REVIEW" ? "REVIEW" : "COMPLETED" },
    });
    return prisma.omrPage.create({
      data: {
        uploadId: upload.id, pageIndex: 0, sheetId: sheet.id, status,
        data: { score: status === "COMPLETED" ? 1 : null, maximumScore: 2,
          outcomes: [{ question: 1, outcome: "CORRECT", points: 1 }, { question: 2, outcome: "BLANK", points: 0 }] },
      },
    });
  }

  it("hides results until published, refuses to publish with a review queue, then serves them", async () => {
    const { exam, session } = await examWithSession(5);
    const [c1, c2] = [await candidate(ids.branchA), await candidate(ids.branchA)];
    const t1 = await sell(tokens.sellerA, { examId: exam.id, sessionId: session.id, candidateId: c1.id }).expect(201);
    const t2 = await sell(tokens.sellerA, { examId: exam.id, sessionId: session.id, candidateId: c2.id }).expect(201);
    await scoredSheet(exam.id, t1.body.id, c1.id, "COMPLETED");
    const reviewPage = await scoredSheet(exam.id, t2.body.id, c2.id, "REVIEW");

    const lookup = (ticket: string, candidateNumber: string) =>
      http().post("/api/public/results/lookup").send({ ticket, candidateNumber });

    const hidden = await lookup(t1.body.qrCode, c1.candidate_number).expect(404);
    const adminAuth = `Bearer ${tokens.admin}`;
    await http().post(`/api/results/exams/${exam.id}/publish`).set("Authorization", `Bearer ${tokens.sellerA}`).expect(403);
    await http().post(`/api/results/exams/${exam.id}/publish`).set("Authorization", adminAuth).expect(409);

    await prisma.omrPage.update({ where: { id: reviewPage.id }, data: { status: "COMPLETED", data: { score: 2, maximumScore: 2, outcomes: [] } } });
    await prisma.omrUpload.update({ where: { id: reviewPage.uploadId }, data: { status: "COMPLETED" } });
    await http().post(`/api/results/exams/${exam.id}/publish`).set("Authorization", adminAuth).expect(201);

    const shown = await lookup(t1.body.qrCode, c1.candidate_number.toLowerCase()).expect(200);
    expect(shown.body).toMatchObject({ score: 1, maximumScore: 2, correct: 1, blank: 1, wrong: 0 });
    expect(JSON.stringify(shown.body)).not.toContain("Leyla");
    await lookup(t1.body.code, c1.candidate_number).expect(200);

    // Wrong second factor and someone else's ticket look exactly like "not published".
    const wrong = await lookup(t1.body.qrCode, c2.candidate_number).expect(404);
    expect(wrong.body.message).toBe(hidden.body.message);
    await lookup(`${randomBytes(32).toString("base64url")}.${randomBytes(32).toString("base64url")}`, c1.candidate_number).expect(404);

    // Published results are frozen for OMR changes.
    await http().post(`/api/omr/exams/${exam.id}/uploads`).set("Authorization", adminAuth)
      .attach("files", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), { filename: "x.png", contentType: "image/png" }).expect(409);

    await http().post(`/api/results/exams/${exam.id}/unpublish`).set("Authorization", adminAuth).expect(201);
    await lookup(t1.body.qrCode, c1.candidate_number).expect(404);
  });

  it("limits lookups to 10 per minute per address", async () => {
    await prisma.auditLog.deleteMany({ where: { entityType: "PublicRate" } });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const response = await http().post("/api/public/results/lookup").send({ ticket: "HK-NOTEXISTING", candidateNumber: `X${i}00` });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});

describe("DoD: closing the day freezes the branch's sales", () => {
  it("blocks sales, payments, cancellations and edits after closure but still admits holders", async () => {
    const { exam, session } = await examWithSession(20);
    const paid = await sell(tokens.sellerA, { examId: exam.id, sessionId: session.id, candidateId: (await candidate(ids.branchA)).id }).expect(201);
    await http().put(`/api/ticket/${paid.body.id}/payment`).set("Authorization", `Bearer ${tokens.sellerA}`).expect(200);
    const pending = await sell(tokens.sellerA, { examId: exam.id, sessionId: session.id, candidateId: (await candidate(ids.branchA)).id }).expect(201);

    const preview = await http().get("/api/day-closures/preview").query({ branchId: ids.branchA })
      .set("Authorization", `Bearer ${tokens.sellerA}`).expect(200);
    expect(preview.body.closed).toBe(false);

    await http().post("/api/day-closures").set("Authorization", `Bearer ${tokens.sellerA}`).send({ branchId: ids.branchA }).expect(403);
    await http().post("/api/day-closures").set("Authorization", `Bearer ${tokens.managerA}`).send({ branchId: ids.branchB }).expect(403);
    const tomorrow = bakuBusinessDate(new Date(Date.now() + 864e5));
    await http().post("/api/day-closures").set("Authorization", `Bearer ${tokens.managerA}`).send({ branchId: ids.branchA, date: tomorrow }).expect(400);

    const closed = await http().post("/api/day-closures").set("Authorization", `Bearer ${tokens.managerA}`).send({ branchId: ids.branchA }).expect(201);
    expect(closed.body.ticketCount).toBe(preview.body.summary.ticketCount);
    expect(closed.body.paidAmount).toBe(preview.body.summary.paidAmount);
    await http().post("/api/day-closures").set("Authorization", `Bearer ${tokens.managerA}`).send({ branchId: ids.branchA }).expect(409);

    const auth = `Bearer ${tokens.sellerA}`;
    await sell(tokens.sellerA, { examId: exam.id, sessionId: session.id, candidateId: (await candidate(ids.branchA)).id }).expect(409);
    await http().put(`/api/ticket/${pending.body.id}/payment`).set("Authorization", auth).expect(409);
    await http().put(`/api/ticket/${pending.body.id}/cancel`).set("Authorization", auth).expect(409);
    await expect(prisma.ticket.update({ where: { id: paid.body.id }, data: { price: 1 } })).rejects.toThrow(/HILAL_BUSINESS_DAY_CLOSED/);
    await expect(prisma.ticket.delete({ where: { id: paid.body.id } })).rejects.toThrow(/HILAL_BUSINESS_DAY_CLOSED/);
    await expect(prisma.businessDayClosure.update({ where: { id: closed.body.id }, data: { paidAmount: 0 } })).rejects.toThrow(/HILAL_BUSINESS_DAY_CLOSED/);

    // Exam-day admission of an already sold, paid ticket is still allowed.
    await http().post("/api/ticket/scan").set("Authorization", auth).send({ qr: paid.body.qrCode }).expect(201);

    // Branch B keeps selling.
    await sell(tokens.sellerB, { examId: exam.id, sessionId: session.id, candidateId: (await candidate(ids.branchB)).id }).expect(201);

    const list = await http().get("/api/day-closures").query({ branchId: ids.branchA }).set("Authorization", auth).expect(200);
    expect(list.body).toHaveLength(1);
    await http().get("/api/day-closures").query({ branchId: ids.branchA }).set("Authorization", `Bearer ${tokens.sellerB}`).expect(403);
  });
});
