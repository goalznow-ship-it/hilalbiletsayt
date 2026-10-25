import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateTicketDto } from "./create-ticket.dto";
import { TicketQueryDto } from "./ticket-query.dto";
import { resolvePagination, toPaginated } from "../common/pagination";
import {
  AuthenticatedUser,
  isCentralAdmin,
  assertBranchAllowed,
  candidateVisibilityWhere,
  getBranchIds,
} from "../auth/authorization";
import { isValidQepikPrice } from "../common/money";
import * as crypto from "crypto";

type TicketView = {
  id: string;
  code: string;
  examId: string;
  sessionId: string | null;
  candidateId: string | null;
  branchId: string | null;
  sellerId: string | null;
  price: number;
  status: string;
  type: string;
  qrCode: string | null;
  registeredAt: Date;
  usedAt: Date | null;
  usedBy: string | null;
  paymentStatus: string;
  paymentMethod: string | null;
  paymentDate: Date | null;
  examCode: string;
  examTitle: string;
  sessionCode: string | null;
  candidateNumber: string | null;
  candidateFullName: string | null;
  branchName: string | null;
  branchCode: string | null;
  sellerEmail: string | null;
  sellerFullName: string | null;
};

function mapTicketView(
  ticket: {
    id: string;
    code: string;
    examId: string;
    sessionId: string | null;
    candidateId: string | null;
    branchId: string | null;
    sellerId: string | null;
    price: number;
    status: string;
    type: string;
    qrCode: string | null;
    registeredAt: Date;
    usedAt: Date | null;
    usedBy: string | null;
    paymentStatus: string;
    paymentMethod: string | null;
    paymentDate: Date | null;
    exam: { id: string; code: string; title: string };
    session?: { id: string; sessionCode: string } | null;
    candidate?: { id: string; candidate_number: string; full_name: string } | null;
    branch?: { id: string; name: string; code: string } | null;
    seller?: { id: string; email: string; fullName: string } | null;
  },
): TicketView {
  return {
    id: ticket.id,
    code: ticket.code,
    examId: ticket.examId,
    sessionId: ticket.sessionId,
    candidateId: ticket.candidateId,
    branchId: ticket.branchId,
    sellerId: ticket.sellerId,
    price: ticket.price,
    status: ticket.status,
    type: ticket.type,
    qrCode: ticket.qrCode,
    registeredAt: ticket.registeredAt,
    usedAt: ticket.usedAt,
    usedBy: ticket.usedBy,
    paymentStatus: ticket.paymentStatus,
    paymentMethod: ticket.paymentMethod,
    paymentDate: ticket.paymentDate,
    examCode: ticket.exam.code,
    examTitle: ticket.exam.title,
    sessionCode: ticket.session?.sessionCode ?? null,
    candidateNumber:
      ticket.candidate?.candidate_number ?? null,
    candidateFullName:
      ticket.candidate?.full_name ?? null,
    branchName: ticket.branch?.name ?? null,
    branchCode: ticket.branch?.code ?? null,
    sellerEmail: ticket.seller?.email ?? null,
    sellerFullName: ticket.seller?.fullName ?? null,
  };
}

@Injectable()
export class TicketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(filters: TicketQueryDto, user: AuthenticatedUser) {
    const { page, limit, skip } = resolvePagination(filters);
    const where: any = {};

    if (filters.examId) {
      where.examId = filters.examId;
    }

    if (filters.sessionId) {
      where.sessionId = filters.sessionId;
    }

    if (filters.candidateId) {
      where.candidateId = filters.candidateId;
    }

    if (filters.branchId) {
      where.branchId = filters.branchId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    // Branch scoping: non-central users can only see tickets in their branches
    if (!isCentralAdmin(user)) {
      const branchIds = getBranchIds(user);
      where.OR = [
        { branchId: { in: branchIds } },
        {
          candidate: {
            registrations: {
              some: {
                branch_id: { in: branchIds },
              },
            },
          },
        },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: {
          exam: { select: { id: true, code: true, title: true } },
          session: { select: { id: true, sessionCode: true } },
          candidate: { select: { id: true, candidate_number: true, full_name: true } },
          branch: { select: { id: true, name: true, code: true } },
          seller: { select: { id: true, email: true, fullName: true } },
        },
        orderBy: { registeredAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return toPaginated(
      rows.map((row) => mapTicketView({
        ...row,
        exam: row.exam,
        session: row.session,
        candidate: row.candidate,
        branch: row.branch,
        seller: row.seller,
      })),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        exam: { select: { id: true, code: true, title: true } },
        session: { select: { id: true, sessionCode: true } },
        candidate: { select: { id: true, candidate_number: true, full_name: true } },
        branch: { select: { id: true, name: true, code: true } },
        seller: { select: { id: true, email: true, fullName: true } },
      },
    });

    if (!ticket) {
      throw new NotFoundException("Bilet tapılmadı");
    }

    await this.assertTicketAccess(ticket, user);
    return mapTicketView(ticket);
  }

  private async assertTicketAccess(
    ticket: { branchId: string | null; candidateId: string | null },
    user: AuthenticatedUser,
  ): Promise<void> {
    if (isCentralAdmin(user)) return;

    const branchIds = getBranchIds(user);
    if (ticket.branchId && branchIds.includes(ticket.branchId)) return;

    // A candidate registered in one of the user's branches may be visible even
    // when the ticket itself is not assigned to that branch.
    if (ticket.candidateId && branchIds.length > 0) {
      const candidateHasAccess = await this.prisma.examinationRegistration.count({
        where: {
          candidate_id: ticket.candidateId,
          branch_id: { in: branchIds },
        },
      });
      if (candidateHasAccess > 0) return;
    }

    throw new ForbiddenException("Bu biletə icazəniz yoxdur");
  }

  async generate(
    data: CreateTicketDto,
    user: AuthenticatedUser,
  ) {
    // The server, not the client, decides the sale price.
    const exam = await this.prisma.exam.findUnique({
      where: { id: data.examId },
      select: { id: true, code: true, title: true, price: true, status: true },
    });
    if (!exam) {
      throw new NotFoundException("İmtahan tapılmadı");
    }
    if (exam.status !== "PUBLISHED") {
      throw new BadRequestException("İmtahan satış üçün aktiv deyil");
    }
    if (!isValidQepikPrice(exam.price)) {
      throw new BadRequestException(
        "Bu imtahan üçün bilet qiyməti təyin edilməyib",
      );
    }
    const ticketPrice: number = exam.price;
    if (data.price !== undefined && data.price !== exam.price) {
      throw new BadRequestException(
        "Bilet qiyməti imtahanın müəyyən edilmiş qiyməti ilə uyuşmur",
      );
    }

    // Verify session if provided.
    if (data.sessionId) {
      const session = await this.prisma.examSession.findUnique({
        where: { id: data.sessionId },
        select: { id: true, status: true, examId: true, capacity: true },
      });
      if (!session) {
        throw new NotFoundException("Sessiya tapılmadı");
      }
      if (session.examId !== data.examId) {
        throw new BadRequestException("Sessiya seçilmiş imtahanla uyuşmur");
      }
      if (session.status !== "OPEN") {
        throw new BadRequestException("Sessiya satış üçün açıq deyil");
      }
    }

    // Verify candidate if provided.
    let candidateBranchId: string | null = null;
    if (data.candidateId) {
      const candidate = await this.prisma.candidate.findFirst({
        where: {
          id: data.candidateId,
          ...candidateVisibilityWhere(user),
        },
        select: { id: true, branch_id: true, is_active: true },
      });
      if (!candidate) {
        throw new NotFoundException("Namizəd tapılmadı");
      }
      if (!candidate.is_active) {
        throw new BadRequestException("Namizəd aktiv deyil");
      }
      candidateBranchId = candidate.branch_id;
    }

    // Determine and authorize the branch.
    const branchId = candidateBranchId ?? data.branchId ?? null;
    if (branchId) {
      if (!isCentralAdmin(user)) {
        assertBranchAllowed(user, branchId);
      }
      const branch = await this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true },
      });
      if (!branch) {
        throw new BadRequestException("Filial tapılmadı");
      }
    }

    let paymentDate: Date | null = null;
    if (data.paymentDate) {
      paymentDate = new Date(data.paymentDate);
      if (Number.isNaN(paymentDate.getTime())) {
        throw new BadRequestException("Ödəniş tarixi düzgün deyil");
      }
    }

    // Generate an unguessable verification token; the QR payload carries a
    // public verification URL, never candidate data.
    const code = `HK-${data.examId.slice(0, 8)}-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`;
    const qrCode = crypto.randomBytes(32).toString("base64url");

    const sellerId = user.userId;

    const ticket = await this.prisma.$transaction(async (tx) => {
      if (data.sessionId) {
        // Serialize capacity checks for this session.
        await tx.$queryRawUnsafe(
          'SELECT "id" FROM "exam_sessions" WHERE "id" = $1::uuid FOR UPDATE',
          data.sessionId,
        );

        const session = await tx.examSession.findUnique({
          where: { id: data.sessionId },
          select: { status: true, capacity: true, examId: true },
        });
        if (!session) {
          throw new NotFoundException("Sessiya tapılmadı");
        }
        if (session.status !== "OPEN") {
          throw new BadRequestException("Sessiya satış üçün açıq deyil");
        }
        if (session.examId !== data.examId) {
          throw new BadRequestException("Sessiya seçilmiş imtahanla uyuşmur");
        }

        const activeCount = await tx.ticket.count({
          where: { sessionId: data.sessionId, status: "ACTIVE" },
        });
        if (activeCount >= session.capacity) {
          throw new BadRequestException("Sessiya kapasitəsi doldurulub");
        }
      }

      if (data.candidateId) {
        // Serialize duplicate purchase checks for this candidate.
        await tx.$queryRawUnsafe(
          'SELECT "id" FROM "candidates" WHERE "id" = $1::uuid FOR UPDATE',
          data.candidateId,
        );

        if (data.sessionId) {
          const existing = await tx.ticket.findFirst({
            where: {
              candidateId: data.candidateId,
              sessionId: data.sessionId,
              status: "ACTIVE",
            },
            select: { id: true },
          });
          if (existing) {
            throw new ConflictException(
              "Bu namizəd üçün bu sessiyada bilet artıq yaradılıb",
            );
          }
        }
      }

      const created = await tx.ticket.create({
        data: {
          code,
          examId: data.examId,
          sessionId: data.sessionId || null,
          candidateId: data.candidateId || null,
          branchId,
          sellerId,
          price: ticketPrice,
          type: data.type?.trim() || "STANDARD",
          qrCode,
          status: "ACTIVE",
          paymentStatus: "PENDING",
          paymentMethod: data.paymentMethod ?? null,
          paymentDate,
        },
        include: {
          exam: { select: { id: true, code: true, title: true } },
          session: { select: { id: true, sessionCode: true } },
          candidate: { select: { id: true, candidate_number: true, full_name: true } },
          branch: { select: { id: true, name: true, code: true } },
          seller: { select: { id: true, email: true, fullName: true } },
        },
      });

      await this.audit.log(
        "TICKET_CREATED",
        user.userId,
        "Ticket",
        created.id,
        {
          code,
          exam_id: created.examId,
          session_id: created.sessionId,
          candidate_id: created.candidateId,
          branch_id: created.branchId,
          price: created.price,
          status: created.status,
        },
        tx,
      );

      return created;
    });

    return {
      ...mapTicketView(ticket),
      qrToken: ticket.qrCode,
      qrPayload: `/tickets/verify/${ticket.qrCode}`,
    };
  }

  /**
   * Public ticket verification by opaque QR token.
   * Returns only the minimum data needed to admit a ticket holder.
   */
  async verifyByToken(token: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { qrCode: token },
      include: {
        exam: { select: { code: true, title: true } },
        session: {
          select: { sessionCode: true, startsAt: true, venue: true },
        },
        candidate: { select: { full_name: true } },
      },
    });

    if (!ticket) {
      throw new NotFoundException("Bilet tapılmadı");
    }

    const name = ticket.candidate?.full_name ?? null;
    const maskedName = name
      ? name
          .split(/\s+/)
          .filter(Boolean)
          .map(
            (part) =>
              part[0].toUpperCase() + "*".repeat(Math.max(part.length - 1, 1)),
          )
          .join(" ")
      : null;

    return {
      valid: ticket.status === "ACTIVE",
      code: ticket.code,
      examCode: ticket.exam.code,
      examTitle: ticket.exam.title,
      sessionCode: ticket.session?.sessionCode ?? null,
      startsAt: ticket.session?.startsAt ?? null,
      venue: ticket.session?.venue ?? null,
      status: ticket.status,
      usedAt: ticket.usedAt,
      candidateNameMasked: maskedName,
      paymentStatus: ticket.paymentStatus,
    };
  }

  async useTicket(ticketId: string, userId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException("Bilet tapılmadı");
    }

    if (ticket.status !== "ACTIVE") {
      throw new BadRequestException("Bu bilet artıq employed edilmişdir və ya ləğv edilib");
    }

    // Mark ticket as used
    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: "USED",
        usedAt: new Date(),
        usedBy: userId,
      },
      include: {
        exam: { select: { id: true, code: true, title: true } },
        session: { select: { id: true, sessionCode: true } },
        candidate: { select: { id: true, candidate_number: true, full_name: true } },
        branch: { select: { id: true, name: true, code: true } },
        seller: { select: { id: true, email: true, fullName: true } },
      },
    });

    return {
      ...mapTicketView(updated),
      used: true,
    };
  }

  async cancel(ticketId: string, user: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException("Bilet tapılmadı");
    }

    if (ticket.status !== "ACTIVE") {
      throw new BadRequestException("Aktiv bilet yoxdur");
    }

    // Only seller or central admin can cancel
    if (ticket.sellerId !== user.userId && !isCentralAdmin(user)) {
      throw new ForbiddenException("Bilet ləğv edə bilməzsiniz");
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "CANCELLED" },
      include: {
        exam: { select: { id: true, code: true, title: true } },
        session: { select: { id: true, sessionCode: true } },
        candidate: { select: { id: true, candidate_number: true, full_name: true } },
        branch: { select: { id: true, name: true, code: true } },
        seller: { select: { id: true, email: true, fullName: true } },
      },
    });

    return {
      ...mapTicketView(updated),
      cancelled: true,
    };
  }

  async findByCode(code: string, user: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { code },
      include: {
        exam: { select: { id: true, code: true, title: true } },
        session: { select: { id: true, sessionCode: true } },
        candidate: { select: { id: true, candidate_number: true, full_name: true } },
        branch: { select: { id: true, name: true, code: true } },
        seller: { select: { id: true, email: true, fullName: true } },
      },
    });

    if (!ticket) {
      throw new NotFoundException("Bilet tapılmadı");
    }

    await this.assertTicketAccess(ticket, user);
    return mapTicketView(ticket);
  }

  async getUsageStats(filters?: { examId?: string; sessionId?: string }) {
    const where: any = {};

    if (filters?.examId) {
      where.examId = filters.examId;
    }

    if (filters?.sessionId) {
      where.sessionId = filters.sessionId;
    }

    const [total, used, active] = await Promise.all([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.count({ where: { ...where, status: "USED" } }),
      this.prisma.ticket.count({ where: { ...where, status: "ACTIVE" } }),
    ]);

    return { total, used, active };
  }
}