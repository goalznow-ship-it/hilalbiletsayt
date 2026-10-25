import { describe, it, expect, beforeEach, vi } from "vitest";
import { RegistrationService } from "./registration.service";
import type { AuthenticatedUser } from "../auth/authorization";

const admin: AuthenticatedUser = {
  userId: "admin-1",
  roles: ["CENTRAL_ADMIN"],
  branches: [],
};

const branchManager: AuthenticatedUser = {
  userId: "manager-1",
  roles: ["BRANCH_MANAGER"],
  branches: [{ id: "branch-1" }],
};

const candidate = {
  id: "candidate-1",
  candidate_number: "QD1",
  full_name: "Ali Məmmədov",
  email: null,
  phone: null,
  is_active: true,
};

const exam = {
  id: "exam-1",
  code: "EX-1",
  title: "İmtahan",
  status: "PUBLISHED",
};

const openSession = {
  id: "session-1",
  examId: "exam-1",
  sessionCode: "S-1",
  startsAt: new Date(),
  endsAt: new Date(),
  venue: "Otaq A",
  capacity: 2,
  status: "OPEN",
};

function registrationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "reg-1",
    candidate_id: "candidate-1",
    exam_id: "exam-1",
    session_id: "session-1",
    branch_id: null,
    status: "ACTIVE",
    registered_at: new Date(),
    candidate,
    exam,
    session: openSession,
    ...overrides,
  };
}

describe("RegistrationService (unit, mocked Prisma)", () => {
  let service: RegistrationService;
  let prisma: any;
  let tx: any;
  let audit: any;

  beforeEach(() => {
    tx = {
      candidate: { findFirst: vi.fn().mockResolvedValue(candidate) },
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: "session-1" }]),
      examSession: { findUnique: vi.fn().mockResolvedValue(openSession) },
      examinationRegistration: {
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "reg-1" }),
        update: vi.fn().mockResolvedValue({ id: "reg-1" }),
      },
    };
    prisma = {
      candidate: { findFirst: vi.fn().mockResolvedValue(candidate) },
      exam: { findUnique: vi.fn().mockResolvedValue(exam) },
      branch: { findUnique: vi.fn() },
      examinationRegistration: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(registrationRow()),
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn().mockResolvedValue({ id: "reg-1" }),
      },
      $transaction: vi.fn(async (callback: any) => callback(tx)),
    };
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    service = new RegistrationService(prisma, audit);
  });

  const input = {
    candidate_id: "candidate-1",
    exam_id: "exam-1",
    session_id: "session-1",
  };

  describe("create", () => {
    it("creates a registration when all checks pass", async () => {
      const result = await service.create(input, admin);

      expect(result.id).toBe("reg-1");
      expect(tx.examinationRegistration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "ACTIVE" }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        "REGISTRATION_CREATED",
        "admin-1",
        "ExaminationRegistration",
        "reg-1",
        expect.any(Object),
        tx,
      );
    });

    it("rejects a closed session", async () => {
      tx.examSession.findUnique.mockResolvedValue({
        ...openSession,
        status: "CLOSED",
      });

      await expect(service.create(input, admin)).rejects.toThrow(
        "Sessiya qeydiyyata açıq deyil",
      );
    });

    it("rejects a session that belongs to another exam", async () => {
      tx.examSession.findUnique.mockResolvedValue({
        ...openSession,
        examId: "other-exam",
      });

      await expect(service.create(input, admin)).rejects.toThrow(
        "Sessiya seçilmiş imtahana aid deyil",
      );
    });

    it("rejects a full session", async () => {
      tx.examinationRegistration.count.mockResolvedValue(2);

      await expect(service.create(input, admin)).rejects.toThrow(
        "Sessiyanın tutumu doludur",
      );
    });

    it("rejects an already active duplicate registration", async () => {
      prisma.examinationRegistration.findFirst.mockResolvedValue(
        registrationRow(),
      );

      await expect(service.create(input, admin)).rejects.toThrow(
        "artıq həmin sessiyaya qeydiyyatdan keçib",
      );
    });

    it("reactivates a cancelled registration instead of duplicating it", async () => {
      prisma.examinationRegistration.findFirst.mockResolvedValue(
        registrationRow({ status: "CANCELLED" }),
      );
      tx.examinationRegistration.findFirst.mockResolvedValue(
        registrationRow({ status: "CANCELLED" }),
      );

      await service.create(input, admin);

      expect(tx.examinationRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "reg-1" },
          data: expect.objectContaining({ status: "ACTIVE" }),
        }),
      );
      expect(tx.examinationRegistration.create).not.toHaveBeenCalled();
    });

    it("forbids a branch manager from registering into another branch", async () => {
      await expect(
        service.create({ ...input, branch_id: "branch-2" }, branchManager),
      ).rejects.toThrow("icazəniz yoxdur");
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("requires a branch for branch managers", async () => {
      await expect(service.create(input, branchManager)).rejects.toThrow(
        "Filial seçilməlidir",
      );
    });

    it("rejects an inactive candidate", async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        ...candidate,
        is_active: false,
      });

      await expect(service.create(input, admin)).rejects.toThrow(
        "Deaktiv namizəd",
      );
    });
  });

  describe("updateStatus", () => {
    beforeEach(() => {
      tx.examinationRegistration.findFirst.mockImplementation(() =>
        prisma.examinationRegistration.findFirst(),
      );
      tx.examinationRegistration.update.mockResolvedValue(
        registrationRow({ status: "CANCELLED" }),
      );
    });
    it("rejects an invalid transition from CANCELLED to ACTIVE", async () => {
      prisma.examinationRegistration.findFirst.mockResolvedValue(
        registrationRow({ status: "CANCELLED" }),
      );

      await expect(
        service.updateStatus("reg-1", "ACTIVE", admin),
      ).rejects.toThrow("keçirilə bilməz");
    });

    it("cancels an active registration", async () => {
      prisma.examinationRegistration.findFirst.mockResolvedValue(
        registrationRow(),
      );
      tx.examinationRegistration.findUnique.mockResolvedValue(
        registrationRow(),
      );
      prisma.examinationRegistration.findUnique.mockResolvedValue(
        registrationRow({ status: "CANCELLED" }),
      );

      const result = await service.updateStatus("reg-1", "CANCELLED", admin);

      expect(result.status).toBe("CANCELLED");
      expect(tx.examinationRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "reg-1" },
          data: { status: "CANCELLED" },
        }),
      );
    });
  });

  describe("cancel", () => {
    beforeEach(() => {
      tx.examinationRegistration.findFirst.mockImplementation(() =>
        prisma.examinationRegistration.findFirst(),
      );
      tx.examinationRegistration.update.mockResolvedValue(
        registrationRow({ status: "CANCELLED" }),
      );
    });
    it("sets status to CANCELLED and preserves the row", async () => {
      prisma.examinationRegistration.findFirst.mockResolvedValue(
        registrationRow(),
      );
      prisma.examinationRegistration.findUnique.mockResolvedValue(
        registrationRow({ status: "CANCELLED" }),
      );

      const result = await service.cancel("reg-1", admin);

      expect(result.status).toBe("CANCELLED");
      expect(tx.examinationRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "reg-1" },
          data: { status: "CANCELLED" },
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        "REGISTRATION_CANCELLED",
        "admin-1",
        "ExaminationRegistration",
        "reg-1",
        expect.any(Object),
        tx,
      );
    });
  });

  describe("findAll", () => {
    it("scopes branch managers to their branches", async () => {
      prisma.examinationRegistration.findMany = vi.fn().mockResolvedValue([]);
      prisma.examinationRegistration.count = vi.fn().mockResolvedValue(0);

      await service.findAll({}, branchManager);

      expect(prisma.examinationRegistration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { branch_id: { in: ["branch-1"] } },
        }),
      );
    });
  });
});
