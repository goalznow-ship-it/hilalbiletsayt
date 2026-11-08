import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { isValidQepikPrice } from "../common/money";

type ExamWhere = {
  status?: string;
  search?: string;
};

type ExamCreateData = {
  code: string;
  title: string;
  description?: string;
  price?: number | null;
  createdBy: string;
  status?: string;
};

type ExamUpdateData = {
  code?: string;
  title?: string;
  description?: string;
  price?: number | null;
  status?: string;
};

@Injectable()
export class ExaminationService {
  private prisma: any;

  constructor(private readonly prismaService: PrismaService, private readonly audit: AuditService) {
    this.prisma = prismaService;
  }

  async findAll(filters?: ExamWhere) {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.search) {
      where.OR = [
        { code: { contains: filters.search, mode: "insensitive" } },
        { title: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const exams = await this.prisma.exam.findMany({
      where,
      include: {
        _count: { select: { sessions: true } },
        sessions: {
          where: { status: "OPEN", startsAt: { gt: new Date() } },
          include: { _count: { select: { tickets: { where: { status: { in: ["ACTIVE", "USED"] } } } } } },
          orderBy: { startsAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return exams.map((exam: any) => ({
      id: exam.id,
      code: exam.code,
      title: exam.title,
      description: exam.description,
      price: exam.price,
      status: exam.status,
      createdAt: exam.createdAt,
      sessionCount: exam._count.sessions,
      salesNotice: exam.status !== "PUBLISHED" ? "İmtahan dərc edilməyib."
        : !isValidQepikPrice(exam.price) ? "Bilet qiyməti təyin edilməyib."
        : !exam.sessions.length ? "Gələcək sessiya yaradın və satışı açın."
        : !exam.sessions.some((session: any) => session.capacity > session._count.tickets) ? "Açıq sessiyalarda boş yer yoxdur."
        : null,
    }));
  }

  async findOne(id: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        sessions: {
          orderBy: { startsAt: "asc" },
        },
      },
    });

    if (!exam) {
      throw new NotFoundException("Sənəd tapılmadı");
    }

    const sessions = await Promise.all(
      exam.sessions.map(async (s: any) => ({
        id: s.id,
        examId: s.examId,
        sessionCode: s.sessionCode,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        venue: s.venue,
        capacity: s.capacity,
        registered: await this.prisma.ticket.count({
          where: { sessionId: s.id, status: { in: ["ACTIVE", "USED"] } },
        }),
        status: s.status,
      })),
    );

    return {
      id: exam.id,
      code: exam.code,
      title: exam.title,
      description: exam.description,
      price: exam.price,
      status: exam.status,
      createdAt: exam.createdAt,
      updatedAt: exam.updatedAt,
      sessions,
    };
  }

  async create(data: ExamCreateData) {
    if (data.status === "PUBLISHED" && !isValidQepikPrice(data.price))
      throw new BadRequestException("Dərc etmək üçün imtahan qiymətini təyin edin");
    if (
      data.price !== undefined &&
      data.price !== null &&
      !isValidQepikPrice(data.price)
    ) {
      throw new BadRequestException(
        "Qiymət qəpik ilə mənfi olmayan tam ədəd olmalıdır",
      );
    }

    const exam = await this.prisma.exam.findFirst({
      where: { code: data.code },
    });

    if (exam) {
      throw new BadRequestException(
        "Bu sənəd kodu ilə already mövcud bir sənəd var",
      );
    }

    const newExam = await this.prismaService.$transaction(async (tx) => {
    const created = await tx.exam.create({
      data: {
        code: data.code,
        title: data.title,
        description: data.description,
        price: data.price ?? null,
        createdBy: data.createdBy,
        status: data.status ?? "DRAFT",
      },
    });
    await this.audit.log("EXAM_CREATED", data.createdBy, "Exam", created.id, { status: created.status, price: created.price }, tx);
    return created;
    });

    return {
      id: newExam.id,
      code: newExam.code,
      title: newExam.title,
      description: newExam.description,
      price: newExam.price,
      status: newExam.status,
      createdAt: newExam.createdAt,
    };
  }

  async update(id: string, data: ExamUpdateData, actorId?: string) {
    if (
      data.price !== undefined &&
      data.price !== null &&
      !isValidQepikPrice(data.price)
    ) {
      throw new BadRequestException(
        "Qiymət qəpik ilə mənfi olmayan tam ədəd olmalıdır",
      );
    }

    const exam = await this.prisma.exam.findUnique({
      where: { id },
    });

    if (!exam) {
      throw new NotFoundException("Sənəd tapılmadı");
    }

    // If updating code, check for duplicates
    if (data.code && data.code !== exam.code) {
      const existing = await this.prisma.exam.findFirst({
        where: { code: data.code },
      });

      if (existing && existing.id !== id) {
        throw new BadRequestException(
          "Bu sənəd kodu ilə already mövcud bir sənəd var",
        );
      }
    }

    if (
      (data.status ?? exam.status) === "PUBLISHED" &&
      !isValidQepikPrice(data.price === undefined ? exam.price : data.price)
    ) {
      throw new BadRequestException(
        "Dərc etmək üçün imtahan qiymətini təyin edin",
      );
    }

    const updatedExam = await this.prismaService.$transaction(async (tx) => {
    const updated = await tx.exam.update({
      where: { id },
      data: {
        code: data.code !== undefined ? data.code : exam.code,
        title: data.title !== undefined ? data.title : exam.title,
        description:
          data.description !== undefined ? data.description : exam.description,
        price: data.price !== undefined ? data.price : exam.price,
        status: data.status !== undefined ? data.status : exam.status,
      },
    });
    const action = updated.status !== exam.status ? `EXAM_${updated.status}` : "EXAM_UPDATED";
    await this.audit.log(action, actorId, "Exam", id, { from: exam.status, to: updated.status, fields: Object.keys(data) }, tx);
    return updated;
    });

    return {
      id: updatedExam.id,
      code: updatedExam.code,
      title: updatedExam.title,
      description: updatedExam.description,
      price: updatedExam.price,
      status: updatedExam.status,
      createdAt: updatedExam.createdAt,
      updatedAt: updatedExam.updatedAt,
    };
  }

  async publish(id: string, _publishedBy: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
    });

    if (!exam) {
      throw new NotFoundException("Sənəd tapılmadı");
    }

    if (exam.status !== "DRAFT") {
      throw new BadRequestException("Sənəd DRAFT statusunda olmalıdır");
    }

    if (!isValidQepikPrice(exam.price))
      throw new BadRequestException(
        "Dərc etmək üçün imtahan qiymətini təyin edin",
      );

    const updatedExam = await this.update(id, { status: "PUBLISHED" }, _publishedBy);

    return {
      id: updatedExam.id,
      code: updatedExam.code,
      title: updatedExam.title,
      status: updatedExam.status,
    };
  }

  async archive(id: string, _archivedBy: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
    });

    if (!exam) {
      throw new NotFoundException("Sənəd tapılmadı");
    }

    if (exam.status !== "PUBLISHED") {
      throw new BadRequestException(
        "Yalnız PUBLISHED sənəd arxivləşdirilə bilər",
      );
    }

    const updatedExam = await this.update(id, { status: "ARCHIVED" }, _archivedBy);

    return {
      id: updatedExam.id,
      code: updatedExam.code,
      title: updatedExam.title,
      status: updatedExam.status,
    };
  }

  async remove(id: string, actorId: string) {
    return this.prismaService.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "exams" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const exam = await tx.exam.findUnique({ where: { id }, include: { _count: { select: {
        sessions: true, tickets: true, registrations: true, questions: true, omrKeys: true, omrUploads: true,
      } } } });
      if (!exam) throw new NotFoundException("Sənəd tapılmadı");
      if (exam.status !== "DRAFT" || Object.values(exam._count).some(Boolean))
        throw new ConflictException("Yalnız əlaqəli məlumatı olmayan qaralama silinə bilər. İmtahanı arxivləşdirin.");
      await tx.exam.delete({ where: { id } });
      await this.audit.log("EXAM_DELETED", actorId, "Exam", id, { code: exam.code }, tx);
      return { deleted: true };
    });
  }
}
