import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
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

type RegistrationFilters = PaginationQuery & {
  candidate_id?: string;
  exam_id?: string;
  session_id?: string;
  status?: "ACTIVE" | "CANCELLED";
  is_active?: boolean;
};

type RegistrationInput = {
  candidate_id: string;
  exam_id: string;
  session_id: string;
  branch_id?: string;
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["CANCELLED"],
  CANCELLED: [],
};

const REGISTRATION_INCLUDE = {
  candidate: {
    select: {
      id: true,
      candidate_number: true,
      full_name: true,
      email: true,
      phone: true,
      is_active: true,
    },
  },
  exam: { select: { id: true, code: true, title: true, status: true } },
  session: {
    select: {
      id: true,
      sessionCode: true,
      startsAt: true,
      endsAt: true,
      venue: true,
      capacity: true,
    },
  },
} satisfies Prisma.ExaminationRegistrationInclude;

type RegistrationRecord = Prisma.ExaminationRegistrationGetPayload<{
  include: typeof REGISTRATION_INCLUDE;
}>;

@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private mapRegistration(registration: RegistrationRecord) {
    return {
      id: registration.id,
      candidate: {
        id: registration.candidate.id,
        candidate_number: registration.candidate.candidate_number,
        full_name: registration.candidate.full_name,
      },
      exam: {
        id: registration.exam.id,
        code: registration.exam.code,
        title: registration.exam.title,
      },
      session: {
        id: registration.session.id,
        sessionCode: registration.session.sessionCode,
        startsAt: registration.session.startsAt,
        endsAt: registration.session.endsAt,
        venue: registration.session.venue,
        capacity: registration.session.capacity,
      },
      status: registration.status,
      registered_at: registration.registered_at,
      branch_id: registration.branch_id,
    };
  }

  private visibilityWhere(user: AuthenticatedUser) {
    if (isCentralAdmin(user)) {
      return {};
    }
    return { branch_id: { in: getBranchIds(user) } };
  }

  private async getAccessibleRegistration(id: string, user: AuthenticatedUser) {
    const registration = await this.prisma.examinationRegistration.findFirst({
      where: { id, ...this.visibilityWhere(user) },
      include: REGISTRATION_INCLUDE,
    });

    if (!registration) {
      throw new NotFoundException("Qeydiyyat tapılmadı");
    }

    return registration;
  }

  async findAll(
    filters: RegistrationFilters | undefined,
    user: AuthenticatedUser,
  ) {
    const { page, limit, skip, take } = resolvePagination(filters);
    const where: Prisma.ExaminationRegistrationWhereInput = {
      ...this.visibilityWhere(user),
    };

    if (filters?.candidate_id) where.candidate_id = filters.candidate_id;
    if (filters?.exam_id) where.exam_id = filters.exam_id;
    if (filters?.session_id) where.session_id = filters.session_id;
    if (filters?.status) where.status = filters.status;
    if (filters?.is_active !== undefined) {
      where.status = filters.is_active ? "ACTIVE" : "CANCELLED";
    }

    const [rows, total] = await Promise.all([
      this.prisma.examinationRegistration.findMany({
        where,
        include: REGISTRATION_INCLUDE,
        orderBy: { registered_at: "desc" },
        skip,
        take,
      }),
      this.prisma.examinationRegistration.count({ where }),
    ]);

    return toPaginated(
      rows.map((row) => this.mapRegistration(row)),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const registration = await this.getAccessibleRegistration(id, user);
    return this.mapRegistration(registration);
  }

  async create(data: RegistrationInput, user: AuthenticatedUser) {
    const central = isCentralAdmin(user);
    const branchId = data.branch_id ?? null;

    if (!central) {
      if (!branchId) {
        throw new BadRequestException("Filial seçilməlidir");
      }
      assertBranchAllowed(user, branchId);
    }

    const candidate = await this.prisma.candidate.findFirst({
      where: { id: data.candidate_id, ...candidateVisibilityWhere(user) },
    });
    if (!candidate) {
      throw new NotFoundException("Namizəd tapılmadı");
    }
    if (!candidate.is_active) {
      throw new BadRequestException("Deaktiv namizəd qeydiyyata alına bilməz");
    }

    const exam = await this.prisma.exam.findUnique({
      where: { id: data.exam_id },
    });
    if (!exam) {
      throw new NotFoundException("İmtahan tapılmadı");
    }
    if (exam.status === "ARCHIVED") {
      throw new BadRequestException(
        "Arxivlənmiş imtahana qeydiyyat aparıla bilməz",
      );
    }

    if (branchId) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: branchId },
      });
      if (!branch || !branch.isActive) {
        throw new BadRequestException("Filial tapılmadı və ya aktiv deyil");
      }
    }

    const existing = await this.prisma.examinationRegistration.findFirst({
      where: {
        candidate_id: data.candidate_id,
        session_id: data.session_id,
      },
    });

    if (existing && existing.status !== "CANCELLED") {
      throw new ConflictException(
        "Bu namizəd artıq həmin sessiyaya qeydiyyatdan keçib",
      );
    }

    let registrationId: string;

    try {
      registrationId = await this.prisma.$transaction(async (tx) => {
        // Serialize capacity checks for this session.
        await tx.$queryRawUnsafe(
          'SELECT "id" FROM "exam_sessions" WHERE "id" = $1::uuid FOR UPDATE',
          data.session_id,
        );

        const session = await tx.examSession.findUnique({
          where: { id: data.session_id },
        });
        if (!session) {
          throw new NotFoundException("Sessiya tapılmadı");
        }
        if (session.examId !== data.exam_id) {
          throw new BadRequestException("Sessiya seçilmiş imtahana aid deyil");
        }
        if (session.status !== "OPEN") {
          throw new BadRequestException("Sessiya qeydiyyata açıq deyil");
        }

        await tx.$queryRawUnsafe(
          'SELECT "id" FROM "candidates" WHERE "id" = $1::uuid FOR UPDATE',
          data.candidate_id,
        );
        const currentCandidate = await tx.candidate.findFirst({
          where: { id: data.candidate_id, ...candidateVisibilityWhere(user) },
        });
        if (!currentCandidate) throw new NotFoundException("Namizəd tapılmadı");
        if (!currentCandidate.is_active)
          throw new BadRequestException(
            "Deaktiv namizəd qeydiyyata alına bilməz",
          );
        const activeCount = await tx.examinationRegistration.count({
          where: { session_id: data.session_id, status: "ACTIVE" },
        });
        if (activeCount >= session.capacity) {
          throw new ConflictException("Sessiyanın tutumu doludur");
        }

        const current = await tx.examinationRegistration.findFirst({
          where: {
            candidate_id: data.candidate_id,
            session_id: data.session_id,
          },
        });

        if (current) {
          if (current.status !== "CANCELLED") {
            throw new ConflictException(
              "Bu namizəd artıq həmin sessiyaya qeydiyyatdan keçib",
            );
          }
          const reactivated = await tx.examinationRegistration.update({
            where: { id: current.id },
            data: {
              status: "ACTIVE",
              exam_id: data.exam_id,
              branch_id: branchId ?? current.branch_id,
            },
          });
          await this.audit.log(
            "REGISTRATION_CREATED",
            user.userId,
            "ExaminationRegistration",
            reactivated.id,
            {
              candidate_id: data.candidate_id,
              exam_id: data.exam_id,
              session_id: data.session_id,
              branch_id: branchId,
            },
            tx,
          );
          return reactivated.id;
        }

        const created = await tx.examinationRegistration.create({
          data: {
            candidate_id: data.candidate_id,
            exam_id: data.exam_id,
            session_id: data.session_id,
            branch_id: branchId,
            status: "ACTIVE",
          },
        });
        await this.audit.log(
          "REGISTRATION_CREATED",
          user.userId,
          "ExaminationRegistration",
          created.id,
          {
            candidate_id: data.candidate_id,
            exam_id: data.exam_id,
            session_id: data.session_id,
            branch_id: branchId,
          },
          tx,
        );
        return created.id;
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "Bu namizəd artıq həmin sessiyaya qeydiyyatdan keçib",
        );
      }
      throw error;
    }

    const registration = await this.prisma.examinationRegistration.findUnique({
      where: { id: registrationId },
      include: REGISTRATION_INCLUDE,
    });

    if (!registration) {
      throw new NotFoundException("Qeydiyyat tapılmadı");
    }

    return this.mapRegistration(registration);
  }

  async updateStatus(
    id: string,
    status: "ACTIVE" | "CANCELLED",
    user: AuthenticatedUser,
  ) {
    return this.changeStatus(id, status, user, "REGISTRATION_STATUS_CHANGED");
  }

  private async changeStatus(
    id: string,
    status: "ACTIVE" | "CANCELLED",
    user: AuthenticatedUser,
    action: string,
  ) {
    const registration = await this.getAccessibleRegistration(id, user);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "exam_sessions" WHERE "id" = $1::uuid FOR UPDATE',
        registration.session_id,
      );
      const current = await tx.examinationRegistration.findFirst({
        where: { id, ...this.visibilityWhere(user) },
        include: REGISTRATION_INCLUDE,
      });
      if (!current) throw new NotFoundException("Qeydiyyat tapılmadı");
      if (current.status === status) return this.mapRegistration(current);
      if (!(ALLOWED_TRANSITIONS[current.status] ?? []).includes(status)) {
        throw new BadRequestException(
          `Qeydiyyat statusu ${current.status} statusundan ${status} statusuna keçirilə bilməz`,
        );
      }
      if (status === "ACTIVE") {
        const session = await tx.examSession.findUnique({
          where: { id: current.session_id },
        });
        if (!session || session.status !== "OPEN")
          throw new BadRequestException("Sessiya qeydiyyata açıq deyil");
        if (!current.candidate.is_active || current.exam.status === "ARCHIVED")
          throw new BadRequestException(
            "Namizəd və ya imtahan qeydiyyat üçün aktiv deyil",
          );
        const count = await tx.examinationRegistration.count({
          where: { session_id: current.session_id, status: "ACTIVE" },
        });
        if (count >= session.capacity)
          throw new ConflictException("Sessiyanın tutumu doludur");
      }
      const updated = await tx.examinationRegistration.update({
        where: { id },
        data: { status },
        include: REGISTRATION_INCLUDE,
      });
      await this.audit.log(
        action,
        user.userId,
        "ExaminationRegistration",
        id,
        { from: current.status, to: status },
        tx,
      );
      return this.mapRegistration(updated);
    });
  }

  async cancel(id: string, user: AuthenticatedUser) {
    return this.changeStatus(id, "CANCELLED", user, "REGISTRATION_CANCELLED");
  }
}
