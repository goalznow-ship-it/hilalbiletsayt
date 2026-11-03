import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/authorization";
import { verifySignedTicketToken } from "../common/qr-signature";

type ExamResultRow = {
  id: string;
  code: string;
  title: string;
  results_published_at: Date | null;
  completed: number;
  review: number;
  duplicate: number;
  processing: number;
};

// One message for every failed lookup, so responses do not reveal whether a
// ticket exists, the candidate number was wrong or results are unpublished.
const NOT_AVAILABLE = "Nəticə tapılmadı və ya hələ dərc olunmayıb.";

function digest(value: string): Buffer {
  return createHash("sha256").update(value.trim().toUpperCase()).digest();
}

function maskName(name: string | null | undefined): string | null {
  if (!name) return null;
  return name.split(/\s+/).filter(Boolean)
    .map((part) => part[0].toUpperCase() + "*".repeat(Math.max(part.length - 1, 1)))
    .join(" ");
}

@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listExams() {
    const rows = await this.examCounts(this.prisma, null);
    return rows.map((row) => ({
      examId: row.id,
      code: row.code,
      title: row.title,
      publishedAt: row.results_published_at,
      completed: row.completed,
      review: row.review,
      duplicate: row.duplicate,
      processing: row.processing,
    }));
  }

  async publish(examId: string, user: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      // FOR UPDATE conflicts with the FOR SHARE taken by OMR review/processing.
      const locked = await tx.$queryRaw<Array<{ id: string; results_published_at: Date | null }>>`
        SELECT "id", "results_published_at" FROM "exams" WHERE "id" = ${examId}::uuid FOR UPDATE`;
      if (!locked.length) throw new NotFoundException("İmtahan tapılmadı");
      if (locked[0].results_published_at) throw new ConflictException("Nəticələr artıq dərc olunub");
      const [row] = await this.examCounts(tx, examId);
      if (row.review > 0)
        throw new ConflictException(`Yoxlama növbəsində ${row.review} vərəq var; əvvəlcə onları yoxlayın.`);
      if (row.processing > 0)
        throw new ConflictException("Emal olunan yükləmələr var; tamamlanmasını gözləyin.");
      if (row.completed === 0) throw new BadRequestException("Dərc ediləcək nəticə yoxdur.");
      const exam = await tx.exam.update({
        where: { id: examId },
        data: { resultsPublishedAt: new Date(), resultsPublishedBy: user.userId },
        select: { id: true, resultsPublishedAt: true },
      });
      await this.audit.log("RESULTS_PUBLISHED", user.userId, "Exam", examId, { completed: row.completed }, tx);
      return { examId, publishedAt: exam.resultsPublishedAt, completed: row.completed };
    });
  }

  private examCounts(client: Pick<PrismaService, "$queryRaw">, examId: string | null) {
    return client.$queryRaw<ExamResultRow[]>`
      SELECT e."id", e."code", e."title", e."results_published_at",
             count(p."id") FILTER (WHERE p."status" = 'COMPLETED')::int AS completed,
             count(p."id") FILTER (WHERE p."status" = 'REVIEW')::int AS review,
             count(p."id") FILTER (WHERE p."status" = 'DUPLICATE')::int AS duplicate,
             (SELECT count(*)::int FROM "omr_uploads" u2
               WHERE u2."examId" = e."id" AND u2."status" IN ('PENDING', 'PROCESSING')) AS processing
        FROM "exams" e
        LEFT JOIN "omr_uploads" u ON u."examId" = e."id"
        LEFT JOIN "omr_pages" p ON p."uploadId" = u."id"
       WHERE (${examId}::uuid IS NULL OR e."id" = ${examId}::uuid)
       GROUP BY e."id"
       ORDER BY e."createdAt" DESC
       LIMIT 200`;
  }

  async unpublish(examId: string, user: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.exam.updateMany({
        where: { id: examId, resultsPublishedAt: { not: null } },
        data: { resultsPublishedAt: null, resultsPublishedBy: null },
      });
      if (!updated.count) {
        if (!(await tx.exam.findUnique({ where: { id: examId }, select: { id: true } })))
          throw new NotFoundException("İmtahan tapılmadı");
        throw new ConflictException("Nəticələr dərc olunmayıb");
      }
      await this.audit.log("RESULTS_UNPUBLISHED", user.userId, "Exam", examId, {}, tx);
      return { examId, publishedAt: null };
    });
  }

  private async findTicket(reference: string) {
    const value = reference.trim();
    const signed = verifySignedTicketToken(value.split("/").pop() ?? "");
    if (signed) return this.prisma.ticket.findUnique({ where: { qrCode: signed }, include: this.lookupInclude });
    if (/^HK-[A-Z0-9-]{6,60}$/i.test(value))
      return this.prisma.ticket.findUnique({ where: { code: value.toUpperCase() }, include: this.lookupInclude });
    return null;
  }

  private readonly lookupInclude = {
    candidate: { select: { candidate_number: true, full_name: true } },
    exam: { select: { code: true, title: true, resultsPublishedAt: true } },
    omrSheet: { select: { result: { select: { status: true, data: true } } } },
  } as const;

  /** Public, rate-limited result lookup: ticket + candidate number, published only. */
  async lookup(reference: string, candidateNumber: string) {
    const ticket = await this.findTicket(reference);
    // Always compare, even without a ticket, to keep timing uniform.
    const expected = digest(ticket?.candidate?.candidate_number ?? "\u0000");
    const matches = timingSafeEqual(expected, digest(candidateNumber));
    const page = ticket?.omrSheet?.result;
    const data = page?.data && typeof page.data === "object" && !Array.isArray(page.data)
      ? (page.data as Record<string, unknown>) : null;
    if (!ticket || !matches || !ticket.exam.resultsPublishedAt || ticket.status === "CANCELLED" ||
        page?.status !== "COMPLETED" || !data || typeof data.score !== "number" ||
        typeof data.maximumScore !== "number")
      throw new NotFoundException(NOT_AVAILABLE);

    const outcomes = Array.isArray(data.outcomes) ? (data.outcomes as Array<{ outcome?: string }>) : [];
    const count = (name: string) => outcomes.filter((item) => item?.outcome === name).length;
    return {
      examCode: ticket.exam.code,
      examTitle: ticket.exam.title,
      candidateNameMasked: maskName(ticket.candidate?.full_name),
      score: data.score,
      maximumScore: data.maximumScore,
      correct: count("CORRECT"),
      wrong: count("WRONG"),
      blank: count("BLANK"),
      multiple: count("MULTIPLE"),
      publishedAt: ticket.exam.resultsPublishedAt,
    };
  }
}
