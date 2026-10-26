import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExaminationService } from "./examination.service";

describe("ExaminationService (unit, mocked Prisma)", () => {
  let service: ExaminationService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      exam: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      ticket: {
        count: vi.fn().mockResolvedValue(0),
      },
    };
    service = new ExaminationService(prisma);
  });

  describe("findAll", () => {
    it("filters by status and search and maps rows", async () => {
      prisma.exam.findMany.mockResolvedValue([
        {
          id: "exam-1",
          code: "EX-1",
          title: "İmtahan",
          description: null,
          status: "DRAFT",
          createdAt: new Date("2026-01-01"),
          sessions: [{ id: "s-1" }],
        },
      ]);

      const result = await service.findAll({ status: "DRAFT", search: "EX" });

      expect(prisma.exam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: "DRAFT",
            OR: [
              { code: { contains: "EX", mode: "insensitive" } },
              { title: { contains: "EX", mode: "insensitive" } },
            ],
          },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].sessionCount).toBe(1);
    });
  });

  describe("findOne", () => {
    it("throws when the exam does not exist", async () => {
      prisma.exam.findUnique.mockResolvedValue(null);
      await expect(service.findOne("missing")).rejects.toThrow(
        "Sənəd tapılmadı",
      );
    });

    it("returns sessions for an existing exam", async () => {
      prisma.exam.findUnique.mockResolvedValue({
        id: "exam-1",
        code: "EX-1",
        title: "İmtahan",
        description: null,
        status: "DRAFT",
        createdAt: new Date(),
        updatedAt: new Date(),
        sessions: [
          {
            id: "s-1",
            examId: "exam-1",
            sessionCode: "S-1",
            startsAt: new Date(),
            endsAt: new Date(),
            venue: "Otaq",
            capacity: 10,
            status: "OPEN",
          },
        ],
      });

      const result = await service.findOne("exam-1");
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].sessionCode).toBe("S-1");
    });
  });

  describe("create", () => {
    it("rejects a negative exam price", async () => {
      await expect(
        service.create({
          code: "EX-1",
          title: "İmtahan",
          price: -1,
          createdBy: "user-1",
        }),
      ).rejects.toThrow("Qiymət qəpik ilə mənfi olmayan tam ədəd olmalıdır");
    });

    it("creates an exam without a configured price", async () => {
      prisma.exam.findFirst.mockResolvedValue(null);
      prisma.exam.create.mockResolvedValue({
        id: "exam-1",
        code: "EX-1",
        title: "İmtahan",
        description: null,
        price: null,
        status: "DRAFT",
        createdAt: new Date(),
      });

      const result = await service.create({
        code: "EX-1",
        title: "İmtahan",
        createdBy: "user-1",
      });

      expect(result.price).toBeNull();
      expect(prisma.exam.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ price: null }),
        }),
      );
    });

    it("keeps an explicitly free exam at zero qepik", async () => {
      prisma.exam.findFirst.mockResolvedValue(null);
      prisma.exam.create.mockResolvedValue({
        id: "exam-1",
        code: "EX-1",
        title: "İmtahan",
        description: null,
        price: 0,
        status: "DRAFT",
        createdAt: new Date(),
      });

      const result = await service.create({
        code: "EX-1",
        title: "İmtahan",
        price: 0,
        createdBy: "user-1",
      });

      expect(result.price).toBe(0);
    });

    it("rejects a duplicate exam code", async () => {
      prisma.exam.findFirst.mockResolvedValue({ id: "existing" });

      await expect(
        service.create({
          code: "EX-1",
          title: "İmtahan",
          createdBy: "user-1",
        }),
      ).rejects.toThrow();
    });

    it("creates a DRAFT exam", async () => {
      prisma.exam.findFirst.mockResolvedValue(null);
      prisma.exam.create.mockResolvedValue({
        id: "exam-1",
        code: "EX-1",
        title: "İmtahan",
        description: null,
        status: "DRAFT",
        createdAt: new Date(),
      });

      const result = await service.create({
        code: "EX-1",
        title: "İmtahan",
        createdBy: "user-1",
      });

      expect(result.status).toBe("DRAFT");
      expect(prisma.exam.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ code: "EX-1", status: "DRAFT" }),
        }),
      );
    });
  });

  it("rejects publishing an unpriced exam through either update or publish", async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: "exam-1",
      status: "DRAFT",
      price: null,
    });
    await expect(service.publish("exam-1", "user-1")).rejects.toThrow("qiymət");
    await expect(
      service.update("exam-1", { status: "PUBLISHED" }),
    ).rejects.toThrow("qiymət");
  });

  describe("publish", () => {
    it("rejects publishing a non-draft exam", async () => {
      prisma.exam.findUnique.mockResolvedValue({
        id: "exam-1",
        status: "PUBLISHED",
      });

      await expect(service.publish("exam-1", "user-1")).rejects.toThrow();
    });
  });
});
