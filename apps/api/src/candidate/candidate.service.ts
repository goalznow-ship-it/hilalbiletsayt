import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  AuthenticatedUser,
  candidateVisibilityWhere,
  assertBranchAllowed,
  getBranchIds,
  isCentralAdmin,
} from "../auth/authorization";
import {
  PaginationQuery,
  resolvePagination,
  toPaginated,
} from "../common/pagination";

type CandidateFilters = PaginationQuery & {
  search?: string;
  is_active?: boolean;
};

type CandidateMutationData = {
  full_name?: string;
  email?: string | null;
  phone?: string | null;
  is_active?: boolean;
  branch_id?: string | null;
};

type CandidateRegistrationRecord = {
  id: string;
  status: string;
  branch_id: string | null;
  registered_at: Date;
  exam: { id: string; code: string; title: string };
  session: { id: string; sessionCode: string };
};

type CandidateRecord = {
  id: string;
  candidate_number: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  branch_id: string | null;
  created_at: Date;
  updated_at: Date;
  _count?: { registrations: number };
  registrations?: CandidateRegistrationRecord[];
};

function generateCandidateNumber(): string {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()
    .padEnd(4, "0");
  return `QD${time}${random}`;
}

function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function prismaErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function prismaErrorTarget(error: unknown): string {
  if (!isRecord(error) || !isRecord(error.meta)) return "";
  const target = error.meta.target;
  if (Array.isArray(target)) return target.join(",");
  return typeof target === "string" ? target : "";
}

function isEmailUniqueError(error: unknown): boolean {
  if (prismaErrorCode(error) !== "P2002") return false;
  const target = prismaErrorTarget(error).toLowerCase();
  return (
    target.includes("email") || target.includes("candidates_email_lower_key")
  );
}

function isCandidateNumberUniqueError(error: unknown): boolean {
  return (
    prismaErrorCode(error) === "P2002" &&
    prismaErrorTarget(error).toLowerCase().includes("candidate_number")
  );
}

const EMAIL_CONFLICT_MESSAGE = "Bu e-poçt ünvanı ilə namizəd artıq mövcuddur";

@Injectable()
export class CandidateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private mapCandidate(candidate: CandidateRecord) {
    return {
      id: candidate.id,
      candidate_number: candidate.candidate_number,
      full_name: candidate.full_name,
      email: candidate.email,
      phone: candidate.phone,
      is_active: candidate.is_active,
      branch_id: candidate.branch_id,
      created_at: candidate.created_at,
      updated_at: candidate.updated_at,
      registrationCount:
        candidate._count?.registrations ?? candidate.registrations?.length ?? 0,
    };
  }

  private visibilityWhere(user: AuthenticatedUser): Prisma.CandidateWhereInput {
    return candidateVisibilityWhere(user);
  }

  private async assertBranchExists(branchId: string): Promise<void> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException("Filial tapılmadı");
    }
  }

  private async resolveCreateBranch(
    branchId: string | null | undefined,
    user: AuthenticatedUser,
  ): Promise<string | null> {
    if (isCentralAdmin(user)) {
      if (!branchId) return null;
      await this.assertBranchExists(branchId);
      return branchId;
    }

    const allowedBranchIds = getBranchIds(user);
    if (allowedBranchIds.length === 0) {
      throw new ForbiddenException("Filial təyinatınız yoxdur");
    }

    const selectedBranchId = branchId ?? allowedBranchIds[0];
    assertBranchAllowed(user, selectedBranchId);
    await this.assertBranchExists(selectedBranchId);
    return selectedBranchId;
  }

  async findAll(
    filters: CandidateFilters | undefined,
    user: AuthenticatedUser,
  ) {
    const { page, limit, skip, take } = resolvePagination(filters);
    const where: Prisma.CandidateWhereInput = { ...this.visibilityWhere(user) };

    if (filters?.search) {
      const search = filters.search.trim();
      if (search) {
        where.AND = [
          {
            OR: [
              { full_name: { contains: search, mode: "insensitive" } },
              { candidate_number: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
            ],
          },
        ];
      }
    }

    if (filters?.is_active !== undefined) {
      where.is_active = filters.is_active;
    }

    const [rows, total] = await Promise.all([
      this.prisma.candidate.findMany({
        where,
        include: {
          _count: {
            select: {
              registrations: isCentralAdmin(user)
                ? true
                : { where: { branch_id: { in: getBranchIds(user) } } },
            },
          },
        },
        orderBy: { created_at: "desc" },
        skip,
        take,
      }),
      this.prisma.candidate.count({ where }),
    ]);

    return toPaginated(
      rows.map((row) => this.mapCandidate(row)),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const branchIds = getBranchIds(user);
    const central = isCentralAdmin(user);

    const candidate = await this.prisma.candidate.findFirst({
      where: {
        id,
        ...this.visibilityWhere(user),
      },
      include: {
        registrations: {
          where: central ? undefined : { branch_id: { in: branchIds } },
          include: { exam: true, session: true },
          orderBy: { registered_at: "desc" },
        },
      },
    });

    if (!candidate) {
      throw new NotFoundException("Namizəd tapılmadı");
    }

    return {
      ...this.mapCandidate(candidate),
      registrations: (candidate.registrations ?? []).map((registration) => ({
        id: registration.id,
        status: registration.status,
        branch_id: registration.branch_id,
        exam: {
          id: registration.exam.id,
          code: registration.exam.code,
          title: registration.exam.title,
        },
        session: {
          id: registration.session.id,
          sessionCode: registration.session.sessionCode,
        },
        registered_at: registration.registered_at,
      })),
    };
  }

  private async getAccessibleCandidate(id: string, user: AuthenticatedUser) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id, ...this.visibilityWhere(user) },
    });

    if (!candidate) {
      throw new NotFoundException("Namizəd tapılmadı");
    }

    return candidate;
  }

  async create(
    data: {
      full_name: string;
      email?: string | null;
      phone?: string | null;
      is_active?: boolean;
      branch_id?: string | null;
    },
    user: AuthenticatedUser,
  ) {
    const email = normalizeEmail(data.email);
    const phone = data.phone?.trim() || null;
    const branchId = await this.resolveCreateBranch(data.branch_id, user);

    if (email) {
      const existing = await this.prisma.candidate.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(EMAIL_CONFLICT_MESSAGE);
      }
    }

    let candidate: CandidateRecord | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 5 && !candidate; attempt += 1) {
      try {
        candidate = await this.prisma.$transaction(async (tx) => {
          const created = await tx.candidate.create({
            data: {
              candidate_number: generateCandidateNumber(),
              full_name: data.full_name.trim(),
              email,
              phone,
              is_active: data.is_active !== undefined ? data.is_active : true,
              branch_id: branchId,
            },
          });
          await this.audit.log(
            "CANDIDATE_CREATED",
            user.userId,
            "Candidate",
            created.id,
            {
              candidate_number: created.candidate_number,
              branch_id: created.branch_id,
            },
            tx,
          );
          return created;
        });
      } catch (error) {
        lastError = error;
        if (isEmailUniqueError(error)) {
          throw new ConflictException(EMAIL_CONFLICT_MESSAGE);
        }
        if (!isCandidateNumberUniqueError(error)) {
          throw error;
        }
      }
    }

    if (!candidate) {
      throw lastError instanceof Error
        ? lastError
        : new ConflictException("Namizəd nömrəsi yaradıla bilmədi");
    }

    return this.mapCandidate(candidate);
  }

  async update(
    id: string,
    data: CandidateMutationData,
    user: AuthenticatedUser,
  ) {
    const candidate = await this.getAccessibleCandidate(id, user);
    const central = isCentralAdmin(user);

    let branchId = candidate.branch_id;
    if (data.branch_id !== undefined) {
      if (!central) {
        if (!data.branch_id) {
          throw new BadRequestException("Filial seçilməlidir");
        }
        assertBranchAllowed(user, data.branch_id);
      }
      if (data.branch_id) {
        await this.assertBranchExists(data.branch_id);
      }
      branchId = data.branch_id;
    }

    const email =
      data.email !== undefined ? normalizeEmail(data.email) : candidate.email;
    if (email && email !== candidate.email) {
      const existing = await this.prisma.candidate.findFirst({
        where: {
          email: { equals: email, mode: "insensitive" },
          id: { not: id },
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(EMAIL_CONFLICT_MESSAGE);
      }
    }

    let updated: CandidateRecord;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.candidate.update({
          where: { id, AND: this.visibilityWhere(user) },
          data: {
            ...(data.full_name !== undefined
              ? { full_name: data.full_name.trim() }
              : {}),
            ...(data.email !== undefined ? { email } : {}),
            ...(data.phone !== undefined
              ? { phone: data.phone?.trim() || null }
              : {}),
            ...(data.is_active !== undefined
              ? { is_active: data.is_active }
              : {}),
            ...(data.branch_id !== undefined ? { branch_id: branchId } : {}),
          },
        });
        await this.audit.log(
          "CANDIDATE_UPDATED",
          user.userId,
          "Candidate",
          id,
          {
            candidate_number: result.candidate_number,
            changed_fields: Object.keys(data),
          },
          tx,
        );
        return result;
      });
    } catch (error) {
      if (isEmailUniqueError(error))
        throw new ConflictException(EMAIL_CONFLICT_MESSAGE);
      throw error;
    }
    return this.mapCandidate(updated);
  }

  async toggleActive(id: string, user: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "candidates" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const candidate = await tx.candidate.findFirst({
        where: { id, ...this.visibilityWhere(user) },
      });
      if (!candidate) throw new NotFoundException("Namizəd tapılmadı");
      const updated = await tx.candidate.update({
        where: { id },
        data: { is_active: !candidate.is_active },
      });
      await this.audit.log(
        "CANDIDATE_STATUS_CHANGED",
        user.userId,
        "Candidate",
        id,
        {
          candidate_number: updated.candidate_number,
          is_active: updated.is_active,
        },
        tx,
      );
      return this.mapCandidate(updated);
    });
  }
}
