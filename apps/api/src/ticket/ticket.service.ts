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
import { isTicketValidForEntry } from "./ticket-verification";
import { TicketQueryDto } from "./ticket-query.dto";
import { resolvePagination, toPaginated } from "../common/pagination";
import {
  AuthenticatedUser,
  isCentralAdmin,
  candidateVisibilityWhere,
  getSalesBranchIds,
} from "../auth/authorization";
import { isValidQepikPrice } from "../common/money";
import { rethrowDbError } from "../common/db-errors";
import {
  signTicketToken,
  verifySignedTicketToken,
} from "../common/qr-signature";
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

function mapTicketView(ticket: {
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
  candidate?: {
    id: string;
    candidate_number: string;
    full_name: string;
  } | null;
  branch?: { id: string; name: string; code: string } | null;
  seller?: { id: string; email: string; fullName: string } | null;
}): TicketView {
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
    // Only the signed payload ever leaves the server.
    qrCode: ticket.qrCode ? signTicketToken(ticket.qrCode) : null,
    registeredAt: ticket.registeredAt,
    usedAt: ticket.usedAt,
    usedBy: ticket.usedBy,
    paymentStatus: ticket.paymentStatus,
    paymentMethod: ticket.paymentMethod,
    paymentDate: ticket.paymentDate,
    examCode: ticket.exam.code,
    examTitle: ticket.exam.title,
    sessionCode: ticket.session?.sessionCode ?? null,
    candidateNumber: ticket.candidate?.candidate_number ?? null,
    candidateFullName: ticket.candidate?.full_name ?? null,
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

    // Branch scoping: sellers and managers only see their own branches' sales.
    if (!isCentralAdmin(user)) {
      const branchIds = getSalesBranchIds(user);
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
          candidate: {
            select: { id: true, candidate_number: true, full_name: true },
          },
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
      rows.map((row) =>
        mapTicketView({
          ...row,
          exam: row.exam,
          session: row.session,
          candidate: row.candidate,
          branch: row.branch,
          seller: row.seller,
        }),
      ),
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
        candidate: {
          select: { id: true, candidate_number: true, full_name: true },
        },
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

    const branchIds = getSalesBranchIds(user);
    if (ticket.branchId && branchIds.includes(ticket.branchId)) return;

    // A candidate registered in one of the user's branches may be visible even
    // when the ticket itself is not assigned to that branch.
    if (ticket.candidateId && branchIds.length > 0) {
      const candidateHasAccess =
        await this.prisma.examinationRegistration.count({
          where: {
            candidate_id: ticket.candidateId,
            branch_id: { in: branchIds },
          },
        });
      if (candidateHasAccess > 0) return;
    }

    throw new ForbiddenException("Bu biletə icazəniz yoxdur");
  }

  async generate(data: CreateTicketDto, user: AuthenticatedUser) {
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
          ...candidateVisibilityWhere(user, getSalesBranchIds(user)),
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

    // Determine and authorize the branch. Every staff sale belongs to a branch
    // so that it is covered by branch isolation and by the day closure.
    const salesBranchIds = getSalesBranchIds(user);
    const branchId =
      candidateBranchId ??
      data.branchId ??
      (!isCentralAdmin(user) && salesBranchIds.length === 1
        ? salesBranchIds[0]
        : null);
    if (!branchId) {
      throw new BadRequestException("Satış üçün filial seçin");
    }
    if (!isCentralAdmin(user) && !salesBranchIds.includes(branchId)) {
      throw new ForbiddenException("Bu filial üçün icazəniz yoxdur");
    }
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, isActive: true },
    });
    if (!branch || !branch.isActive) {
      throw new BadRequestException("Filial tapılmadı");
    }

    if (data.paymentDate) {
      throw new BadRequestException(
        "Ödəniş tarixini sistem ödəniş təsdiqlənəndə təyin edir.",
      );
    }

    // Generate an unguessable verification token; the QR payload carries a
    // public verification URL, never candidate data.
    const code = `HK-${crypto.randomBytes(10).toString("hex").toUpperCase()}`;
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
          where: {
            sessionId: data.sessionId,
            status: { in: ["ACTIVE", "USED"] },
          },
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
              status: { in: ["ACTIVE", "USED"] },
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
          paymentDate: null,
        },
        include: {
          exam: { select: { id: true, code: true, title: true } },
          session: { select: { id: true, sessionCode: true } },
          candidate: {
            select: { id: true, candidate_number: true, full_name: true },
          },
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
    }).catch(rethrowDbError);

    const view = mapTicketView(ticket);
    return {
      ...view,
      qrToken: view.qrCode,
      qrPayload: `/tickets/verify/${view.qrCode}`,
    };
  }

  /**
   * Public ticket verification by opaque QR token.
   * Returns only the minimum data needed to admit a ticket holder.
   */
  async verifyByToken(signed: string) {
    // Forged or unsigned codes are rejected without touching the database.
    const token = verifySignedTicketToken(signed);
    if (!token) {
      throw new NotFoundException("Bilet tapılmadı");
    }
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
      valid: isTicketValidForEntry(ticket),
      paymentRequired: ticket.price > 0,
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

  async confirmPayment(ticketId: string, user: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException("Bilet tapılmadı");
    await this.assertTicketAccess(ticket, user);
    if (
      ticket.status !== "ACTIVE" ||
      !["PENDING", "PAID"].includes(ticket.paymentStatus)
    )
      throw new BadRequestException("Bu biletin ödənişi təsdiqlənə bilməz");
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.ticket.updateMany({
        where: { id: ticketId, status: "ACTIVE", paymentStatus: "PENDING" },
        data: {
          paymentStatus: "PAID",
          paymentMethod: "CASH",
          paymentDate: new Date(),
        },
      });
      if (result.count)
        await this.audit.log(
          "TICKET_PAYMENT_CONFIRMED",
          user.userId,
          "Ticket",
          ticketId,
          { price: ticket.price },
          tx,
        );
      return { confirmed: true };
    }).catch(rethrowDbError);
  }

  async useTicket(ticketId: string, user: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException("Bilet tapılmadı");
    }

    await this.assertTicketAccess(ticket, user);
    if (!isTicketValidForEntry(ticket)) {
      if (ticket.status === "USED") {
        throw new ConflictException("Bilet artıq istifadə edilib");
      }
      if (ticket.status !== "ACTIVE") {
        throw new BadRequestException(
          "Bu bilet artıq istifadə edilib və ya ləğv edilib",
        );
      }

      throw new BadRequestException(
        ticket.paymentStatus === "REFUNDED"
          ? "Biletin ödənişi geri qaytarılıb"
          : "Biletin ödənişi təsdiqlənməyib",
      );
    }

    // Mark ticket as used. The conditional update is atomic: of two
    // concurrent scans exactly one sees status ACTIVE.
    const claimed = await this.prisma.ticket.updateMany({
      where: {
        id: ticketId,
        status: "ACTIVE",
        OR: [
          { paymentStatus: "PAID" },
          { price: 0, paymentStatus: { in: ["PENDING", "PAID"] } },
        ],
      },
      data: { status: "USED", usedAt: new Date(), usedBy: user.userId },
    }).catch(rethrowDbError);
    if (!claimed.count)
      throw new ConflictException(
        "Bilet artıq istifadə edilib və ya ləğv olunub",
      );
    await this.audit.log("TICKET_USED", user.userId, "Ticket", ticketId, {
      branchId: ticket.branchId,
    });
    const updated = await this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: {
        exam: { select: { id: true, code: true, title: true } },
        session: { select: { id: true, sessionCode: true } },
        candidate: {
          select: { id: true, candidate_number: true, full_name: true },
        },
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
    return this.prisma.$transaction(async (tx) => {
      // Fetch and validate the ticket inside the transaction with row lock
      // This prevents concurrent cancellations from both seeing ACTIVE status
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "tickets" WHERE "id" = $1::uuid FOR UPDATE',
        ticketId,
      );
      const ticket = await tx.ticket.findUnique({
        where: { id: ticketId },
      });

      if (!ticket) {
        throw new NotFoundException("Bilet tapılmadı");
      }

      // Preserve existing authorization rules
      if (ticket.sellerId !== user.userId && !isCentralAdmin(user)) {
        throw new ForbiddenException("Bilet ləğv edə bilməzsiniz");
      }

      // Check if ticket is ACTIVE (preserves existing behavior)
      // This handles USED/CANCELLED tickets with BadRequestException
      if (ticket.status !== "ACTIVE") {
        throw new BadRequestException("Aktiv bilet yoxdur");
      }

      // Conditional updateMany with status: "ACTIVE" to prevent concurrent cancellation
      const updated = await tx.ticket.updateMany({
        where: { id: ticketId, status: "ACTIVE" },
        data: { status: "CANCELLED" },
      });

      // Defense in depth: if update affects zero records (race condition),
      // throw ConflictException
      if (!updated.count) {
        throw new ConflictException("Bilet statusu dəyişib. Yenidən yoxlayın");
      }

      // Reload the ticket with existing relations
      const updatedTicket = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: {
          exam: { select: { id: true, code: true, title: true } },
          session: { select: { id: true, sessionCode: true } },
          candidate: {
            select: { id: true, candidate_number: true, full_name: true },
          },
          branch: { select: { id: true, name: true, code: true } },
          seller: { select: { id: true, email: true, fullName: true } },
        },
      });

      // Record the audit event before committing the transaction
      // If this fails, the transaction rolls back, undoing the status change
      await this.audit.log(
        "TICKET_CANCELLED",
        user.userId,
        "Ticket",
        updatedTicket.id,
        {
          ticketCode: updatedTicket.code,
          previousStatus: "ACTIVE",
          newStatus: "CANCELLED",
          paymentStatus: updatedTicket.paymentStatus,
          branchId: updatedTicket.branchId,
        },
        tx,
      );

      return {
        ...mapTicketView(updatedTicket),
        cancelled: true,
      };
    }).catch(rethrowDbError);
  }

  /** Entry scan at the exam door: signed QR -> admit exactly once. */
  async scanByQr(scanned: string, user: AuthenticatedUser) {
    // Scanners may deliver the whole verification URL; keep the last segment.
    const signed = scanned.trim().split("/").pop() ?? "";
    const token = verifySignedTicketToken(signed);
    if (!token) {
      throw new BadRequestException("QR kod etibarsızdır və ya saxtadır");
    }
    const ticket = await this.prisma.ticket.findUnique({
      where: { qrCode: token },
      select: { id: true },
    });
    if (!ticket) {
      throw new NotFoundException("Bilet tapılmadı");
    }
    return this.useTicket(ticket.id, user);
  }

  async findByCode(code: string, user: AuthenticatedUser) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { code },
      include: {
        exam: { select: { id: true, code: true, title: true } },
        session: { select: { id: true, sessionCode: true } },
        candidate: {
          select: { id: true, candidate_number: true, full_name: true },
        },
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

  async getUsageStats(filters: TicketQueryDto, user: AuthenticatedUser) {
    const where = {
      ...(filters.examId ? { examId: filters.examId } : {}),
      ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      ...(!isCentralAdmin(user)
        ? {
            branchId: {
              in: filters.branchId
                ? getSalesBranchIds(user).filter((id) => id === filters.branchId)
                : getSalesBranchIds(user),
            },
          }
        : {}),
    };
    return this.prisma.ticket.groupBy({
      by: ["status", "paymentStatus"],
      where,
      _count: { _all: true },
      _sum: { price: true },
    });
  }
}