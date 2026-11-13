import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { UserService } from "../src/user/user.service";

const url = process.env.DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test") || url !== process.env.TEST_DATABASE_URL)
  throw new Error("Isolated *_test database required");
const roles = ["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER", "SELLER", "OMR_OPERATOR"] as const;
const password = "User-role-test-password-123!";
let app: INestApplication, prisma: PrismaService;
let a: string, b: string, inactive: string, extra: string, exam: string;
const staff = {} as Record<typeof roles[number], { id: string; email: string; token: string }>;
const http = () => app.getHttpServer();
const admin = () => staff.SUPER_ADMIN.token;
async function login(email: string, secret = password) {
  const response = await request(http()).post("/api/auth/login").send({ email, password: secret }).expect(201);
  return `Bearer ${response.body.access_token}`;
}
async function employee(branchIds = [a], role: typeof roles[number] = "SELLER") {
  return app.get(UserService).create({ email: `${randomUUID()}@roles.invalid`, fullName: "Role test employee", password, branchIds, role, isActive: true });
}
const pairs = (user: { userBranchRoles: Array<{ branchId: string; role: { name: string } }> }) =>
  user.userBranchRoles.map(entry => `${entry.branchId}:${entry.role.name}`).sort();
const patch = (id: string, suffix: string, body: object, token = admin()) =>
  request(http()).patch(`/api/users/${id}${suffix}`).set("Authorization", token).send(body);
const me = (token: string) => request(http()).get("/api/auth/me").set("Authorization", token);

beforeAll(async () => {
  app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init(); prisma = app.get(PrismaService);
  const branch = (name: string, isActive = true) => prisma.branch.create({ data: { code: randomUUID(), name, isActive } });
  a = (await branch("Roles A")).id; b = (await branch("Roles B")).id;
  inactive = (await branch("Inactive", false)).id; extra = (await branch("New branch")).id;
  for (const role of roles) {
    await prisma.role.upsert({ where: { name: role }, create: { name: role }, update: {} });
    const user = await employee([a], role);
    staff[role] = { id: user.id, email: user.email, token: await login(user.email) };
  }
  exam = (await prisma.exam.create({ data: { code: randomUUID(), title: "Role permissions", createdBy: staff.SUPER_ADMIN.id } })).id;
});
afterAll(async () => { await app?.close(); });

describe("users and roles over real HTTP and PostgreSQL", () => {
  for (const role of roles) it(`${role}: module and mutation permissions`, async () => {
    const central = role === "SUPER_ADMIN" || role === "CENTRAL_ADMIN";
    for (const [path, allowed] of [["/users", central || role === "BRANCH_MANAGER"], ["/question", central],
      ["/results/exams", central || role === "OMR_OPERATOR"], [`/omr/keys?examId=${exam}`, role !== "SELLER"],
      ["/ticket/report", role !== "OMR_OPERATOR"], ["/day-closures", role !== "OMR_OPERATOR"]] as const)
      await request(http()).get(`/api${path}`).set("Authorization", staff[role].token).expect(allowed ? 200 : 403);
    const target = await employee();
    await patch(target.id, "", { fullName: "Updated by role" }, staff[role].token).expect(central ? 200 : 403);
    await patch(target.id, "/roles", { roleIds: ["OMR_OPERATOR"], branchId: a }, staff[role].token).expect(central ? 200 : 403);
  });

  it("normalizes email, blocks duplicate email and validates/deduplicates branches atomically", async () => {
    const email = `${randomUUID()}@roles.invalid`;
    const create = (body: object) => request(http()).post("/api/users").set("Authorization", admin())
      .send({ email, fullName: "  New employee  ", password, role: "SELLER", branchIds: [a, a], ...body });
    const result = await create({ email: ` ${email.toUpperCase()} ` }).expect(201);
    expect(result.body).toMatchObject({ email, fullName: "New employee" });
    expect(result.body.passwordHash).toBeUndefined(); expect(pairs(result.body)).toEqual([`${a}:SELLER`]);
    await login(email.toUpperCase()); await create({}).expect(409);
    for (const branchId of [inactive, randomUUID()]) {
      const other = `${randomUUID()}@roles.invalid`;
      await create({ email: other, branchIds: [branchId] }).expect(400);
      expect(await prisma.user.count({ where: { email: other } })).toBe(0);
    }
  });

  it("preserves independent roles, rejects ambiguous additions, and revokes changed permissions", async () => {
    const user = await employee(); const old = await login(user.email);
    const changed = await patch(user.id, "/roles", { branchId: b, roleIds: ["BRANCH_MANAGER", "OMR_OPERATOR"] }).expect(200);
    expect(pairs(changed.body)).toEqual([`${a}:SELLER`, `${b}:BRANCH_MANAGER`, `${b}:OMR_OPERATOR`].sort());
    await me(old).expect(401); const token = await login(user.email);
    const identity = await me(token).expect(200); expect(identity.body.branches).toHaveLength(2);
    expect(identity.body.userBranchRoles).toContainEqual({ branchId: a, role: "SELLER" });
    const list = await request(http()).get(`/api/users?branchId=${a}`).set("Authorization", token).expect(200);
    expect(list.body.data).toEqual([]);
    await patch(user.id, "", { fullName: "Profile only" }).expect(200);
    expect(pairs(await app.get(UserService).findOne(user.id))).toEqual(pairs(changed.body));
    await me(token).expect(200);
    await patch(user.id, "/branches", { branchIds: [a, b, extra] }).expect(400);
    const removed = await patch(user.id, "/branches", { branchIds: [b] }).expect(200);
    expect(pairs(removed.body)).toEqual([`${b}:BRANCH_MANAGER`, `${b}:OMR_OPERATOR`].sort());
    await me(token).expect(401);
  });

  it("does not copy roles between branches when updating the profile's branch list", async () => {
    const user = await employee([a, b]);
    await patch(user.id, "/roles", { branchId: b, roleIds: ["OMR_OPERATOR"] }).expect(200);
    const changed = await patch(user.id, "", { branchIds: [a] }).expect(200);
    expect(pairs(changed.body)).toEqual([`${a}:SELLER`]);
  });

  it("filters users and returned assignments within the manager's branch, rejects invalid pagination", async () => {
    const user = await employee();
    await patch(user.id, "/roles", { branchId: b, roleIds: ["OMR_OPERATOR"] }).expect(200);
    const list = (query: string) => request(http()).get(`/api/users?search=${user.email}&${query}`).set("Authorization", staff.BRANCH_MANAGER.token);
    expect((await list("role=OMR_OPERATOR").expect(200)).body.data).toEqual([]);
    const shown = await list(`role=SELLER&branch=${a}`).expect(200);
    expect(shown.body.data[0].assignments).toEqual([{ branchId: a, role: "SELLER" }]);
    expect(shown.body.data[0].branches).toHaveLength(1);
    for (const query of ["page=1.5", "page=Infinity", "branchId=bad", "limit=-1", "status=unknown"])
      await request(http()).get(`/api/users?${query}`).set("Authorization", admin()).expect(400);
  });

  it("rejects empty, unknown and inactive-branch assignments without erasing existing roles", async () => {
    const user = await employee();
    for (const body of [{ roleIds: [] }, { roleIds: ["NO_SUCH_ROLE"] }, { roleIds: ["SELLER"], branchId: inactive }]) {
      expect([400, 403]).toContain((await patch(user.id, "/roles", body)).status);
      expect(pairs(await app.get(UserService).findOne(user.id))).toEqual([`${a}:SELLER`]);
    }
  });

  it("supports explicit bulk updates and UUID role IDs, records the audit", async () => {
    const user = await employee([a, b]);
    const role = await prisma.role.findUniqueOrThrow({ where: { name: "OMR_OPERATOR" } });
    const changed = await patch(user.id, "/roles", { roleIds: [role.id] }).expect(200);
    expect(pairs(changed.body)).toEqual([`${a}:OMR_OPERATOR`, `${b}:OMR_OPERATOR`].sort());
    expect(await prisma.auditLog.count({ where: { entityId: user.id, action: "user_roles_assigned" } })).toBe(1);
  });

  it("blocks disabled accounts and invalidates sessions after status/password changes", async () => {
    const user = await employee(); const token = await login(user.email);
    for (const isActive of [false, true]) await patch(user.id, "/status", { isActive }).expect(200);
    await me(token).expect(401); const current = await login(user.email);
    await request(http()).post(`/api/users/${user.id}/password-reset`).set("Authorization", admin())
      .send({ newPassword: `${password}-new` }).expect(201);
    await me(current).expect(401);
    await request(http()).post("/api/auth/login").send({ email: user.email, password }).expect(401);
    await login(user.email, `${password}-new`);
    await patch(user.id, "/status", { isActive: false }).expect(200);
    await request(http()).post("/api/auth/login").send({ email: user.email, password: `${password}-new` }).expect(401);
  });

  it("removes inactive branch access and repairs a legacy roleless account through an explicit assignment", async () => {
    const branch = await prisma.branch.create({ data: { code: randomUUID(), name: "Deactivate test" } });
    const user = await employee([branch.id]); const token = await login(user.email);
    await prisma.branch.update({ where: { id: branch.id }, data: { isActive: false } });
    await me(token).expect(401);
    await request(http()).post("/api/auth/login").send({ email: user.email, password }).expect(401);
    await prisma.userBranchRole.deleteMany({ where: { userId: user.id } });
    await request(http()).post("/api/auth/login").send({ email: user.email, password }).expect(401);
    await patch(user.id, "/roles", { branchId: a, roleIds: ["SELLER"] }).expect(200); await login(user.email);
  });

  it("preserves the last active super administrator through every mutation path", async () => {
    const others = await prisma.user.findMany({ where: { id: { not: staff.SUPER_ADMIN.id }, isActive: true,
      userBranchRoles: { some: { role: { name: "SUPER_ADMIN" } } } }, select: { id: true } });
    await prisma.user.updateMany({ where: { id: { in: others.map(user => user.id) } }, data: { isActive: false } });
    try {
      const id = staff.SUPER_ADMIN.id;
      for (const [suffix, body] of [["/status", { isActive: false }], ["", { isActive: false }],
        ["/roles", { roleIds: ["SELLER"] }], ["", { role: "SELLER" }]] as const)
        await patch(id, suffix, body).expect(403);
      await patch(id, "/roles", { branchId: b, roleIds: ["SELLER"] }).expect(200);
      staff.SUPER_ADMIN.token = await login(staff.SUPER_ADMIN.email);
      await patch(id, "/branches", { branchIds: [b] }).expect(403);
      await patch(id, "", { branchIds: [b] }).expect(403);
      await me(admin()).expect(200);
    } finally {
      await prisma.user.updateMany({ where: { id: { in: others.map(user => user.id) } }, data: { isActive: true } });
    }
  });
});
