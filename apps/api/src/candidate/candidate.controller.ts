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
import { AuthGuard } from "@nestjs/passport";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { CandidateService } from "./candidate.service";
import {
  CreateCandidateDto,
  UpdateCandidateDto,
  CandidateSearchDto,
} from "./candidate.dto";
import { Roles, RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  AuthenticatedUser,
  CANDIDATE_MANAGER_ROLES,
} from "../auth/authorization";

@ApiTags("candidates")
@ApiBearerAuth()
@Controller("candidates")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles([...CANDIDATE_MANAGER_ROLES])
export class CandidateController {
  constructor(private candidateService: CandidateService) {}

  @Get()
  @ApiOperation({ summary: "List candidates with pagination and search" })
  @ApiResponse({ status: 200, description: "Paginated list of candidates" })
  async list(
    @Query() query: CandidateSearchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.candidateService.findAll(query, user);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get candidate details" })
  @ApiResponse({ status: 200, description: "Candidate details" })
  @ApiResponse({ status: 404, description: "Candidate not found" })
  async details(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.candidateService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: "Create a new candidate" })
  @ApiResponse({ status: 201, description: "Candidate created successfully" })
  @ApiResponse({ status: 409, description: "Duplicate email" })
  async create(
    @Body() dto: CreateCandidateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.candidateService.create(dto, user);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update candidate" })
  @ApiResponse({ status: 200, description: "Candidate updated successfully" })
  @ApiResponse({ status: 404, description: "Candidate not found" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateCandidateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.candidateService.update(id, dto, user);
  }

  @Patch(":id/toggle-active")
  @ApiOperation({ summary: "Toggle candidate active status" })
  @ApiResponse({ status: 200, description: "Candidate status toggled" })
  @ApiResponse({ status: 404, description: "Candidate not found" })
  async toggleActive(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.candidateService.toggleActive(id, user);
  }
}
