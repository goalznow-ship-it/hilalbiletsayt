import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateQuestionDto } from "./question.dto";
import { UpdateQuestionDto } from "./question.dto";
import { QuestionQueryDto } from "./question.dto";
import { RandomQuestionDto } from "./question.dto";
import { Prisma, Question } from "@prisma/client";
import { resolvePagination, toPaginated } from "../common/pagination";

@Injectable()
export class QuestionService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private validateAnswer(variants: string, correct: number) {
    const choices = variants.split("|").map((choice) => choice.trim());
    if (choices.length < 2 || choices.length > 5 || choices.some((choice) => !choice))
      throw new BadRequestException("2–5 boş olmayan cavab variantı daxil edin");
    if (!Number.isInteger(correct) || correct < 1 || correct > choices.length)
      throw new BadRequestException(`Düzgün cavab nömrəsi 1–${choices.length} aralığında olmalıdır`);
  }

  async findAll(filters: QuestionQueryDto) {
    const where: Prisma.QuestionWhereInput = {};
    const { page, limit, skip, take } = resolvePagination(filters);
    if (filters.subject) where.subject = filters.subject;
    if (filters.topic) where.topic = filters.topic;

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
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });

    const total = await this.prisma.question.count({ where });

    return toPaginated(questions, total, page, limit);
  }

  async random(filters: RandomQuestionDto) {
    const questions = await this.prisma.$queryRaw<Question[]>`
      SELECT * FROM "questions"
      WHERE "examId" = ${filters.examId}::uuid AND "isActive" = true
        AND cardinality(string_to_array("variants", '|')) = ${filters.choiceCount}
        AND "correct" BETWEEN 1 AND ${filters.choiceCount}
        AND (${filters.subject ?? null}::text IS NULL OR "subject" = ${filters.subject ?? null})
        AND (${filters.topic ?? null}::text IS NULL OR "topic" = ${filters.topic ?? null})
      ORDER BY random() LIMIT ${filters.count}`;
    if (questions.length < filters.count)
      throw new BadRequestException(`Şərtlərə uyğun yalnız ${questions.length} aktiv sual var.`);
    return questions;
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

  async create(data: CreateQuestionDto, actorId?: string) {
    // Verify exam exists
    const exam = await this.prisma.exam.findUnique({
      where: { id: data.examId },
    });

    if (!exam) {
      throw new NotFoundException("İmtahan tapılmadı");
    }

    // Validate correct answer index
    this.validateAnswer(data.variants, data.correct);

    const question = await this.prisma.$transaction(async (tx) => {
    const created = await tx.question.create({
      data: {
        examId: data.examId,
        question: data.question,
        subject: data.subject,
        topic: data.topic,
        imageUrl: data.imageUrl,
        variants: data.variants,
        correct: data.correct,
        points: data.points,
        isActive: data.isActive,
      },
    });
    await this.audit.log("QUESTION_CREATED", actorId, "Question", created.id, { examId: created.examId }, tx);
    return created;
    });

    return question;
  }

  async update(id: string, data: UpdateQuestionDto, actorId?: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
    });

    if (!question) {
      throw new NotFoundException("Sual tapılmadı");
    }

    // If updating variants, validate correct answer
    this.validateAnswer(data.variants ?? question.variants, data.correct ?? question.correct);
    if (data.examId && !(await this.prisma.exam.findUnique({ where: { id: data.examId } })))
      throw new NotFoundException("İmtahan tapılmadı");

    const updated = await this.prisma.$transaction(async (tx) => {
    const changed = await tx.question.update({
      where: { id },
      data: {
        examId: data.examId ?? question.examId,
        question: data.question ?? question.question,
        subject: data.subject,
        topic: data.topic,
        imageUrl: data.imageUrl,
        variants: data.variants ?? question.variants,
        correct: data.correct ?? question.correct,
        points: data.points ?? question.points,
        isActive: data.isActive ?? question.isActive,
      },
    });
    await this.audit.log("QUESTION_UPDATED", actorId, "Question", id, { fields: Object.keys(data) }, tx);
    return changed;
    });

    return updated;
  }

  async remove(id: string, actorId?: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
    });

    if (!question) {
      throw new NotFoundException("Sual tapılmadı");
    }

    // Soft delete - just set isActive to false
    const updated = await this.prisma.$transaction(async (tx) => {
    const changed = await tx.question.update({
      where: { id },
      data: { isActive: false },
    });
    await this.audit.log("QUESTION_DEACTIVATED", actorId, "Question", id, {}, tx);
    return changed;
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
