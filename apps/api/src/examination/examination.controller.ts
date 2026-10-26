import { CreateExamDto, UpdateExamDto } from "./examination.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser, CENTRAL_ADMIN_ROLES } from "../auth/authorization";
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ExaminationService } from "./examination.service";
import { ExaminationSessionService } from "./examination.session.service";
import { AuthGuard } from "@nestjs/passport";
import { Roles, RolesGuard } from "../auth/guards/roles.guard";
import { BranchGuard } from "../auth/guards/branch.guard";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";

@ApiTags("exams")
@Controller("exams")
export class ExaminationController {
  constructor(
    private examinationService: ExaminationService,
    private examinationSessionService: ExaminationSessionService,
  ) {}

  @Get()
  @UseGuards(AuthGuard("jwt"), RolesGuard, BranchGuard)
  @ApiOperation({ summary: "List examinations with pagination and filters" })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
  })
  @ApiQuery({ name: "search", required: false, type: "string" })
  @ApiResponse({ status: 200, description: "List of examinations" })
  async list(@Query() queries: any) {
    return this.examinationService.findAll(queries);
  }

  @Get(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard, BranchGuard)
  @ApiOperation({ summary: "Get examination details" })
  @ApiResponse({ status: 200, description: "Examination details" })
  @ApiResponse({ status: 404, description: "Examination not found" })
  async details(@Param("id") id: string) {
    return this.examinationService.findOne(id);
  }

  @Roles([...CENTRAL_ADMIN_ROLES])
  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard, BranchGuard)
  @ApiOperation({ summary: "Create a new examination" })
  @ApiResponse({ status: 201, description: "Examination created successfully" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  @ApiResponse({ status: 400, description: "Duplicate examination code" })
  async create(
    @Body() dto: CreateExamDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.examinationService.create({ ...dto, createdBy: user.userId });
  }

  @Roles([...CENTRAL_ADMIN_ROLES])
  @Patch(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard, BranchGuard)
  @ApiOperation({ summary: "Update examination" })
  @ApiResponse({ status: 200, description: "Examination updated successfully" })
  @ApiResponse({ status: 404, description: "Examination not found" })
  async update(@Param("id") id: string, @Body() dto: UpdateExamDto) {
    return this.examinationService.update(id, dto);
  }

  @Roles([...CENTRAL_ADMIN_ROLES])
  @Patch(":id/publish")
  @UseGuards(AuthGuard("jwt"), RolesGuard, BranchGuard)
  @ApiOperation({ summary: "Publish examination" })
  @ApiResponse({
    status: 200,
    description: "Examination published successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Cannot publish non-DRAFT examination",
  })
  @ApiResponse({ status: 404, description: "Examination not found" })
  async publish(
    @Param("id") id: string,
    @Body("publishedBy") publishedBy: string,
  ) {
    return this.examinationService.publish(id, publishedBy);
  }

  @Roles([...CENTRAL_ADMIN_ROLES])
  @Patch(":id/archive")
  @UseGuards(AuthGuard("jwt"), RolesGuard, BranchGuard)
  @ApiOperation({ summary: "Archive examination" })
  @ApiResponse({
    status: 200,
    description: "Examination archived successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Cannot archive non-PUBLISHED examination",
  })
  @ApiResponse({ status: 404, description: "Examination not found" })
  async archive(
    @Param("id") id: string,
    @Body("archivedBy") archivedBy: string,
  ) {
    return this.examinationService.archive(id, archivedBy);
  }
}
