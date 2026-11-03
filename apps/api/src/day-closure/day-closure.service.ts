import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  AuthenticatedUser,
  getBranchIdsForRoles,
  getSalesBranchIds,
  isCentralAdmin,
} from "../auth/authorization";
import { bakuBusinessDate, isIsoDate } from "../common/business-date";
import { rethrowDbError } from "../common/db-errors";
import { CloseDayDto, DayClosureQueryDto } from "./day-closure.dto";

type Row = {
  status: string;
  payment_status: string;
  seller_id: string | null;
  tickets: number;
  amount: number;
};

export type DaySummary = {
  branchId: string;
  businessDate: string;
  ticketCount: number;
  paidCount: number;
  pendingCount: number;
  cancelledCount: number;
  paidAmount: number;
  bySeller: Array<{ sellerId: string | null; tickets: number; paidAmount: number }>;
};

function summarize(branchId: string, businessDate: string, rows: Row[]): DaySummary {
  const live = (row: Row) => row.status === "ACTIVE" || row.status === "USED";
  const sellers = new Map<string | null, { tickets: number; paidAmount: number }>();
  let ticketCount = 0, paidCount = 0, pendingCount = 0, cancelledCount = 0, paidAmount = 0;
  for (const row of rows) {
    ticketCount += row.tickets;
    if (row.status === "CANCELLED") cancelledCount += row.tickets;
    const paid = live(row) && row.payment_status === "PAID";
    if (paid) {
      paidCount += row.tickets;
      paidAmount += row.amount;
    } else if (live(row) && row.payment_status === "PENDING") {
      pendingCount += row.tickets;
    }
    const seller = sellers.get(row.seller_id) ?? { tickets: 0, paidAmount: 0 };
    seller.tickets += row.tickets;
    if (paid) seller.paidAmount += row.amount;
    sellers.set(row.seller_id, seller);
  }
  return {
    branchId, businessDate, ticketCount, paidCount, pendingCount, cancelledCount, paidAmount,
    bySeller: [...sellers].map(([sellerId, value]) => ({ sellerId, ...value })),
  };
}

@Injectable()
export class DayClosureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private resolveDate(date?: string): string {
    const today = bakuBusinessDate();
    const day = date ?? today;
    if (!isIsoDate(day)) throw new BadRequestException("Tarix düzgün deyil");
    if (day > today) throw new BadRequestException("Gələcək tarixi bağlamaq olmaz");
    return day;
  }

  private assertCanClose(user: AuthenticatedUser, branchId: string) {
    if (isCentralAdmin(user)) return;
    if (!getBranchIdsForRoles(user, ["BRANCH_MANAGER"]).includes(branchId))
      throw new ForbiddenException("Bu filialın gününü bağlamaq icazəniz yoxdur");
  }

  private assertCanView(user: AuthenticatedUser, branchId: string) {
    if (isCentralAdmin(user)) return;
    if (!getSalesBranchIds(user).includes(branchId))
      throw new ForbiddenException("Bu filial üçün icazəniz yoxdur");
  }

  private async aggregate(
    client: Prisma.TransactionClient | PrismaService,
    branchId: string,
    day: string,
  ): Promise<DaySummary> {
    const rows = await client.$queryRaw<Row[]>`
      SELECT "status", "paymentStatus" AS payment_status, "seller_id",
             count(*)::int AS tickets, coalesce(sum("price"), 0)::int AS amount
        FROM "tickets"
       WHERE "branch_id" = ${branchId}::uuid
         AND hilal_business_date("registered_at") = ${day}::date
       GROUP BY 1, 2, 3`;
    return summarize(branchId, day, rows);
  }

  async preview(branchId: string, date: string | undefined, user: AuthenticatedUser) {
    this.assertCanView(user, branchId);
    const day = this.resolveDate(date);
    const closure = await this.prisma.businessDayClosure.findUnique({
      where: { branchId_businessDate: { branchId, businessDate: new Date(`${day}T00:00:00Z`) } },
    });
    return { closed: !!closure, closure, summary: await this.aggregate(this.prisma, branchId, day) };
  }

  async close(dto: CloseDayDto, user: AuthenticatedUser) {
    this.assertCanClose(user, dto.branchId);
    const day = this.resolveDate(dto.date);
    const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId }, select: { id: true } });
    if (!branch) throw new NotFoundException("Filial tapılmadı");

    return this.prisma.$transaction(async (tx) => {
      // Exclusive lock: waits for in-flight sales of this branch/day (which
      // hold the shared lock in the ticket trigger) and blocks new ones.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hilal_business_day_lock_key(${dto.branchId}::uuid, ${day}::date))::text`;
      const existing = await tx.businessDayClosure.findUnique({
        where: { branchId_businessDate: { branchId: dto.branchId, businessDate: new Date(`${day}T00:00:00Z`) } },
      });
      if (existing) throw new ConflictException("Bu gün artıq bağlanıb");

      const summary = await this.aggregate(tx, dto.branchId, day);
      const closure = await tx.businessDayClosure.create({
        data: {
          branchId: dto.branchId,
          businessDate: new Date(`${day}T00:00:00Z`),
          closedBy: user.userId,
          ticketCount: summary.ticketCount,
          paidCount: summary.paidCount,
          cancelledCount: summary.cancelledCount,
          paidAmount: summary.paidAmount,
          summary: JSON.parse(JSON.stringify(summary)),
        },
      });
      await this.audit.log("BUSINESS_DAY_CLOSED", user.userId, "BusinessDayClosure", closure.id, {
        branchId: dto.branchId, businessDate: day, ticketCount: summary.ticketCount, paidAmount: summary.paidAmount,
      }, tx);
      return closure;
    }).catch(rethrowDbError);
  }

  async list(query: DayClosureQueryDto, user: AuthenticatedUser) {
    for (const value of [query.from, query.to])
      if (value !== undefined && !isIsoDate(value)) throw new BadRequestException("Tarix düzgün deyil");
    if (query.branchId) this.assertCanView(user, query.branchId);
    const branchFilter = query.branchId
      ? { branchId: query.branchId }
      : isCentralAdmin(user) ? {} : { branchId: { in: getSalesBranchIds(user) } };
    return this.prisma.businessDayClosure.findMany({
      where: {
        ...branchFilter,
        businessDate: {
          ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}),
          ...(query.to ? { lte: new Date(`${query.to}T00:00:00Z`) } : {}),
        },
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        closer: { select: { id: true, fullName: true } },
      },
      orderBy: [{ businessDate: "desc" }, { closedAt: "desc" }],
      take: 200,
    });
  }
}
