import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateQuestionDto } from "./question.dto";
import { UpdateQuestionDto } from "./question.dto";
import { QuestionQueryDto } from "./question.dto";

@Injectable()
export class QuestionService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: QuestionQueryDto) {
    const where: any = {};

    if (filters.examId) {
      where.examId = filters.examId;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.search) {
      where.question = {
        contains: filters.search,
        mode: "insensitive",
      };
    }

    const questions = await this.prisma.question.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    const total = await this.prisma.question.count({ where });

    return { data: questions, total };
  }

  async findOne(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
    });

    if (!question) {
      throw new NotFoundException("Sual tapılmadı");
    }

    return question;
  }

  async create(data: CreateQuestionDto) {
    // Verify exam exists
    const exam = await this.prisma.exam.findUnique({
      where: { id: data.examId },
    });

    if (!exam) {
      throw new NotFoundException("İmtahan tapılmadı");
    }

    // Validate correct answer index
    const variants = data.variants.split("|");
    if (data.correct < 1 || data.correct > variants.length) {
      throw new BadRequestException(
        `Düzgün cavab nömrəsi 1-#{${variants.length}} aralığı olmalıdır`,
      );
    }

    const question = await this.prisma.question.create({
      data: {
        examId: data.examId,
        question: data.question,
        variants: data.variants,
        correct: data.correct,
        points: data.points,
        isActive: data.isActive,
      },
    });

    return {
      id: question.id,
      examId: question.examId,
      question: question.question,
      variants: question.variants,
      correct: question.correct,
      points: question.points,
      isActive: question.isActive,
      createdAt: question.createdAt,
    };
  }

  async update(id: string, data: UpdateQuestionDto) {
    const question = await this.prisma.question.findUnique({
      where: { id },
    });

    if (!question) {
      throw new NotFoundException("Sual tapılmadı");
    }

    // If updating variants, validate correct answer
    if (data.variants) {
      const variants = data.variants.split("|");
      if (data.correct && (data.correct < 1 || data.correct > variants.length)) {
        throw new BadRequestException(
          `Düzgün cavab nömrəsi 1-#{${variants.length}} aralığı olmalıdır`,
        );
      }
    }

    const updated = await this.prisma.question.update({
      where: { id },
      data: {
        examId: data.examId ?? question.examId,
        question: data.question ?? question.question,
        variants: data.variants ?? question.variants,
        correct: data.correct ?? question.correct,
        points: data.points ?? question.points,
        isActive: data.isActive ?? question.isActive,
      },
    });

    return {
      id: updated.id,
      examId: updated.examId,
      question: updated.question,
      variants: updated.variants,
      correct: updated.correct,
      points: updated.points,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
    };
  }

  async remove(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
    });

    if (!question) {
      throw new NotFoundException("Sual tapılmadı");
    }

    // Soft delete - just set isActive to false
    const updated = await this.prisma.question.update({
      where: { id },
      data: { isActive: false },
    });

    return {
      id: updated.id,
      isActive: updated.isActive,
    };
  }

  async getByExam(examId: string) {
    const questions = await this.prisma.question.findMany({
      where: { examId, isActive: true },
      orderBy: { createdAt: "asc" },
    });

    return questions.map((q) => ({
      id: q.id,
      question: q.question,
      variants: q.variants,
      correct: q.correct,
      points: q.points,
    }));
  }
}
