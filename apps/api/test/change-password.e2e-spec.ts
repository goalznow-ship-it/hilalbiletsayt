import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { UserService } from "../src/user/user.service";
import { AuditService } from "../src/audit/audit.service";

const url = process.env.DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test") || url !== process.env.TEST_DATABASE_URL)
  throw new Error("Isolated *_test database required");
const currentPassword = "Settings-current-password-123!";
const newPassword = "Settings-new-password-456!";
let app: INestApplication, prisma: PrismaService, branchId: string;
const http = () => app.getHttpServer();
async function login(email: string, password = currentPassword) {
  const response = await request(http()).post("/api/auth/login").send({ email, password }).expect(201);
  return `Bearer ${response.body.access_token}`;
}
async function employee(role: "SUPER_ADMIN" | "CENTRAL_ADMIN" | "BRANCH_MANAGER" | "SELLER" | "OMR_OPERATOR" = "SELLER") {
  await prisma.role.upsert({ where: { name: role }, create: { name: role }, update: {} });
  const user = await app.get(UserService).create({ email: `${randomUUID()}@settings.invalid`, fullName: "Settings test",
    password: currentPassword, role, branchIds: [branchId], isActive: true });
  return { ...user, token: await login(user.email) };
}
const change = (token: string, body: object = { currentPassword, newPassword }) =>
  request(http()).post("/api/auth/password").set("Authorization", token).send(body);
beforeEach(async () => {
  app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init(); prisma = app.get(PrismaService);
  branchId = (await prisma.branch.create({ data: { code: randomUUID(), name: "Settings test branch" } })).id;
});
afterEach(async () => { vi.restoreAllMocks(); await app?.close(); });

describe("Self-service password changes", () => {
  it("all five roles can change their own password, with audit and session revocation", async () => {
    for (const role of ["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER", "SELLER", "OMR_OPERATOR"] as const) {
      const user = await employee(role);
      const old = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const response = await change(user.token).expect(201);
      expect(response.body).toEqual({ changed: true });
      const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(saved.passwordHash).not.toBe(newPassword);
      expect(await argon2.verify(saved.passwordHash, newPassword)).toBe(true);
      expect(saved.tokenVersion).toBe(old.tokenVersion + 1);
      await request(http()).get("/api/auth/me").set("Authorization", user.token).expect(401);
      await request(http()).post("/api/auth/login").send({ email: user.email, password: currentPassword }).expect(401);
      const next = await login(user.email, newPassword);
      await request(http()).get("/api/auth/me").set("Authorization", next).expect(200);
      const audit = await prisma.auditLog.findMany({ where: { entityId: user.id, action: "PASSWORD_CHANGED" } });
      expect(audit).toHaveLength(1);
      expect(audit[0].actorId).toBe(user.id);
      expect(audit[0].metadata).toEqual({ sessionsRevoked: true });
    }
  });
  it("rejects wrong current password, weak/oversized/reused values and another user's ID", async () => {
    const user = await employee();
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    for (const body of [
      { currentPassword: "wrong", newPassword }, { currentPassword, newPassword: "123" },
      { currentPassword, newPassword: "x".repeat(129) }, { currentPassword, newPassword: currentPassword },
      { currentPassword, newPassword, userId: randomUUID() }, { currentPassword: {}, newPassword },
    ]) await change(user.token, body).expect(400);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ passwordHash: before.passwordHash, tokenVersion: before.tokenVersion });
    await request(http()).get("/api/auth/me").set("Authorization", user.token).expect(200);
    await request(http()).post("/api/auth/password").send({ currentPassword, newPassword }).expect(401);
  });
  it("allows only one concurrent change using the same old credential", async () => {
    const user = await employee();
    const responses = await Promise.all([change(user.token), change(user.token, { currentPassword, newPassword: `${newPassword}-other` })]);
    expect(responses.filter(r => r.status === 201)).toHaveLength(1);
    expect(responses.filter(r => [401, 409].includes(r.status))).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { entityId: user.id, action: "PASSWORD_CHANGED" } })).toBe(1);
  });
  it("rolls back credentials and sessions if the audit cannot be saved", async () => {
    const user = await employee();
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    vi.spyOn(AuditService.prototype, "log").mockRejectedValueOnce(new Error("Test audit failure"));
    await change(user.token).expect(500);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ passwordHash: before.passwordHash, tokenVersion: before.tokenVersion });
    await request(http()).get("/api/auth/me").set("Authorization", user.token).expect(200);
  });
  it("rate limits guesses of the current password", async () => {
    const user = await employee();
    for (let i = 0; i < 10; i++) await change(user.token, { currentPassword: "wrong", newPassword }).expect(400);
    await change(user.token, { currentPassword: "wrong", newPassword }).expect(429);
  });
});
