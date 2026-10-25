import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type ExamWhere = {
  status?: string;
  search?: string;
};

type ExamCreateData = {
  code: string;
  title: string;
  description?: string;
  createdBy: string;
};

type ExamUpdateData = {
  code?: string;
  title?: string;
  description?: string;
  status?: string;
};

@Injectable()
export class ExaminationService {
  private prisma: any;

  constructor(private readonly prismaService: PrismaService) {
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
        sessions: {
          take: 1,
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
      status: exam.status,
      createdAt: exam.createdAt,
      sessionCount: exam.sessions.length,
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

    return {
      id: exam.id,
      code: exam.code,
      title: exam.title,
      description: exam.description,
      status: exam.status,
      createdAt: exam.createdAt,
      updatedAt: exam.updatedAt,
      sessions: exam.sessions.map((s: any) => ({
        id: s.id,
        examId: s.examId,
        sessionCode: s.sessionCode,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        venue: s.venue,
        capacity: s.capacity,
        status: s.status,
      })),
    };
  }

  async create(data: ExamCreateData) {
    const exam = await this.prisma.exam.findFirst({
      where: { code: data.code },
    });

    if (exam) {
      throw new BadRequestException("Bu sənəd kodu ilə already mövcud bir sənəd var");
    }

    const newExam = await this.prisma.exam.create({
      data: {
        code: data.code,
        title: data.title,
        description: data.description,
        createdBy: data.createdBy,
        status: "DRAFT",
      },
    });

    return {
      id: newExam.id,
      code: newExam.code,
      title: newExam.title,
      description: newExam.description,
      status: newExam.status,
      createdAt: newExam.createdAt,
    };
  }

  async update(id: string, data: ExamUpdateData) {
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
        throw new BadRequestException("Bu sənəd kodu ilə already mövcud bir sənəd var");
      }
    }

    const updatedExam = await this.prisma.exam.update({
      where: { id },
      data: {
        code: data.code !== undefined ? data.code : exam.code,
        title: data.title !== undefined ? data.title : exam.title,
        description: data.description !== undefined ? data.description : exam.description,
        status: data.status !== undefined ? data.status : exam.status,
      },
    });

    return {
      id: updatedExam.id,
      code: updatedExam.code,
      title: updatedExam.title,
      description: updatedExam.description,
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

    const updatedExam = await this.prisma.exam.update({
      where: { id },
      data: { status: "PUBLISHED" },
    });

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
      throw new BadRequestException("Yalnız PUBLISHED sənəd arxivləşdirilə bilər");
    }

    const updatedExam = await this.prisma.exam.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });

    return {
      id: updatedExam.id,
      code: updatedExam.code,
      title: updatedExam.title,
      status: updatedExam.status,
    };
  }
}
