import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { AppModule } from "../src/app.module";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL tələb olunur");
}
const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
if (!databaseName.endsWith("_test")) {
  throw new Error(
    `Təhlükəsizlik: app e2e testləri yalnız *_test verilənlər bazasında işləyir (cari: ${databaseName})`,
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
}) as any;

let app: INestApplication;
let adminToken = "";
let sellerToken = "";
let managerToken = "";
let branchId = "";
let candidateId = "";
let secondCandidateId = "";
let examId = "";
let sessionId = "";
let registrationId = "";

const ADMIN_EMAIL = "admin-e2e@example.com";
const SELLER_EMAIL = "seller-e2e@example.com";
const MANAGER_EMAIL = "manager-e2e@example.com";
const PASSWORD = "testpassword123";

beforeAll(async () => {
  await prisma.$connect();

  await prisma.auditLog.deleteMany();
  await prisma.examinationRegistration.deleteMany();
  await prisma.examSession.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.userBranchRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.role.deleteMany();

  const [adminRole, sellerRole, managerRole] = await Promise.all([
    prisma.role.create({ data: { name: "SUPER_ADMIN" } }),
    prisma.role.create({ data: { name: "SELLER" } }),
    prisma.role.create({ data: { name: "BRANCH_MANAGER" } }),
  ]);

  const branch = await prisma.branch.create({
    data: { name: "E2E filialı", code: `E2E-${randomUUID().slice(0, 8)}` },
  });
  branchId = branch.id;

  const passwordHash = await argon2.hash(PASSWORD);

  const [admin, seller, manager] = await Promise.all([
    prisma.user.create({
      data: { email: ADMIN_EMAIL, fullName: "E2E Admin", passwordHash },
    }),
    prisma.user.create({
      data: { email: SELLER_EMAIL, fullName: "E2E Satıcı", passwordHash },
    }),
    prisma.user.create({
      data: { email: MANAGER_EMAIL, fullName: "E2E Menecer", passwordHash },
    }),
  ]);

  await prisma.userBranchRole.createMany({
    data: [
      { userId: admin.id, branchId, roleId: adminRole.id },
      { userId: seller.id, branchId, roleId: sellerRole.id },
      { userId: manager.id, branchId, roleId: managerRole.id },
    ],
  });

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  const login = async (email: string) => {
    const response = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password: PASSWORD })
      .expect(201);
    return response.body.access_token as string;
  };

  adminToken = await login(ADMIN_EMAIL);
  sellerToken = await login(SELLER_EMAIL);
  managerToken = await login(MANAGER_EMAIL);
});

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

describe("Application HTTP e2e (test database)", () => {
  it("serves the health endpoint", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/health")
      .expect(200);

    expect(response.body.status).toBe("ok");
    expect(response.body.database).toBe("connected");
  });

  it("rejects unauthenticated candidate access", async () => {
    await request(app.getHttpServer()).get("/api/candidates").expect(401);
    await request(app.getHttpServer())
      .post("/api/candidates")
      .send({ full_name: "Anonim" })
      .expect(401);
  });

  it("returns a paginated candidate list for administrators", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/candidates")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      data: [],
      total: 0,
      page: 1,
      totalPages: 1,
    });
  });

  it("creates a candidate through the API", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/candidates")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        full_name: "HTTP Namizəd",
        email: "http-candidate@example.com",
        phone: "+994501112233",
      })
      .expect(201);

    expect(response.body.candidate_number).toMatch(/^QD/);
    expect(response.body.email).toBe("http-candidate@example.com");
    candidateId = response.body.id;

    const audit = await prisma.auditLog.findFirst({
      where: { action: "CANDIDATE_CREATED", entityId: candidateId },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).not.toBeNull();
    expect(audit?.metadata).not.toHaveProperty("email");
  });

  it("rejects duplicate candidate emails", async () => {
    await request(app.getHttpServer())
      .post("/api/candidates")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        full_name: "Təkrar Namizəd",
        email: "http-candidate@example.com",
      })
      .expect(409);
  });

  it("searches persisted candidates", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/candidates?search=HTTP")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0].full_name).toBe("HTTP Namizəd");
  });

  it("forbids sellers from managing candidates", async () => {
    await request(app.getHttpServer())
      .post("/api/candidates")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ full_name: "Satıcı Namizəd" })
      .expect(403);
  });

  it("registers a candidate for an open session and rejects duplicates", async () => {
    const exam = await prisma.exam.create({
      data: {
        code: `E2E-EX-${randomUUID().slice(0, 6)}`,
        title: "E2E İmtahanı",
        status: "PUBLISHED",
        createdBy: randomUUID(),
      },
    });
    examId = exam.id;

    const session = await prisma.examSession.create({
      data: {
        examId: exam.id,
        sessionCode: `E2E-S-${randomUUID().slice(0, 6)}`,
        startsAt: new Date("2026-12-01T09:00:00Z"),
        endsAt: new Date("2026-12-01T11:00:00Z"),
        venue: "E2E Otaq",
        capacity: 1,
        status: "OPEN",
      },
    });
    sessionId = session.id;

    const created = await request(app.getHttpServer())
      .post("/api/registrations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        candidate_id: candidateId,
        exam_id: examId,
        session_id: sessionId,
        branch_id: branchId,
      })
      .expect(201);

    registrationId = created.body.id;
    expect(created.body.status).toBe("ACTIVE");

    await request(app.getHttpServer())
      .post("/api/registrations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        candidate_id: candidateId,
        exam_id: examId,
        session_id: sessionId,
        branch_id: branchId,
      })
      .expect(409);

    const list = await request(app.getHttpServer())
      .get(`/api/registrations?candidate_id=${candidateId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.total).toBe(1);
  });

  it("cancels a registration while keeping history", async () => {
    const cancelled = await request(app.getHttpServer())
      .patch(`/api/registrations/${registrationId}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(cancelled.body.status).toBe("CANCELLED");

    const details = await request(app.getHttpServer())
      .get(`/api/registrations/${registrationId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(details.body.status).toBe("CANCELLED");
  });

  it("rejects registration into a closed session", async () => {
    await prisma.examSession.update({
      where: { id: sessionId },
      data: { status: "CLOSED" },
    });

    const otherCandidate = await prisma.candidate.create({
      data: {
        candidate_number: `QD-E2E-${randomUUID().slice(0, 8)}`,
        full_name: "Bağlı Sessiya Namizədi",
      },
    });

    await request(app.getHttpServer())
      .post("/api/registrations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        candidate_id: otherCandidate.id,
        exam_id: examId,
        session_id: sessionId,
        branch_id: branchId,
      })
      .expect(400);
  });

  it("allows a branch manager to create and see an unregistered branch candidate", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/candidates")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ full_name: "Menecer tərəfindən", branch_id: branchId })
      .expect(201);

    expect(created.body.branch_id).toBe(branchId);

    const details = await request(app.getHttpServer())
      .get(`/api/candidates/${created.body.id}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .expect(200);
    expect(details.body.registrations).toEqual([]);
  });

  it("enforces examination-session lifecycle and central-admin authorization", async () => {
    const exam = await prisma.exam.create({
      data: {
        code: `E2E-LC-${randomUUID().slice(0, 6)}`,
        title: "Lifecycle imtahanı",
        status: "PUBLISHED",
        createdBy: randomUUID(),
      },
    });

    await request(app.getHttpServer())
      .post("/api/exam-sessions")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        examId: exam.id,
        sessionCode: `LC-${randomUUID().slice(0, 6)}`,
        startsAt: "2026-12-10T09:00:00Z",
        endsAt: "2026-12-10T11:00:00Z",
        capacity: 10,
      })
      .expect(403);

    const created = await request(app.getHttpServer())
      .post("/api/exam-sessions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        examId: exam.id,
        sessionCode: `LC-${randomUUID().slice(0, 6)}`,
        startsAt: "2026-12-10T09:00:00Z",
        endsAt: "2026-12-10T11:00:00Z",
        capacity: 10,
      })
      .expect(201);
    expect(created.body.status).toBe("PLANNED");

    await request(app.getHttpServer())
      .patch(`/api/exam-sessions/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "CLOSED" })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/exam-sessions/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "OPEN" })
      .expect(200);

    const openedAudit = await prisma.auditLog.findFirst({
      where: {
        action: "EXAM_SESSION_OPENED",
        entityId: created.body.id,
      },
    });
    expect(openedAudit).not.toBeNull();

    await request(app.getHttpServer())
      .patch(`/api/exam-sessions/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "CLOSED" })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/exam-sessions/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "OPEN" })
      .expect(400);

    const cancellable = await request(app.getHttpServer())
      .post("/api/exam-sessions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        examId: exam.id,
        sessionCode: `LC-CANCEL-${randomUUID().slice(0, 6)}`,
        startsAt: "2026-12-11T09:00:00Z",
        endsAt: "2026-12-11T11:00:00Z",
        capacity: 10,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/exam-sessions/${cancellable.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "CANCELLED" })
      .expect(200);
  });

  it("restricts branch managers to candidates registered in their branch", async () => {
    const branchB = await prisma.branch.create({
      data: {
        name: "E2E digər filial",
        code: `E2E-B-${randomUUID().slice(0, 6)}`,
      },
    });
    const hidden = await request(app.getHttpServer())
      .post("/api/candidates")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ full_name: "Digər filial namizədi", branch_id: branchB.id })
      .expect(201);
    secondCandidateId = hidden.body.id;

    const visible = await request(app.getHttpServer())
      .get("/api/candidates")
      .set("Authorization", `Bearer ${managerToken}`)
      .expect(200);

    expect(visible.body.total).toBe(2);
    expect(
      visible.body.data.map((candidate: { id: string }) => candidate.id),
    ).toContain(candidateId);
    expect(
      visible.body.data.map((candidate: { id: string }) => candidate.id),
    ).not.toContain(secondCandidateId);

    await request(app.getHttpServer())
      .get(`/api/candidates/${secondCandidateId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .expect(404);
  });
});

describe("Candidate ownership HTTP hardening", () => {
  it("rejects client-provided actors and roles", async () => {
    await request(app.getHttpServer())
      .post("/api/candidates")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        full_name: "Saxta aktor",
        actorId: randomUUID(),
        roles: ["SUPER_ADMIN"],
      })
      .expect(400);
  });

  it("keeps other-branch candidates out of search and rejects forged assignments", async () => {
    const other = await prisma.branch.create({
      data: { name: "HTTP gizli filial", code: randomUUID() },
    });
    const created = await request(app.getHttpServer())
      .post("/api/candidates")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ full_name: "HTTP gizli axtarış", branch_id: other.id })
      .expect(201);
    const list = await request(app.getHttpServer())
      .get("/api/candidates?search=HTTP%20gizli%20axtar%C4%B1%C5%9F")
      .set("Authorization", `Bearer ${managerToken}`)
      .expect(200);
    expect(list.body.data).toEqual([]);
    expect(list.body.total).toBe(0);
    await request(app.getHttpServer())
      .patch(`/api/candidates/${created.body.id}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ full_name: "İcazəsiz" })
      .expect(404);
    await request(app.getHttpServer())
      .post("/api/candidates")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ full_name: "Saxta filial", branch_id: other.id })
      .expect(403);
  });
});
