import { describe, it, expect, beforeEach, vi } from "vitest";
import { CandidateService } from "./candidate.service";
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

describe("CandidateService (unit, mocked Prisma)", () => {
  let service: CandidateService;
  let prisma: any;
  let audit: any;

  beforeEach(() => {
    prisma = {
      candidate: {
        findMany: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      branch: {
        findUnique: vi.fn(),
      },
    };
    prisma.$transaction = vi.fn(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
    prisma.$queryRaw = vi.fn().mockResolvedValue([]);
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    service = new CandidateService(prisma, audit);
  });

  describe("findAll", () => {
    it("paginates and returns metadata", async () => {
      prisma.candidate.findMany.mockResolvedValue([
        {
          id: "c-1",
          candidate_number: "QDABC",
          full_name: "Ali Məmmədov",
          email: null,
          phone: null,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
          _count: { registrations: 2 },
        },
      ]);
      prisma.candidate.count.mockResolvedValue(21);

      const result = await service.findAll({ page: 2, limit: 10 }, admin);

      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
      expect(result).toMatchObject({ total: 21, page: 2, totalPages: 3 });
      expect(result.data[0].registrationCount).toBe(2);
    });

    it("restricts branch managers to their branches", async () => {
      prisma.candidate.findMany.mockResolvedValue([]);
      prisma.candidate.count.mockResolvedValue(0);

      await service.findAll({}, branchManager);

      expect(prisma.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { branch_id: { in: ["branch-1"] } },
              { registrations: { some: { branch_id: { in: ["branch-1"] } } } },
            ],
          },
        }),
      );
    });

    it("searches candidate number, name, email and phone", async () => {
      prisma.candidate.findMany.mockResolvedValue([]);
      prisma.candidate.count.mockResolvedValue(0);

      await service.findAll({ search: "ali" }, admin);

      const where = prisma.candidate.findMany.mock.calls[0][0].where;
      expect(where.AND[0].OR).toEqual(
        expect.arrayContaining([
          { full_name: { contains: "ali", mode: "insensitive" } },
          { candidate_number: { contains: "ali", mode: "insensitive" } },
          { email: { contains: "ali", mode: "insensitive" } },
          { phone: { contains: "ali", mode: "insensitive" } },
        ]),
      );
    });
  });

  describe("create", () => {
    it("generates a unique candidate number and writes an audit entry", async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);
      prisma.candidate.create.mockResolvedValue({
        id: "c-1",
        candidate_number: "QD123ABCD",
        full_name: "Ali Məmmədov",
        email: null,
        phone: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.create({ full_name: "Ali Məmmədov" }, admin);

      expect(result.candidate_number).toMatch(/^QD/);
      expect(audit.log).toHaveBeenCalledWith(
        "CANDIDATE_CREATED",
        "admin-1",
        "Candidate",
        "c-1",
        expect.any(Object),
        prisma,
      );
    });

    it("retries when the generated number collides", async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);
      prisma.candidate.create
        .mockRejectedValueOnce({
          code: "P2002",
          meta: { target: "candidate_number" },
        })
        .mockResolvedValueOnce({
          id: "c-1",
          candidate_number: "QD999",
          full_name: "Ali",
          email: null,
          phone: null,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        });

      const result = await service.create({ full_name: "Ali" }, admin);

      expect(prisma.candidate.create).toHaveBeenCalledTimes(2);
      expect(result.id).toBe("c-1");
    });

    it("rejects duplicate email addresses", async () => {
      prisma.candidate.findFirst.mockResolvedValue({ id: "existing" });

      await expect(
        service.create({ full_name: "Ali", email: "ali@example.com" }, admin),
      ).rejects.toThrow("artıq mövcuddur");
    });

    it("normalizes emails to lower case before persistence", async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);
      prisma.candidate.create.mockResolvedValue({
        id: "c-1",
        candidate_number: "QD123",
        full_name: "Ali",
        email: "ali@example.com",
        phone: null,
        is_active: true,
        branch_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await service.create(
        { full_name: "Ali", email: "  ALI@EXAMPLE.COM " },
        admin,
      );

      expect(prisma.candidate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: { equals: "ali@example.com", mode: "insensitive" } },
        }),
      );
      expect(prisma.candidate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: "ali@example.com" }),
        }),
      );
    });

    it("assigns a branch manager's branch to a new candidate", async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: "branch-1" });
      prisma.candidate.findFirst.mockResolvedValue(null);
      prisma.candidate.create.mockResolvedValue({
        id: "c-1",
        candidate_number: "QD123",
        full_name: "Ali",
        email: null,
        phone: null,
        is_active: true,
        branch_id: "branch-1",
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.create({ full_name: "Ali" }, branchManager);

      expect(prisma.candidate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branch_id: "branch-1" }),
        }),
      );
      expect(result.branch_id).toBe("branch-1");
    });
  });

  describe("findOne", () => {
    it("does not expose candidates outside a branch manager's branches", async () => {
      prisma.candidate.findFirst.mockResolvedValue(null);

      await expect(service.findOne("c-1", branchManager)).rejects.toThrow(
        "Namizəd tapılmadı",
      );
    });

    it("returns an unregistered candidate owned by the manager's branch", async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: "c-1",
        candidate_number: "QD1",
        full_name: "Ali",
        email: null,
        phone: null,
        is_active: true,
        branch_id: "branch-1",
        created_at: new Date(),
        updated_at: new Date(),
        registrations: [],
      });

      const result = await service.findOne("c-1", branchManager);

      expect(result.id).toBe("c-1");
      expect(result.registrations).toEqual([]);
    });
  });

  describe("toggleActive", () => {
    it("flips the active flag and audits the change", async () => {
      prisma.candidate.findFirst.mockResolvedValue({
        id: "c-1",
        is_active: false,
      });
      prisma.candidate.update.mockResolvedValue({
        id: "c-1",
        candidate_number: "QD1",
        full_name: "Ali",
        email: null,
        phone: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await service.toggleActive("c-1", admin);

      expect(result.is_active).toBe(true);
      expect(audit.log).toHaveBeenCalled();
    });
  });
});
