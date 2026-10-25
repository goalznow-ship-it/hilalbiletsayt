import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExaminationService } from "./examination.service";

describe("ExaminationService", () => {
  let prisma: any;

  beforeEach(() => {
    prisma = {
      exam: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      exam_session: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
  });

  describe("findAll", () => {
    it("returns exams", () => {
      prisma.exam.findMany.mockResolvedValue([{ id: "1", code: "EX001" }]);
      const service = new (require("./examination.service").ExaminationService)({ prisma });
      const result = await service.findAll({});
      expect(result).toHaveLength(1);
    });
  });
});
