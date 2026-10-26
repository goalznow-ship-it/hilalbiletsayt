import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PublicPurchaseDto } from "./public-sales.dto";
import { isValidQepikPrice } from "../common/money";

@Injectable()
export class PublicSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async catalog() {
    const now = new Date();
    const [exams, branches] = await Promise.all([
      this.prisma.exam.findMany({
        where: {
          status: "PUBLISHED",
          price: { gte: 0 },
          sessions: { some: { status: "OPEN", startsAt: { gt: now } } },
        },
        select: {
          id: true,
          code: true,
          title: true,
          description: true,
          price: true,
          sessions: {
            where: { status: "OPEN", startsAt: { gt: now } },
            orderBy: { startsAt: "asc" },
            select: {
              id: true,
              sessionCode: true,
              startsAt: true,
              endsAt: true,
              venue: true,
              capacity: true,
              _count: {
                select: {
                  tickets: { where: { status: { in: ["ACTIVE", "USED"] } } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.branch.findMany({
        where: { isActive: true },
        select: { id: true, name: true, address: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      exams: exams
        .map((exam) => ({
          ...exam,
          sessions: exam.sessions
            .map(({ _count, ...session }) => ({
              ...session,
              remaining: Math.max(0, session.capacity - _count.tickets),
            }))
            .filter((session) => session.remaining > 0),
        }))
        .filter((exam) => exam.sessions.length > 0),
      branches,
    };
  }

  async purchase(data: PublicPurchaseDto) {
    const phone = data.phone.replace(/^0/, "+994");
    const fullName = data.fullName.trim().replace(/\s+/g, " ");
    const hash = createHash("sha256")
      .update(JSON.stringify([data.sessionId, data.branchId, fullName, phone]))
      .digest("hex");
    // Stable private identifier prevents a new request key from duplicating the same candidate.
    const number =
      "PUB-" +
      createHmac("sha256", process.env.JWT_SECRET!)
        .update(JSON.stringify([fullName.toLocaleLowerCase("az"), phone]))
        .digest("hex");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text",
        data.purchaseKey,
      );
      const prior = await tx.ticket.findUnique({
        where: { purchaseKey: data.purchaseKey },
      });
      if (prior) {
        if (prior.purchaseHash !== hash)
          throw new ConflictException(
            "Bu sifariş açarı başqa məlumatlarla istifadə edilib.",
          );
        return { receiptToken: prior.receiptToken };
      }
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "exam_sessions" WHERE "id" = $1::uuid FOR UPDATE',
        data.sessionId,
      );
      const session = await tx.examSession.findUnique({
        where: { id: data.sessionId },
        include: { exam: true },
      });
      if (
        !session ||
        session.status !== "OPEN" ||
        session.startsAt <= new Date() ||
        session.exam.status !== "PUBLISHED" ||
        !isValidQepikPrice(session.exam.price)
      ) {
        throw new BadRequestException(
          "Seçilmiş imtahan və ya sessiya satış üçün açıq deyil.",
        );
      }
      const branch = await tx.branch.findFirst({
        where: { id: data.branchId, isActive: true },
      });
      if (!branch) throw new BadRequestException("Aktiv filial seçin.");
      const count = await tx.ticket.count({
        where: { sessionId: session.id, status: { in: ["ACTIVE", "USED"] } },
      });
      if (count >= session.capacity)
        throw new ConflictException(
          "Sessiyada boş yer qalmayıb. Başqa sessiya seçin.",
        );
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text",
        JSON.stringify([fullName.toLocaleLowerCase("az"), phone]),
      );
      const knownCandidate = await tx.candidate.findFirst({
        where: { full_name: { equals: fullName, mode: "insensitive" }, phone },
      });
      const candidate =
        knownCandidate ??
        (await tx.candidate.upsert({
          where: { candidate_number: number },
          update: {},
          create: {
            candidate_number: number,
            full_name: fullName,
            phone,
            branch_id: branch.id,
          },
        }));
      if (!candidate.is_active)
        throw new BadRequestException("Sifariş üçün filialla əlaqə saxlayın.");
      if (
        await tx.ticket.findFirst({
          where: {
            candidateId: candidate.id,
            sessionId: session.id,
            status: { in: ["ACTIVE", "USED"] },
          },
        })
      ) {
        throw new ConflictException(
          "Bu namizəd üçün sessiyada artıq bilet var. Saxladığınız bilet keçidindən istifadə edin və ya filialla əlaqə saxlayın.",
        );
      }
      const ticket = await tx.ticket.create({
        data: {
          code: "HK-" + randomBytes(10).toString("hex").toUpperCase(),
          examId: session.examId,
          sessionId: session.id,
          candidateId: candidate.id,
          branchId: branch.id,
          price: session.exam.price!,
          qrCode: randomBytes(32).toString("base64url"),
          paymentStatus: "PENDING",
          paymentMethod: "CASH",
          purchaseKey: data.purchaseKey,
          purchaseHash: hash,
          receiptToken: randomBytes(32).toString("base64url"),
        },
      });
      await this.audit.log(
        "PUBLIC_TICKET_CREATED",
        undefined,
        "Ticket",
        ticket.id,
        { price: ticket.price, branchId: branch.id },
        tx,
      );
      return { receiptToken: ticket.receiptToken };
    });
  }

  async receipt(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new NotFoundException("Bilet tapılmadı.");
    const ticket = await this.prisma.ticket.findUnique({
      where: { receiptToken: token },
      select: {
        code: true,
        price: true,
        status: true,
        paymentStatus: true,
        qrCode: true,
        exam: { select: { title: true, code: true } },
        session: {
          select: {
            sessionCode: true,
            startsAt: true,
            endsAt: true,
            venue: true,
          },
        },
        branch: { select: { name: true, address: true, phone: true } },
        candidate: { select: { full_name: true } },
      },
    });
    if (!ticket) throw new NotFoundException("Bilet tapılmadı.");
    return ticket;
  }
}
