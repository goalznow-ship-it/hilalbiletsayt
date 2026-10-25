import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../auth/authorization";
import type {
  CreateExamSessionDto,
  ExamSessionQueryDto,
  UpdateExamSessionDto,
} from "./examination.session.dto";

const SESSION_TRANSITIONS: Record<string, readonly string[]> = {
  PLANNED: ["OPEN", "CANCELLED"],
  OPEN: ["CLOSED", "CANCELLED"],
  CLOSED: [],
  CANCELLED: [],
};

const STATUS_AUDIT_ACTIONS: Record<string, string> = {
  OPEN: "EXAM_SESSION_OPENED",
  CLOSED: "EXAM_SESSION_CLOSED",
  CANCELLED: "EXAM_SESSION_CANCELLED",
};

type SessionRecord = {
  id: string;
  examId: string;
  sessionCode: string;
  startsAt: Date;
  endsAt: Date;
  venue: string | null;
  capacity: number;
  status: string;
};

function mapSession(session: SessionRecord) {
  return {
    id: session.id,
    examId: session.examId,
    sessionCode: session.sessionCode,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    venue: session.venue,
    capacity: session.capacity,
    status: session.status,
  };
}

function parseDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} düzgün tarix deyil`);
  }
  return date;
}

@Injectable()
export class ExaminationSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(filters?: ExamSessionQueryDto) {
    const where: Prisma.ExamSessionWhereInput = {};

    if (filters?.examId) {
      where.examId = filters.examId;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    const sessions = await this.prisma.examSession.findMany({
      where,
      orderBy: { startsAt: "asc" },
    });

    return sessions.map(mapSession);
  }

  async findOne(id: string) {
    const session = await this.prisma.examSession.findUnique({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException("Sessiya tapılmadı");
    }

    return mapSession(session);
  }

  async create(data: CreateExamSessionDto, user?: AuthenticatedUser) {
    const startsAt = parseDate(data.startsAt, "Başlama vaxtı");
    const endsAt = parseDate(data.endsAt, "Bitiş vaxtı");

    if (startsAt >= endsAt) {
      throw new BadRequestException(
        "Başlama vaxtı bitiş vaxtından əvvəl olmalıdır",
      );
    }

    if (!Number.isInteger(data.capacity) || data.capacity <= 0) {
      throw new BadRequestException("Kapasitet 0-dan böyük olmalıdır");
    }

    const exam = await this.prisma.exam.findUnique({
      where: { id: data.examId },
      select: { id: true },
    });
    if (!exam) {
      throw new NotFoundException("İmtahan tapılmadı");
    }

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.examSession.create({
        data: {
          examId: data.examId,
          sessionCode: data.sessionCode.trim(),
          startsAt,
          endsAt,
          venue: data.venue?.trim() || null,
          capacity: data.capacity,
          status: "PLANNED",
        },
      });

      await this.audit.log(
        "EXAM_SESSION_CREATED",
        user?.userId,
        "ExamSession",
        session.id,
        {
          exam_id: session.examId,
          session_code: session.sessionCode,
          status: session.status,
        },
        tx,
      );

      return mapSession(session);
    });
  }

  async update(
    id: string,
    data: UpdateExamSessionDto,
    user?: AuthenticatedUser,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "exam_sessions" WHERE "id" = ${id}::uuid FOR UPDATE`;

      const session = await tx.examSession.findUnique({
        where: { id },
      });
      if (!session) {
        throw new NotFoundException("Sessiya tapılmadı");
      }

      let nextStatus = session.status;
      if (data.status && data.status !== session.status) {
        const allowedNext = SESSION_TRANSITIONS[session.status] ?? [];
        if (!allowedNext.includes(data.status)) {
          throw new BadRequestException(
            `Sessiya statusu ${session.status} statusundan ${data.status} statusuna keçirilə bilməz`,
          );
        }

        if (data.status === "CANCELLED") {
          const activeCount = await tx.examinationRegistration.count({
            where: { session_id: id, status: "ACTIVE" },
          });
          if (activeCount > 0) {
            throw new BadRequestException(
              "Aktiv qeydiyyatı olan sessiya ləğv edilə bilməz",
            );
          }
        }

        nextStatus = data.status;
      }

      const nextCapacity = data.capacity ?? session.capacity;
      if (!Number.isInteger(nextCapacity) || nextCapacity < 1) {
        throw new BadRequestException("Kapasitet 0-dan böyük olmalıdır");
      }

      if (nextCapacity < session.capacity) {
        const activeCount = await tx.examinationRegistration.count({
          where: { session_id: id, status: "ACTIVE" },
        });
        if (nextCapacity < activeCount) {
          throw new BadRequestException(
            "Kapasitet aktiv qeydiyyat sayından az ola bilməz",
          );
        }
      }

      const updated = await tx.examSession.update({
        where: { id },
        data: { capacity: nextCapacity, status: nextStatus },
      });

      const action =
        session.status !== updated.status
          ? (STATUS_AUDIT_ACTIONS[updated.status] ??
            "EXAM_SESSION_STATUS_CHANGED")
          : "EXAM_SESSION_UPDATED";
      await this.audit.log(
        action,
        user?.userId,
        "ExamSession",
        id,
        {
          from: session.status,
          to: updated.status,
          capacity: updated.capacity,
        },
        tx,
      );
      return updated;
    });
    return mapSession(result);
  }
}
