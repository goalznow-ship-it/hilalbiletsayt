import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Branch } from "@prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { CandidateService } from "../src/candidate/candidate.service";
import { RegistrationService } from "../src/registration/registration.service";
import { ExaminationSessionService } from "../src/examination/examination.session.service";
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
const candidateService = new CandidateService(prisma, audit);
const registrationService = new RegistrationService(prisma, audit);
const sessionService = new ExaminationSessionService(prisma, audit);

const admin: AuthenticatedUser = {
  userId: randomUUID(),
  roles: ["SUPER_ADMIN"],
  branches: [],
};

let branchA: Branch;

async function seedExamSession(options: {
  capacity?: number;
  status?: string;
  branchId?: string | null;
}) {
  const exam = await prisma.exam.create({
    data: {
      code: `EX-${randomUUID().slice(0, 8)}`,
      title: "İnteqrasiya imtahanı",
      status: "PUBLISHED",
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
      capacity: options.capacity ?? 10,
      status: options.status ?? "OPEN",
    },
  });

  const candidate = await prisma.candidate.create({
    data: {
      candidate_number: `QD${randomUUID().slice(0, 10).toUpperCase()}`,
      full_name: "Test Namizəd",
    },
  });

  return { exam, session, candidate };
}

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.ticket.deleteMany();
  await prisma.examinationRegistration.deleteMany();
  await prisma.examSession.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.candidate.deleteMany();

  branchA = await prisma.branch.upsert({
    where: { code: "TEST-BRANCH-A" },
    update: { name: "Test filialı", isActive: true },
    create: { name: "Test filialı", code: "TEST-BRANCH-A" },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Candidate integration (real PostgreSQL test database)", () => {
  it("persists a candidate and generates a unique number", async () => {
    const first = await candidateService.create(
      { full_name: "Ali Məmmədov", email: "ali@example.com" },
      admin,
    );
    const second = await candidateService.create(
      { full_name: "Vəli Həsənov" },
      admin,
    );

    expect(first.candidate_number).toMatch(/^QD/);
    expect(first.candidate_number).not.toBe(second.candidate_number);

    const stored = await prisma.candidate.findMany();
    expect(stored).toHaveLength(2);
  });

  it("enforces candidate_number uniqueness at the database level", async () => {
    await prisma.candidate.create({
      data: { candidate_number: "QD-DUPLICATE", full_name: "Birinci" },
    });

    await expect(
      prisma.candidate.create({
        data: { candidate_number: "QD-DUPLICATE", full_name: "İkinci" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects duplicate email addresses through the service", async () => {
    await candidateService.create(
      { full_name: "Ali", email: "same@example.com" },
      admin,
    );

    await expect(
      candidateService.create(
        { full_name: "Vəli", email: "same@example.com" },
        admin,
      ),
    ).rejects.toThrow("artıq mövcuddur");
  });

  it("enforces case-insensitive email uniqueness during concurrent creation", async () => {
    const results = await Promise.allSettled([
      candidateService.create(
        { full_name: "Birinci", email: "race@example.com" },
        admin,
      ),
      candidateService.create(
        { full_name: "İkinci", email: "RACE@EXAMPLE.COM" },
        admin,
      ),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const stored = await prisma.candidate.findMany({
      where: { email: { equals: "race@example.com", mode: "insensitive" } },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].email).toBe("race@example.com");
  });

  it("shows an unregistered candidate owned by a branch manager's branch", async () => {
    const manager: AuthenticatedUser = {
      userId: randomUUID(),
      roles: ["BRANCH_MANAGER"],
      branches: [{ id: branchA.id }],
    };
    const created = await candidateService.create(
      {
        full_name: "Filial namizədi",
        email: "branch-candidate@example.com",
        branch_id: branchA.id,
      },
      admin,
    );

    const list = await candidateService.findAll({}, manager);
    expect(list.total).toBe(1);
    expect(list.data[0].id).toBe(created.id);

    const details = await candidateService.findOne(created.id, manager);
    expect(details.registrations).toEqual([]);
  });

  it("does not leak candidates from another branch", async () => {
    const branchB = await prisma.branch.create({
      data: { name: "Gizli filial", code: `BR-${randomUUID().slice(0, 8)}` },
    });
    const manager: AuthenticatedUser = {
      userId: randomUUID(),
      roles: ["BRANCH_MANAGER"],
      branches: [{ id: branchA.id }],
    };
    const hidden = await candidateService.create(
      { full_name: "Digər filial", branch_id: branchB.id },
      admin,
    );

    await expect(candidateService.findOne(hidden.id, manager)).rejects.toThrow(
      "Namizəd tapılmadı",
    );
  });

  it("assigns a branch manager's branch on candidate creation", async () => {
    const manager: AuthenticatedUser = {
      userId: randomUUID(),
      roles: ["BRANCH_MANAGER"],
      branches: [{ id: branchA.id }],
    };

    const created = await candidateService.create(
      { full_name: "Menecer namizədi" },
      manager,
    );

    expect(created.branch_id).toBe(branchA.id);
  });

  it("paginates and searches persisted candidates", async () => {
    for (let index = 0; index < 3; index += 1) {
      await candidateService.create(
        { full_name: `Namizəd ${index}`, phone: `+99450000000${index}` },
        admin,
      );
    }

    const page = await candidateService.findAll({ page: 1, limit: 2 }, admin);
    expect(page.data).toHaveLength(2);
    expect(page.total).toBe(3);
    expect(page.totalPages).toBe(2);

    const searched = await candidateService.findAll(
      { search: "Namizəd 1" },
      admin,
    );
    expect(searched.total).toBe(1);
  });
});

describe("Session lifecycle integration (real PostgreSQL test database)", () => {
  it("creates a planned session and enforces valid transitions", async () => {
    const exam = await prisma.exam.create({
      data: {
        code: `EX-${randomUUID().slice(0, 8)}`,
        title: "Sessiya imtahanı",
        status: "PUBLISHED",
        createdBy: randomUUID(),
      },
    });

    const created = await sessionService.create({
      examId: exam.id,
      sessionCode: `S-${randomUUID().slice(0, 8)}`,
      startsAt: "2026-12-01T09:00:00Z",
      endsAt: "2026-12-01T11:00:00Z",
      venue: "Otaq A",
      capacity: 20,
    });
    expect(created.status).toBe("PLANNED");

    await expect(
      sessionService.update(created.id, { status: "CLOSED" }),
    ).rejects.toThrow("keçirilə bilməz");

    const opened = await sessionService.update(created.id, { status: "OPEN" });
    expect(opened.status).toBe("OPEN");

    const closed = await sessionService.update(created.id, {
      status: "CLOSED",
    });
    expect(closed.status).toBe("CLOSED");

    await expect(
      sessionService.update(created.id, { status: "OPEN" }),
    ).rejects.toThrow("keçirilə bilməz");
  });

  it("refuses to cancel a session with active registrations", async () => {
    const { exam, session, candidate } = await seedExamSession({
      status: "OPEN",
    });
    await registrationService.create(
      {
        candidate_id: candidate.id,
        exam_id: exam.id,
        session_id: session.id,
        branch_id: branchA.id,
      },
      admin,
    );

    await expect(
      sessionService.update(session.id, { status: "CANCELLED" }),
    ).rejects.toThrow("Aktiv qeydiyyatı olan sessiya ləğv edilə bilməz");
  });

  it("rejects reducing capacity below active registrations", async () => {
    const { exam, session, candidate } = await seedExamSession({
      capacity: 10,
      status: "OPEN",
    });
    const secondCandidate = await prisma.candidate.create({
      data: {
        candidate_number: `QD-CAP-${randomUUID().slice(0, 8)}`,
        full_name: "İkinci namizəd",
      },
    });

    await Promise.all(
      [candidate.id, secondCandidate.id].map((candidateId) =>
        registrationService.create(
          {
            candidate_id: candidateId,
            exam_id: exam.id,
            session_id: session.id,
            branch_id: branchA.id,
          },
          admin,
        ),
      ),
    );

    await expect(
      sessionService.update(session.id, { capacity: 1 }),
    ).rejects.toThrow("Kapasitet aktiv qeydiyyat sayından az ola bilməz");
  });
});

describe("Registration integration (real PostgreSQL test database)", () => {
  it("creates and persists a registration", async () => {
    const { exam, session, candidate } = await seedExamSession({});

    const created = await registrationService.create(
      {
        candidate_id: candidate.id,
        exam_id: exam.id,
        session_id: session.id,
        branch_id: branchA.id,
      },
      admin,
    );

    expect(created.status).toBe("ACTIVE");
    const stored = await prisma.examinationRegistration.findUnique({
      where: { id: created.id },
    });
    expect(stored?.status).toBe("ACTIVE");
  });

  it("rejects a session that belongs to another exam", async () => {
    const { session, candidate } = await seedExamSession({});
    const otherExam = await prisma.exam.create({
      data: {
        code: `EX-${randomUUID().slice(0, 8)}`,
        title: "Digər",
        createdBy: randomUUID(),
      },
    });

    await expect(
      registrationService.create(
        {
          candidate_id: candidate.id,
          exam_id: otherExam.id,
          session_id: session.id,
        },
        admin,
      ),
    ).rejects.toThrow("aid deyil");
  });

  it("rejects closed sessions", async () => {
    const { exam, session, candidate } = await seedExamSession({
      status: "CLOSED",
    });

    await expect(
      registrationService.create(
        {
          candidate_id: candidate.id,
          exam_id: exam.id,
          session_id: session.id,
        },
        admin,
      ),
    ).rejects.toThrow("açıq deyil");
  });

  it("prevents duplicate registrations via the service and the unique constraint", async () => {
    const { exam, session, candidate } = await seedExamSession({});

    const input = {
      candidate_id: candidate.id,
      exam_id: exam.id,
      session_id: session.id,
    };

    await registrationService.create(input, admin);

    await expect(registrationService.create(input, admin)).rejects.toThrow(
      "qeydiyyatdan keçib",
    );

    await expect(
      prisma.examinationRegistration.create({
        data: {
          candidate_id: candidate.id,
          exam_id: exam.id,
          session_id: session.id,
          status: "ACTIVE",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("enforces capacity and allows exactly one of two concurrent registrations", async () => {
    const { exam, session } = await seedExamSession({ capacity: 1 });

    const candidates = await Promise.all(
      [1, 2].map((index) =>
        prisma.candidate.create({
          data: {
            candidate_number: `QD-CONC-${index}-${randomUUID().slice(0, 6)}`,
            full_name: `Konkurent ${index}`,
          },
        }),
      ),
    );

    const results = await Promise.allSettled(
      candidates.map((candidate) =>
        registrationService.create(
          {
            candidate_id: candidate.id,
            exam_id: exam.id,
            session_id: session.id,
          },
          admin,
        ),
      ),
    );

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    const activeCount = await prisma.examinationRegistration.count({
      where: { session_id: session.id, status: "ACTIVE" },
    });
    expect(activeCount).toBe(1);
  });

  it("cancels without deleting history and frees capacity", async () => {
    const { exam, session, candidate } = await seedExamSession({ capacity: 1 });

    const created = await registrationService.create(
      {
        candidate_id: candidate.id,
        exam_id: exam.id,
        session_id: session.id,
      },
      admin,
    );

    const cancelled = await registrationService.cancel(created.id, admin);
    expect(cancelled.status).toBe("CANCELLED");

    const stored = await prisma.examinationRegistration.findUnique({
      where: { id: created.id },
    });
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe("CANCELLED");

    const secondCandidate = await prisma.candidate.create({
      data: {
        candidate_number: `QD-SECOND-${randomUUID().slice(0, 6)}`,
        full_name: "İkinci namizəd",
      },
    });

    const second = await registrationService.create(
      {
        candidate_id: secondCandidate.id,
        exam_id: exam.id,
        session_id: session.id,
      },
      admin,
    );
    expect(second.status).toBe("ACTIVE");
  });

  it("preserves registration history by restricting deletion of referenced rows", async () => {
    const { exam, session, candidate } = await seedExamSession({});

    const created = await registrationService.create(
      {
        candidate_id: candidate.id,
        exam_id: exam.id,
        session_id: session.id,
      },
      admin,
    );

    await expect(
      prisma.candidate.delete({ where: { id: candidate.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      prisma.examSession.delete({ where: { id: session.id } }),
    ).rejects.toMatchObject({ code: "P2003" });

    const stored = await prisma.examinationRegistration.findUnique({
      where: { id: created.id },
    });
    expect(stored).not.toBeNull();
  });

  it("rejects invalid status transitions", async () => {
    const { exam, session, candidate } = await seedExamSession({});

    const created = await registrationService.create(
      {
        candidate_id: candidate.id,
        exam_id: exam.id,
        session_id: session.id,
      },
      admin,
    );
    await registrationService.cancel(created.id, admin);

    await expect(
      registrationService.updateStatus(created.id, "ACTIVE", admin),
    ).rejects.toThrow("keçirilə bilməz");
  });

  it("hides other branches' registrations from branch managers", async () => {
    const branchB = await prisma.branch.create({
      data: { name: "Digər filial", code: `BR-${randomUUID().slice(0, 8)}` },
    });
    const { exam, session, candidate } = await seedExamSession({});

    const created = await registrationService.create(
      {
        candidate_id: candidate.id,
        exam_id: exam.id,
        session_id: session.id,
        branch_id: branchB.id,
      },
      admin,
    );

    const managerA: AuthenticatedUser = {
      userId: randomUUID(),
      roles: ["BRANCH_MANAGER"],
      branches: [{ id: branchA.id }],
    };

    await expect(
      registrationService.findOne(created.id, managerA),
    ).rejects.toThrow("Qeydiyyat tapılmadı");

    const list = await registrationService.findAll({}, managerA);
    expect(list.total).toBe(0);
  });
});

describe("Milestone 4 hardening (real PostgreSQL, real audit)", () => {
  const manager = (): AuthenticatedUser => ({
    userId: randomUUID(),
    roles: ["BRANCH_MANAGER"],
    branches: [{ id: branchA.id }],
  });
  const failingActor: AuthenticatedUser = {
    userId: "not-a-uuid",
    roles: ["SUPER_ADMIN"],
    branches: [],
  };

  it("permits multiple null emails and rejects duplicate email updates", async () => {
    const first = await candidateService.create(
      { full_name: "Birinci", email: "unique@example.com" },
      admin,
    );
    const second = await candidateService.create(
      { full_name: "İkinci" },
      admin,
    );
    await candidateService.create({ full_name: "Üçüncü", email: null }, admin);
    await expect(
      candidateService.update(
        second.id,
        { email: "UNIQUE@EXAMPLE.COM" },
        admin,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await prisma.candidate.findUniqueOrThrow({ where: { id: second.id } }))
        .email,
    ).toBeNull();
    expect(first.email).toBe("unique@example.com");
  });

  it("allows exactly one concurrent update to the same email", async () => {
    const candidates = await Promise.all(
      ["Birinci", "İkinci"].map((full_name) =>
        candidateService.create({ full_name }, admin),
      ),
    );
    const results = await Promise.allSettled(
      candidates.map((c) =>
        candidateService.update(
          c.id,
          { email: "update-race@example.com" },
          admin,
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(
      await prisma.candidate.count({
        where: { email: "update-race@example.com" },
      }),
    ).toBe(1);
  });

  it("keeps ownership restrictions when searching across names and emails", async () => {
    const other = await prisma.branch.create({
      data: { name: "Digər", code: randomUUID() },
    });
    await candidateService.create(
      {
        full_name: "Gizli uyğunluq",
        email: "hidden@example.com",
        branch_id: other.id,
      },
      admin,
    );
    const own = await candidateService.create(
      { full_name: "Gizli uyğunluq", branch_id: branchA.id },
      admin,
    );
    expect(
      (await candidateService.findAll({ search: "Gizli" }, manager())).data.map(
        (c) => c.id,
      ),
    ).toEqual([own.id]);
    expect(
      (
        await candidateService.findAll(
          { search: "hidden@example.com" },
          manager(),
        )
      ).total,
    ).toBe(0);
  });

  it("preserves omitted assignments and permits explicit central unassignment", async () => {
    const actor = manager();
    const candidate = await candidateService.create(
      { full_name: "İlkin namizəd" },
      actor,
    );
    await candidateService.update(
      candidate.id,
      { phone: "+994501112233" },
      actor,
    );
    expect(
      (
        await prisma.candidate.findUniqueOrThrow({
          where: { id: candidate.id },
        })
      ).branch_id,
    ).toBe(branchA.id);
    await candidateService.update(candidate.id, { branch_id: null }, admin);
    expect(
      (
        await prisma.candidate.findUniqueOrThrow({
          where: { id: candidate.id },
        })
      ).branch_id,
    ).toBeNull();
    await expect(
      candidateService.findOne(candidate.id, actor),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects branch assignment and mutation outside managerial scope", async () => {
    const other = await prisma.branch.create({
      data: { name: "Digər", code: randomUUID() },
    });
    const actor = manager();
    const own = await candidateService.create(
      { full_name: "Öz namizədi" },
      actor,
    );
    const hidden = await candidateService.create(
      { full_name: "Başqa namizəd", branch_id: other.id },
      admin,
    );
    await expect(
      candidateService.create(
        { full_name: "Manipulyasiya", branch_id: other.id },
        actor,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      candidateService.update(own.id, { branch_id: other.id }, actor),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      candidateService.update(own.id, { branch_id: null }, actor),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      candidateService.update(
        hidden.id,
        { full_name: "İcazəsiz dəyişmə" },
        actor,
      ),
    ).rejects.toMatchObject({ status: 404 });
    const mixed = {
      ...actor,
      branches: [{ id: branchA.id }, { id: other.id }],
      userBranchRoles: [
        { branchId: branchA.id, role: "BRANCH_MANAGER" },
        { branchId: other.id, role: "SELLER" },
      ],
    };
    await expect(
      candidateService.findOne(hidden.id, mixed),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("cannot acquire another branch's candidate through a new registration", async () => {
    const other = await prisma.branch.create({
      data: { name: "Digər", code: randomUUID() },
    });
    const { exam, session } = await seedExamSession({});
    const hidden = await candidateService.create(
      { full_name: "Başqa namizəd", branch_id: other.id },
      admin,
    );
    await expect(
      registrationService.create(
        {
          candidate_id: hidden.id,
          exam_id: exam.id,
          session_id: session.id,
          branch_id: branchA.id,
        },
        manager(),
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      await prisma.examinationRegistration.count({
        where: { candidate_id: hidden.id },
      }),
    ).toBe(0);
  });

  it("persists attributed and recursively redacted audit metadata", async () => {
    const candidate = await candidateService.create(
      { full_name: "Audit namizədi" },
      admin,
    );
    await audit.log(
      "REDACTION_CHECK",
      admin.userId,
      "Candidate",
      candidate.id,
      {
        password: "private",
        nested: {
          access_token: "private-token",
          email: "private@example.com",
          private_key: "private-key",
          branch_id: branchA.id,
        },
      },
    );
    const record = await prisma.auditLog.findFirstOrThrow({
      where: { action: "REDACTION_CHECK", entityId: candidate.id },
    });
    expect(record.actorId).toBe(admin.userId);
    expect(record.timestamp).toBeInstanceOf(Date);
    expect(record.metadata).toEqual({
      password: "[REDACTED]",
      nested: {
        access_token: "[REDACTED]",
        email: "[REDACTED]",
        private_key: "[REDACTED]",
        branch_id: branchA.id,
      },
    });
    const created = await prisma.auditLog.findFirstOrThrow({
      where: { action: "CANDIDATE_CREATED", entityId: candidate.id },
    });
    expect(created.actorId).toBe(admin.userId);
  });

  it("rolls back candidate creation, editing and activation on a real audit insert failure", async () => {
    await expect(
      candidateService.create(
        { full_name: "Geri qaytarılmalı", email: "rollback@example.com" },
        failingActor,
      ),
    ).rejects.toThrow();
    expect(
      await prisma.candidate.count({
        where: { email: "rollback@example.com" },
      }),
    ).toBe(0);
    const candidate = await candidateService.create(
      { full_name: "İlkin ad" },
      admin,
    );
    await expect(
      candidateService.update(
        candidate.id,
        { full_name: "Saxlanmamalı" },
        failingActor,
      ),
    ).rejects.toThrow();
    await expect(
      candidateService.toggleActive(candidate.id, failingActor),
    ).rejects.toThrow();
    expect(
      await prisma.candidate.findUniqueOrThrow({ where: { id: candidate.id } }),
    ).toMatchObject({ full_name: "İlkin ad", is_active: true });
  });

  it("rolls back registration creation and cancellation on audit failure", async () => {
    const { exam, session, candidate } = await seedExamSession({});
    const input = {
      candidate_id: candidate.id,
      exam_id: exam.id,
      session_id: session.id,
    };
    await expect(
      registrationService.create(input, failingActor),
    ).rejects.toThrow();
    expect(
      await prisma.examinationRegistration.count({
        where: { session_id: session.id },
      }),
    ).toBe(0);
    const registration = await registrationService.create(input, admin);
    await expect(
      registrationService.cancel(registration.id, failingActor),
    ).rejects.toThrow();
    expect(
      (
        await prisma.examinationRegistration.findUniqueOrThrow({
          where: { id: registration.id },
        })
      ).status,
    ).toBe("ACTIVE");
  });

  it("rolls back a session transition on audit failure", async () => {
    const { session } = await seedExamSession({ status: "PLANNED" });
    await expect(
      sessionService.update(session.id, { status: "OPEN" }, failingActor),
    ).rejects.toThrow();
    expect(
      (
        await prisma.examSession.findUniqueOrThrow({
          where: { id: session.id },
        })
      ).status,
    ).toBe("PLANNED");
    await sessionService.update(session.id, { capacity: 12 }, admin);
    expect(
      await prisma.auditLog.count({
        where: {
          entityId: session.id,
          action: "EXAM_SESSION_UPDATED",
          actorId: admin.userId,
        },
      }),
    ).toBe(1);
  });

  it("rejects cancelled-session registration and closed-session pending activation", async () => {
    const { candidate, exam, session } = await seedExamSession({
      status: "CANCELLED",
    });
    await expect(
      registrationService.create(
        {
          candidate_id: candidate.id,
          exam_id: exam.id,
          session_id: session.id,
        },
        admin,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await prisma.examSession.update({
      where: { id: session.id },
      data: { status: "CLOSED" },
    });
    const pending = await prisma.examinationRegistration.create({
      data: {
        candidate_id: candidate.id,
        exam_id: exam.id,
        session_id: session.id,
        status: "PENDING",
      },
    });
    await expect(
      registrationService.updateStatus(pending.id, "ACTIVE", admin),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (
        await prisma.examinationRegistration.findUniqueOrThrow({
          where: { id: pending.id },
        })
      ).status,
    ).toBe("PENDING");
  });
});
