import { UserService } from "../src/user/user.service";
import { ExaminationSessionService } from "../src/examination/examination.session.service";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { PublicSalesService } from "../src/public-sales/public-sales.service";
import { TicketService } from "../src/ticket/ticket.service";

const url = process.env.DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith("_test") ||
  url !== process.env.TEST_DATABASE_URL
)
  throw new Error("Isolated *_test database required");
let app: INestApplication;
let prisma: PrismaService;
let sales: PublicSalesService;
let branchId: string;
let sessionId: string;
let examId: string;
const body = () => ({
  purchaseKey: randomUUID(),
  sessionId,
  branchId,
  fullName: "Aysel Məmmədova",
  phone: "0501234567",
});
beforeAll(async () => {
  app = (
    await Test.createTestingModule({ imports: [AppModule] }).compile()
  ).createNestApplication();
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  prisma = app.get(PrismaService);
  sales = app.get(PublicSalesService);
  branchId = (
    await prisma.branch.create({
      data: { code: randomUUID(), name: "Public test filialı" },
    })
  ).id;
  examId = (
    await prisma.exam.create({
      data: {
        code: randomUUID(),
        title: "Public test imtahanı",
        price: 3575,
        status: "PUBLISHED",
        createdBy: randomUUID(),
      },
    })
  ).id;
  sessionId = (
    await prisma.examSession.create({
      data: {
        examId,
        sessionCode: "PUBLIC",
        startsAt: new Date(Date.now() + 86400000),
        endsAt: new Date(Date.now() + 90000000),
        capacity: 10,
        status: "OPEN",
      },
    })
  ).id;
});
beforeEach(async () => {
  await prisma.auditLog.deleteMany({ where: { entityType: "PublicRate" } });
});
afterAll(async () => {
  await app?.close();
});
describe("Public sales HTTP and real database", () => {
  it("lists only published configured future available sessions without login", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/public/exams")
      .expect(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(
      response.body.exams.find((exam: { id: string }) => exam.id === examId)
        .sessions[0].remaining,
    ).toBe(10);
    expect(JSON.stringify(response.body)).not.toContain("createdBy");
  });
  it("validates input and rejects price, candidateId and payment-status injection", async () => {
    for (const extra of [
      { fullName: "a" },
      { phone: "123" },
      { price: 1 },
      { paymentStatus: "PAID" },
      { candidateId: randomUUID() },
    ]) {
      await request(app.getHttpServer())
        .post("/api/public/orders")
        .send({ ...body(), ...extra })
        .expect(400);
    }
  });
  it("creates atomically, retries concurrently and recovers receipt without authentication", async () => {
    const data = body();
    const results = await Promise.all([
      sales.purchase(data),
      sales.purchase(data),
    ]);
    expect(results[0]).toEqual(results[1]);
    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { purchaseKey: data.purchaseKey },
    });
    expect(ticket.price).toBe(3575);
    expect(ticket.paymentStatus).toBe("PENDING");
    expect(ticket.paymentDate).toBeNull();
    expect(ticket.sellerId).toBeNull();
    expect(ticket.qrCode).not.toBe(ticket.receiptToken);
    await request(app.getHttpServer())
      .post("/api/public/orders")
      .send(data)
      .expect(201)
      .expect((response) => expect(response.body).toEqual(results[0]));
    await request(app.getHttpServer())
      .post("/api/public/orders")
      .send({ ...data, fullName: "Başqa Namizəd" })
      .expect(409);
    const receipt = await request(app.getHttpServer())
      .get(`/api/public/orders/${results[0].receiptToken}`)
      .expect(200);
    expect(receipt.body.candidate.full_name).toBe(data.fullName);
    expect(receipt.body.candidate.phone).toBeUndefined();
    const verified = await request(app.getHttpServer())
      .get(`/api/ticket/verify/${ticket.qrCode}`)
      .expect(200);
    for (const value of [
      data.fullName,
      data.phone,
      ticket.receiptToken!,
      ticket.candidateId!,
    ])
      expect(JSON.stringify(verified.body)).not.toContain(value);
    await request(app.getHttpServer())
      .get(`/api/public/orders/${ticket.qrCode}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/ticket/${ticket.id}`)
      .expect(401);
    await request(app.getHttpServer())
      .put(`/api/ticket/${ticket.id}/payment`)
      .expect(401);
    await request(app.getHttpServer())
      .post("/api/public/orders")
      .send({ ...data, purchaseKey: randomUUID() })
      .expect(409);
    expect(
      await prisma.ticket.count({ where: { purchaseKey: data.purchaseKey } }),
    ).toBe(1);
    expect(
      await prisma.candidate.count({ where: { id: ticket.candidateId! } }),
    ).toBe(1);
  });
  it("rejects closed, full, unpriced and expired sessions without orphan candidates", async () => {
    const count = await prisma.candidate.count();
    await prisma.examSession.update({
      where: { id: sessionId },
      data: { status: "CLOSED" },
    });
    await expect(
      sales.purchase({ ...body(), fullName: "Bağlı Sessiya" }),
    ).rejects.toThrow();
    await prisma.examSession.update({
      where: { id: sessionId },
      data: { status: "OPEN", capacity: 1 },
    });
    await expect(
      sales.purchase({ ...body(), fullName: "Dolu Sessiya" }),
    ).rejects.toThrow();
    await prisma.examSession.update({
      where: { id: sessionId },
      data: { capacity: 10 },
    });
    await prisma.exam.update({ where: { id: examId }, data: { price: null } });
    await expect(
      sales.purchase({ ...body(), fullName: "Qiymətsiz Sessiya" }),
    ).rejects.toThrow();
    await prisma.exam.update({ where: { id: examId }, data: { price: 3575 } });
    await prisma.examSession.update({
      where: { id: sessionId },
      data: { startsAt: new Date(0) },
    });
    await expect(
      sales.purchase({ ...body(), fullName: "Keçmiş Sessiya" }),
    ).rejects.toThrow();
    expect(await prisma.candidate.count()).toBe(count);
  });
  it("protects payment and scanning with branch permissions", async () => {
    const ticket = await prisma.ticket.findFirstOrThrow({ where: { examId } });
    const service = app.get(TicketService);
    const outsider = {
      userId: randomUUID(),
      roles: ["BRANCH_MANAGER"],
      branches: [{ id: randomUUID() }],
    };
    await expect(service.confirmPayment(ticket.id, outsider)).rejects.toThrow();
    await expect(service.useTicket(ticket.id, outsider)).rejects.toThrow();
    const manager = {
      userId: randomUUID(),
      roles: ["BRANCH_MANAGER"],
      branches: [{ id: branchId }],
    };
    await expect(service.useTicket(ticket.id, manager)).rejects.toThrow(
      "ödənişi",
    );
    await service.confirmPayment(ticket.id, manager);
    await service.confirmPayment(ticket.id, manager);
    expect(
      await prisma.auditLog.count({
        where: { entityId: ticket.id, action: "TICKET_PAYMENT_CONFIRMED" },
      }),
    ).toBe(1);
    expect(
      (await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
        .paymentStatus,
    ).toBe("PAID");
  });
  it("claims a paid ticket only once during concurrent scans", async () => {
    const ticket = await prisma.ticket.findFirstOrThrow({ where: { examId } });
    const service = app.get(TicketService);
    const manager = {
      userId: randomUUID(),
      roles: ["BRANCH_MANAGER"],
      branches: [{ id: branchId }],
    };
    const scans = await Promise.allSettled([
      service.useTicket(ticket.id, manager),
      service.useTicket(ticket.id, manager),
    ]);
    expect(
      scans.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      (await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
        .status,
    ).toBe("USED");
  });

  it("serializes the last seat and preserves session ticket capacity", async () => {
    await prisma.examSession.update({
      where: { id: sessionId },
      data: { startsAt: new Date(Date.now() + 86400000), capacity: 2 },
    });
    const results = await Promise.allSettled([
      sales.purchase({ ...body(), fullName: "Son Yer Bir" }),
      sales.purchase({ ...body(), fullName: "Son Yer İki" }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(await prisma.ticket.count({ where: { sessionId } })).toBe(2);
    const sessions = app.get(ExaminationSessionService);
    await expect(sessions.update(sessionId, { capacity: 1 })).rejects.toThrow();
    await expect(
      sessions.update(sessionId, { status: "CANCELLED" }),
    ).rejects.toThrow();
  });

  it("creates users with real role IDs, scopes manager lists and rolls back invalid roles", async () => {
    const users = app.get(UserService);
    await prisma.role.upsert({
      where: { name: "SELLER" },
      create: { name: "SELLER" },
      update: {},
    });
    await prisma.role.upsert({
      where: { name: "BRANCH_MANAGER" },
      create: { name: "BRANCH_MANAGER" },
      update: {},
    });
    const user = await users.create({
      email: randomUUID() + "@example.invalid",
      fullName: "Public Test Employee",
      password: "local-test-password",
      isActive: true,
      role: "SELLER",
      branchIds: [branchId],
    });
    expect(user.userBranchRoles[0].role.name).toBe("SELLER");
    expect(user).not.toHaveProperty("passwordHash");
    await users.assignRoles(user.id, ["BRANCH_MANAGER"]);
    expect((await users.findOne(user.id)).userBranchRoles[0].role.name).toBe(
      "BRANCH_MANAGER",
    );
    await expect(
      users.assignRoles(user.id, ["NO_SUCH_ROLE"]),
    ).rejects.toThrow();
    expect((await users.findOne(user.id)).userBranchRoles[0].role.name).toBe(
      "BRANCH_MANAGER",
    );
    const unseen = await users.findAll(
      {},
      {
        userId: randomUUID(),
        roles: ["BRANCH_MANAGER"],
        branches: [{ id: randomUUID() }],
      },
    );
    expect(unseen.data).toHaveLength(0);
    const stats = await request(app.getHttpServer()).get("/api/ticket/stats");
    expect(stats.status).toBe(401);
  });

  it("requires authentication and central admin permissions for branch changes", async () => {
    await request(app.getHttpServer()).get("/api/branches").expect(401);
    await request(app.getHttpServer())
      .post("/api/branches")
      .send({ name: "Unauthorized", code: randomUUID() })
      .expect(401);
    const users = app.get(UserService);
    const manager = await users.create({
      email: randomUUID() + "@example.invalid",
      fullName: "Branch HTTP Manager",
      password: "local-test-password",
      isActive: true,
      role: "BRANCH_MANAGER",
      branchIds: [branchId],
    });
    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: manager.email, password: "local-test-password" })
      .expect(201);
    const auth = `Bearer ${login.body.access_token}`;
    const list = await request(app.getHttpServer())
      .get("/api/branches")
      .set("Authorization", auth)
      .expect(200);
    expect(list.body.map((branch: { id: string }) => branch.id)).toEqual([
      branchId,
    ]);
    await request(app.getHttpServer())
      .get(`/api/branches/${randomUUID()}`)
      .set("Authorization", auth)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/branches/${branchId}`)
      .set("Authorization", auth)
      .send({ isActive: false })
      .expect(403);
  });

  it("limits abusive purchase attempts", async () => {
    const responses = [];
    for (let i = 0; i < 11; i++)
      responses.push(
        await request(app.getHttpServer())
          .post("/api/public/orders")
          .set("X-Forwarded-For", `203.0.113.${i}`)
          .send({}),
      );
    expect(
      responses.some(
        (response) =>
          response.status === 429 && response.headers["retry-after"] === "60",
      ),
    ).toBe(true);
  });
  it("separates clients only behind explicitly trusted proxies", async () => {
    const express = app.getHttpAdapter().getInstance();
    express.set("trust proxy", ["loopback"]);
    try {
      for (let i = 1; i <= 11; i++) {
        await request(app.getHttpServer())
          .post("/api/public/orders")
          .set("X-Forwarded-For", `203.0.113.${i}`)
          .send({})
          .expect(400);
      }
    } finally {
      express.set("trust proxy", false);
    }
  });
});
