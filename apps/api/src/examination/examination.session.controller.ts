import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { ExaminationSessionService } from "./examination.session.service";
import {
  CreateExamSessionDto,
  ExamSessionQueryDto,
  UpdateExamSessionDto,
} from "./examination.session.dto";
import { Roles, RolesGuard } from "../auth/guards/roles.guard";
import { BranchGuard } from "../auth/guards/branch.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  AuthenticatedUser,
  CENTRAL_ADMIN_ROLES,
} from "../auth/authorization";

@ApiTags("exam-sessions")
@Controller("exam-sessions")
@UseGuards(AuthGuard("jwt"), RolesGuard, BranchGuard)
export class ExaminationSessionController {
  constructor(
    private examinationSessionService: ExaminationSessionService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List exam sessions with filters" })
  @ApiQuery({ name: "examId", required: false, type: "string" })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["PLANNED", "OPEN", "CLOSED", "CANCELLED"],
  })
  @ApiResponse({ status: 200, description: "List of exam sessions" })
  async list(@Query() query: ExamSessionQueryDto) {
    return this.examinationSessionService.findAll(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get session details" })
  @ApiResponse({ status: 200, description: "Session details" })
  @ApiResponse({ status: 404, description: "Session not found" })
  async details(@Param("id") id: string) {
    return this.examinationSessionService.findOne(id);
  }

  @Post()
  @Roles([...CENTRAL_ADMIN_ROLES])
  @ApiOperation({ summary: "Create a planned session" })
  @ApiResponse({ status: 201, description: "Session created successfully" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  @ApiResponse({ status: 400, description: "Invalid date range or capacity" })
  async create(
    @Body() dto: CreateExamSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.examinationSessionService.create(dto, user);
  }

  @Patch(":id")
  @Roles([...CENTRAL_ADMIN_ROLES])
  @ApiOperation({ summary: "Update session capacity or lifecycle status" })
  @ApiResponse({ status: 200, description: "Session updated successfully" })
  @ApiResponse({ status: 400, description: "Invalid lifecycle transition" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  @ApiResponse({ status: 404, description: "Session not found" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateExamSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.examinationSessionService.update(id, dto, user);
  }
}
