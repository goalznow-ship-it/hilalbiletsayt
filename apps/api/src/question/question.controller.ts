import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Patch,
  Delete,
  Query,
  UseGuards,
} from "@nestjs/common";
import { QuestionService } from "./question.service";
import { CreateQuestionDto } from "./question.dto";
import { UpdateQuestionDto } from "./question.dto";
import { QuestionQueryDto } from "./question.dto";
import { AuthenticatedUser } from "../auth/authorization";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/guards/roles.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiBearerAuth, ApiOperation, ApiResponse } from "@nestjs/swagger";

@Controller("question")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(["SUPER_ADMIN", "CENTRAL_ADMIN"])
export class QuestionController {
  constructor(private readonly questionService: QuestionService) {}

  @Post()
  @ApiOperation({ summary: "Create a new question for an exam" })
  @ApiResponse({ status: 201, description: "Question successfully created" })
  @ApiBearerAuth()
  async create(
    @Body() dto: CreateQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questionService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: "List questions with filters" })
  @ApiResponse({ status: 200, description: "List of questions" })
  @ApiBearerAuth()
  async list(
    @Query() dto: QuestionQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questionService.findAll(dto);
  }

  @Get("exam/:examId")
  @ApiOperation({ summary: "Get questions for an exam" })
  @ApiResponse({ status: 200, description: "List of questions for exam" })
  @ApiBearerAuth()
  async getByExam(@Param("examId") examId: string) {
    return this.questionService.getByExam(examId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get question by ID" })
  @ApiResponse({ status: 200, description: "Question found" })
  @ApiResponse({ status: 404, description: "Question not found" })
  @ApiBearerAuth()
  async getOne(@Param("id") id: string) {
    return this.questionService.findOne(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a question" })
  @ApiResponse({ status: 200, description: "Question successfully updated" })
  @ApiBearerAuth()
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questionService.update(id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete/soft-delete a question" })
  @ApiResponse({ status: 200, description: "Question successfully deleted" })
  @ApiBearerAuth()
  async remove(@Param("id") id: string) {
    return this.questionService.remove(id);
  }
}
