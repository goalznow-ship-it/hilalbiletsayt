import { Module } from "@nestjs/common";
import { QuestionService } from "./question.service";
import { QuestionController } from "./question.controller";
import { PrismaService } from "../prisma/prisma.service";

@Module({
  providers: [QuestionService, PrismaService],
  controllers: [QuestionController],
  exports: [QuestionService],
})
export class QuestionModule {}
