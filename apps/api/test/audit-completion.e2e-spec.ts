import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { UserService } from "../src/user/user.service";
import { TicketService } from "../src/ticket/ticket.service";
import { AuditService } from "../src/audit/audit.service";

const url = process.env.DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test") || url !== process.env.TEST_DATABASE_URL)
  throw new Error("Isolated *_test database required");

let app: INestApplication;
let prisma: PrismaService;
let admin: string;
let seller: string;
let manager: string;
let sellerId: string;
let branchA: string;
let branchB: string;
const password = "Audit-test-password-123!";
const future = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

beforeAll(async () => {
  app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);
  branchA = (await prisma.branch.create({ data: { code: randomUUID(), name: "Audit A" } })).id;
  branchB = (await prisma.branch.create({ data: { code: randomUUID(), name: "Audit B private" } })).id;
  const users = app.get(UserService);
  for (const role of ["SUPER_ADMIN", "BRANCH_MANAGER", "SELLER"])
    await prisma.role.upsert({ where: { name: role }, create: { name: role }, update: {} });
  const login = async (role: string, branchIds: string[]) => {
    const user = await users.create({ email: `${randomUUID()}@audit.invalid`, fullName: role, password, role: role as "SELLER", branchIds, isActive: true });
    const response = await request(app.getHttpServer()).post("/api/auth/login").send({ email: user.email, password }).expect(201);
    return { token: `Bearer ${response.body.access_token}`, id: user.id };
  };
  admin = (await login("SUPER_ADMIN", [branchA])).token;
  const employee = await login("SELLER", [branchA]);
  seller = employee.token;
  sellerId = employee.id;
  manager = (await login("BRANCH_MANAGER", [branchA])).token;
});
afterAll(async () => { await app?.close(); });

async function fixture(options: { branchId?: string; paymentMethod?: string } = {}) {
  const exam = await prisma.exam.create({ data: { code: randomUUID(), title: "Audit exam", price: 3500, status: "PUBLISHED", createdBy: sellerId } });
  const session = await prisma.examSession.create({ data: { examId: exam.id, sessionCode: randomUUID(), startsAt: future(24), endsAt: future(26), capacity: 10, status: "OPEN" } });
  const candidate = await prisma.candidate.create({ data: { candidate_number: randomUUID(), full_name: "Audit Candidate", branch_id: options.branchId ?? branchA } });
  const ticket = await app.get(TicketService).generate({ examId: exam.id, sessionId: session.id, candidateId: candidate.id, paymentMethod: options.paymentMethod ?? "CASH" }, { userId: sellerId, roles: ["SUPER_ADMIN"] });
  return { exam, session, candidate, ticket };
}

describe("Audit regressions against real HTTP and PostgreSQL", () => {
  it("rejects malformed login input before querying credentials", async () => {
    for (const body of [{ email: { contains: "@" }, password }, { email: "bad", password }, { email: "a@example.invalid", password: {} }])
      await request(app.getHttpServer()).post("/api/auth/login").send(body).expect(400);
  });

  it("filters and paginates question metadata and samples only eligible active questions", async () => {
    const { exam } = await fixture();
    const make = (overrides = {}) => request(app.getHttpServer()).post("/api/question").set("Authorization", admin)
      .send({ examId: exam.id, question: "Triangle area?", variants: "A|B|C|D", correct: 2, points: 2,
        subject: "Riyaziyyat", topic: "Həndəsə", imageUrl: "https://example.com/triangle.png", ...overrides });
    const first = await make().expect(201);
    expect(first.body).toMatchObject({ subject: "Riyaziyyat", topic: "Həndəsə", imageUrl: "https://example.com/triangle.png" });
    const second = await make().expect(201);
    await make({ isActive: false }).expect(201);
    await make({ variants: "A|B", correct: 1 }).expect(201);
    await make({ imageUrl: "javascript:alert(1)" }).expect(400);
    const list = await request(app.getHttpServer()).get(`/api/question?examId=${exam.id}&isActive=true&subject=Riyaziyyat&page=2&limit=1`)
      .set("Authorization", admin).expect(200);
    expect(list.body).toMatchObject({ total: 3, page: 2, totalPages: 3 });
    expect(list.body.data).toHaveLength(1);
    const random = await request(app.getHttpServer()).get(`/api/question/random?examId=${exam.id}&count=2&choiceCount=4&topic=${encodeURIComponent("Həndəsə")}`)
      .set("Authorization", admin).expect(200);
    expect(random.body.map((row: { id: string }) => row.id).sort()).toEqual([first.body.id, second.body.id].sort());
    await request(app.getHttpServer()).get(`/api/question/random?examId=${exam.id}&count=5&choiceCount=4`).set("Authorization", admin).expect(400);
    await request(app.getHttpServer()).get(`/api/question/random?examId=${exam.id}&count=1&choiceCount=4`).set("Authorization", seller).expect(403);
    const edited = await request(app.getHttpServer()).patch(`/api/question/${first.body.id}`).set("Authorization", admin)
      .send({ imageUrl: null, topic: "Cəbr" }).expect(200);
    expect(edited.body).toMatchObject({ imageUrl: null, topic: "Cəbr" });
  });

  it("creates and edits an employee's role and branch through the real HTTP form contract", async () => {
    const created = await request(app.getHttpServer()).post("/api/users").set("Authorization", admin)
      .send({ email: `${randomUUID()}@audit.invalid`, fullName: "New employee", password, role: "SELLER", branchIds: [branchA] }).expect(201);
    const changed = await request(app.getHttpServer()).patch(`/api/users/${created.body.id}`).set("Authorization", admin)
      .send({ fullName: "Updated employee", role: "BRANCH_MANAGER", branchIds: [branchB] }).expect(200);
    expect(changed.body.userBranchRoles.map((entry: { branchId: string; role: { name: string } }) => [entry.branchId, entry.role.name]))
      .toEqual([[branchB, "BRANCH_MANAGER"]]);
    const issued = await request(app.getHttpServer()).post("/api/auth/login").send({ email: created.body.email, password }).expect(201);
    for (const isActive of [false, true])
      await request(app.getHttpServer()).patch(`/api/users/${created.body.id}/status`).set("Authorization", admin).send({ isActive }).expect(200);
    await request(app.getHttpServer()).get("/api/auth/me").set("Authorization", `Bearer ${issued.body.access_token}`).expect(401);
    await request(app.getHttpServer()).post("/api/users").set("Authorization", admin)
      .send({ email: `${randomUUID()}@audit.invalid`, fullName: "Weak password", password: "123456", branchIds: [branchA] }).expect(400);
  });

  it("creates a published exam, opens its session and exposes it in the public catalog", async () => {
    const exam = await request(app.getHttpServer()).post("/api/exams").set("Authorization", admin)
      .send({ code: randomUUID(), title: "Published via form", price: 3500, status: "PUBLISHED" }).expect(201);
    expect(exam.body.status).toBe("PUBLISHED");
    const session = await request(app.getHttpServer()).post("/api/exam-sessions").set("Authorization", admin)
      .send({ examId: exam.body.id, sessionCode: randomUUID(), startsAt: future(24), endsAt: future(26), capacity: 2, venue: "Bakı" }).expect(201);
    const catalog = async () => (await request(app.getHttpServer()).get("/api/public/exams").expect(200)).body.exams;
    expect((await catalog()).some((row: { id: string }) => row.id === exam.body.id)).toBe(false);
    await request(app.getHttpServer()).patch(`/api/exam-sessions/${session.body.id}`).set("Authorization", admin).send({ status: "OPEN" }).expect(200);
    const visible = (await catalog()).find((row: { id: string }) => row.id === exam.body.id);
    expect(visible.price).toBe(3500);
    expect(visible.sessions[0].remaining).toBe(2);
    expect(await prisma.auditLog.count({ where: { entityId: exam.body.id, action: "EXAM_CREATED" } })).toBe(1);
  });

  it("rejects publishing without a price and keeps draft/archived/expired sessions hidden", async () => {
    await request(app.getHttpServer()).post("/api/exams").set("Authorization", admin)
      .send({ code: randomUUID(), title: "Unpriced", status: "PUBLISHED" }).expect(400);
    const { exam, session } = await fixture();
    for (const status of ["DRAFT", "ARCHIVED"]) {
      await prisma.exam.update({ where: { id: exam.id }, data: { status } });
      const catalog = await request(app.getHttpServer()).get("/api/public/exams").expect(200);
      expect(catalog.body.exams.some((row: { id: string }) => row.id === exam.id)).toBe(false);
    }
    await prisma.exam.update({ where: { id: exam.id }, data: { status: "PUBLISHED" } });
    await prisma.examSession.update({ where: { id: session.id }, data: { startsAt: new Date(0) } });
    const catalog = await request(app.getHttpServer()).get("/api/public/exams").expect(200);
    expect(catalog.body.exams.some((row: { id: string }) => row.id === exam.id)).toBe(false);
  });

  it("edits session times/venue and reopens a closed sale", async () => {
    const { session } = await fixture();
    const endpoint = `/api/exam-sessions/${session.id}`;
    const startsAt = future(48), endsAt = future(50);
    await request(app.getHttpServer()).patch(endpoint).set("Authorization", admin)
      .send({ startsAt, endsAt, venue: "Yeni zal", capacity: 15 }).expect(200)
      .expect(response => { expect(response.body.startsAt).toBe(startsAt); expect(response.body.venue).toBe("Yeni zal"); });
    await request(app.getHttpServer()).patch(endpoint).set("Authorization", admin).send({ status: "CLOSED" }).expect(200);
    await request(app.getHttpServer()).patch(endpoint).set("Authorization", admin).send({ status: "OPEN" }).expect(200);
    await request(app.getHttpServer()).patch(endpoint).set("Authorization", admin).send({ endsAt: future(1) }).expect(400);
  });

  it("never exposes another branch's ticket through a shared candidate registration", async () => {
    const { exam, session, candidate, ticket } = await fixture({ branchId: branchB });
    await prisma.examinationRegistration.create({ data: { candidate_id: candidate.id, exam_id: exam.id, session_id: session.id, branch_id: branchA, status: "ACTIVE" } });
    const list = await request(app.getHttpServer()).get(`/api/ticket?examId=${exam.id}`).set("Authorization", seller).expect(200);
    expect(list.body.data).toHaveLength(0);
    await request(app.getHttpServer()).get(`/api/ticket/${ticket.id}`).set("Authorization", seller).expect(403);
    await request(app.getHttpServer()).put(`/api/ticket/${ticket.id}/payment`).set("Authorization", seller).expect(403);
  });

  it("shows branch managers only the assignments belonging to their branch", async () => {
    const shared = await app.get(UserService).create({ email: `${randomUUID()}@audit.invalid`, fullName: "Shared employee", password, role: "SELLER", branchIds: [branchA, branchB], isActive: true });
    const result = await request(app.getHttpServer()).get(`/api/users?search=${shared.email}`).set("Authorization", manager).expect(200);
    expect(result.body.data[0].branches.map((branch: { id: string }) => branch.id)).toEqual([branchA]);
  });

  it("keeps card payment classification when payment is confirmed", async () => {
    const { ticket } = await fixture({ paymentMethod: "CARD" });
    await request(app.getHttpServer()).put(`/api/ticket/${ticket.id}/payment`).set("Authorization", admin).expect(200);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).paymentMethod).toBe("CARD");
  });

  it("refunds a paid unused ticket once, blocks sellers and rejects further entry", async () => {
    const { ticket } = await fixture();
    await request(app.getHttpServer()).put(`/api/ticket/${ticket.id}/payment`).set("Authorization", admin).expect(200);
    await request(app.getHttpServer()).post(`/api/ticket/${ticket.id}/refund`).set("Authorization", seller).expect(403);
    await request(app.getHttpServer()).post(`/api/ticket/${ticket.id}/refund`).set("Authorization", manager).expect(201);
    await request(app.getHttpServer()).post(`/api/ticket/${ticket.id}/refund`).set("Authorization", manager).expect(409);
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED" });
    await request(app.getHttpServer()).put(`/api/ticket/${ticket.id}/use`).set("Authorization", admin).expect(400);
    expect(await prisma.auditLog.count({ where: { entityId: ticket.id, action: "TICKET_REFUNDED" } })).toBe(1);
  });

  it("rejects a staff sale for an expired session", async () => {
    const { exam, session } = await fixture();
    await prisma.examSession.update({ where: { id: session.id }, data: { startsAt: new Date(0) } });
    await request(app.getHttpServer()).post("/api/ticket").set("Authorization", admin)
      .send({ examId: exam.id, sessionId: session.id, branchId: branchA }).expect(400);
  });

  it("filters sales reports by Baku date and branch and exports actual Excel data", async () => {
    const { ticket } = await fixture({ paymentMethod: "CARD" });
    const registeredAt = new Date("2026-08-01T20:30:00Z");
    await prisma.ticket.update({ where: { id: ticket.id }, data: { registeredAt } });
    const query = `?from=2026-08-02&to=2026-08-02&branchId=${branchA}`;
    const report = await request(app.getHttpServer()).get(`/api/ticket/report${query}`).set("Authorization", seller).expect(200);
    expect(report.body.rows).toEqual(expect.arrayContaining([expect.objectContaining({ branchId: branchA, sellerId, paymentMethod: "CARD", count: 1, amount: 3500 })]));
    const outside = await request(app.getHttpServer()).get(`/api/ticket/report?branchId=${branchB}`).set("Authorization", seller).expect(200);
    expect(outside.body.rows).toHaveLength(0);
    await request(app.getHttpServer()).get("/api/ticket/report?from=2026-02-30").set("Authorization", admin).expect(400);
    await request(app.getHttpServer()).get(`/api/ticket/report.xlsx${query}`).set("Authorization", seller).expect(200)
      .expect("Content-Type", /spreadsheetml/);
  });

  it("rolls back admission if its audit record cannot be written", async () => {
    const { ticket } = await fixture();
    const service = app.get(TicketService);
    const actor = { userId: sellerId, roles: ["SUPER_ADMIN"] };
    await service.confirmPayment(ticket.id, actor);
    const spy = vi.spyOn(app.get(AuditService), "log").mockRejectedValueOnce(new Error("Audit unavailable"));
    try { await expect(service.useTicket(ticket.id, actor)).rejects.toThrow("Audit unavailable"); }
    finally { spy.mockRestore(); }
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe("ACTIVE");
  });

  it("rejects a correct-answer index beyond unchanged or shortened variants", async () => {
    const { exam } = await fixture();
    const question = await request(app.getHttpServer()).post("/api/question").set("Authorization", admin)
      .send({ examId: exam.id, question: "2 + 2?", variants: "3|4|5", correct: 3 }).expect(201);
    await request(app.getHttpServer()).patch(`/api/question/${question.body.id}`).set("Authorization", admin).send({ correct: 5 }).expect(400);
    await request(app.getHttpServer()).patch(`/api/question/${question.body.id}`).set("Authorization", admin).send({ variants: "3|4" }).expect(400);
  });

  it("invalidates an issued token after an administrator resets the password", async () => {
    await request(app.getHttpServer()).get("/api/auth/me").set("Authorization", seller).expect(200);
    await request(app.getHttpServer()).post(`/api/users/${sellerId}/password-reset`).set("Authorization", admin)
      .send({ newPassword: "New-audit-password-456!" }).expect(201);
    await request(app.getHttpServer()).get("/api/auth/me").set("Authorization", seller).expect(401);
  });
});
