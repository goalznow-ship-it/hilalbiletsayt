import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExaminationSessionService } from "./examination.session.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

const baseSession = {
  id: "s-1",
  examId: "exam-1",
  sessionCode: "S-1",
  startsAt: new Date("2026-02-01T09:00:00Z"),
  endsAt: new Date("2026-02-01T11:00:00Z"),
  venue: "Otaq A",
  capacity: 10,
  status: "PLANNED",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("ExaminationSessionService (unit, mocked Prisma)", () => {
  let service: ExaminationSessionService;
  let findMany: ReturnType<typeof vi.fn>;
  let findUnique: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let examFindUnique: ReturnType<typeof vi.fn>;
  let txFindUnique: ReturnType<typeof vi.fn>;
  let txUpdate: ReturnType<typeof vi.fn>;
  let activeCount: ReturnType<typeof vi.fn>;
  let auditLog: ReturnType<typeof vi.fn>;
  let tx: {
    $queryRaw: ReturnType<typeof vi.fn>;
    examSession: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    examinationRegistration: { count: ReturnType<typeof vi.fn> };
    ticket: { count: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    findMany = vi.fn();
    findUnique = vi.fn();
    create = vi.fn();
    update = vi.fn();
    examFindUnique = vi.fn();
    txFindUnique = vi.fn();
    txUpdate = vi.fn();
    activeCount = vi.fn().mockResolvedValue(0);
    auditLog = vi.fn().mockResolvedValue(undefined);

    tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      examSession: { findUnique: txFindUnique, create, update: txUpdate },
      examinationRegistration: { count: activeCount },
      ticket: { count: vi.fn().mockResolvedValue(0) },
    };

    const prisma = {
      examSession: { findMany, findUnique, create, update },
      exam: { findUnique: examFindUnique },
      ticket: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    } as unknown as PrismaService;
    const audit = { log: auditLog } as unknown as AuditService;

    service = new ExaminationSessionService(prisma, audit);
  });

  describe("findAll", () => {
    it("maps sessions and applies filters", async () => {
      findMany.mockResolvedValue([baseSession]);

      const result = await service.findAll({
        examId: "exam-1",
        status: "OPEN",
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { examId: "exam-1", status: "OPEN" },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].sessionCode).toBe("S-1");
    });
  });

  describe("findOne", () => {
    it("throws when the session does not exist", async () => {
      findUnique.mockResolvedValue(null);
      await expect(service.findOne("missing")).rejects.toThrow(
        "Sessiya tapılmadı",
      );
    });
  });

  describe("create", () => {
    it("rejects an invalid date range", async () => {
      await expect(
        service.create({
          examId: "exam-1",
          sessionCode: "S-1",
          startsAt: "2026-02-01T11:00:00Z",
          endsAt: "2026-02-01T09:00:00Z",
          venue: "Otaq A",
          capacity: 10,
        }),
      ).rejects.toThrow("Başlama vaxtı bitiş vaxtından əvvəl olmalıdır");
    });

    it("rejects a non-positive capacity", async () => {
      await expect(
        service.create({
          examId: "exam-1",
          sessionCode: "S-1",
          startsAt: "2026-02-01T09:00:00Z",
          endsAt: "2026-02-01T11:00:00Z",
          venue: "Otaq A",
          capacity: 0,
        }),
      ).rejects.toThrow("Kapasitet 0-dan böyük olmalıdır");
    });

    it("creates a planned session", async () => {
      examFindUnique.mockResolvedValue({ id: "exam-1" });
      create.mockResolvedValue(baseSession);

      const result = await service.create({
        examId: "exam-1",
        sessionCode: "S-1",
        startsAt: "2026-02-01T09:00:00Z",
        endsAt: "2026-02-01T11:00:00Z",
        venue: "Otaq A",
        capacity: 10,
      });

      expect(result.status).toBe("PLANNED");
      expect(auditLog).toHaveBeenCalledWith(
        "EXAM_SESSION_CREATED",
        undefined,
        "ExamSession",
        "s-1",
        expect.any(Object),
        tx,
      );
    });
  });

  describe("update", () => {
    it("throws when the session does not exist", async () => {
      txFindUnique.mockResolvedValue(null);
      await expect(service.update("missing", { capacity: 20 })).rejects.toThrow(
        "Sessiya tapılmadı",
      );
    });

    it("opens a planned session", async () => {
      txFindUnique.mockResolvedValue(baseSession);
      txUpdate.mockResolvedValue({ ...baseSession, status: "OPEN" });

      const result = await service.update("s-1", { status: "OPEN" });

      expect(result.status).toBe("OPEN");
      expect(auditLog).toHaveBeenCalledWith(
        "EXAM_SESSION_OPENED",
        undefined,
        "ExamSession",
        "s-1",
        { from: "PLANNED", to: "OPEN", capacity: 10 },
        tx,
      );
    });

    it("rejects an invalid lifecycle transition", async () => {
      txFindUnique.mockResolvedValue(baseSession);

      await expect(service.update("s-1", { status: "CLOSED" })).rejects.toThrow(
        "keçirilə bilməz",
      );
    });

    it("rejects cancellation while active registrations exist", async () => {
      txFindUnique.mockResolvedValue({ ...baseSession, status: "OPEN" });
      activeCount.mockResolvedValue(1);

      await expect(
        service.update("s-1", { status: "CANCELLED" }),
      ).rejects.toThrow("Aktiv qeydiyyatı olan sessiya ləğv edilə bilməz");
    });

    it("rejects reducing capacity below the active registration count", async () => {
      txFindUnique.mockResolvedValue(baseSession);
      activeCount.mockResolvedValue(8);

      await expect(service.update("s-1", { capacity: 5 })).rejects.toThrow(
        "Kapasitet aktiv qeydiyyat sayından az ola bilməz",
      );
    });
  });
});
