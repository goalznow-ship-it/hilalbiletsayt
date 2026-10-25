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
import { RegistrationService } from "./registration.service";
import {
  CreateRegistrationDto,
  UpdateRegistrationDto,
  RegistrationSearchDto,
} from "./registration.dto";
import { Roles, RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  AuthenticatedUser,
  CANDIDATE_MANAGER_ROLES,
} from "../auth/authorization";

@ApiTags("registrations")
@ApiBearerAuth()
@Controller("registrations")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles([...CANDIDATE_MANAGER_ROLES])
export class RegistrationController {
  constructor(private registrationService: RegistrationService) {}

  @Get()
  @ApiOperation({ summary: "List registrations with pagination and filters" })
  @ApiResponse({ status: 200, description: "Paginated list of registrations" })
  async list(
    @Query() query: RegistrationSearchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.registrationService.findAll(query, user);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get registration details" })
  @ApiResponse({ status: 200, description: "Registration details" })
  @ApiResponse({ status: 404, description: "Registration not found" })
  async details(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.registrationService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: "Register candidate for examination session" })
  @ApiResponse({ status: 201, description: "Registration created successfully" })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 409, description: "Duplicate or session full" })
  async create(
    @Body() dto: CreateRegistrationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.registrationService.create(dto, user);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update registration status" })
  @ApiResponse({ status: 200, description: "Registration updated" })
  @ApiResponse({ status: 400, description: "Invalid status transition" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateRegistrationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.registrationService.updateStatus(id, dto.status, user);
  }

  @Patch(":id/cancel")
  @ApiOperation({ summary: "Cancel registration (preserve history)" })
  @ApiResponse({ status: 200, description: "Registration cancelled" })
  @ApiResponse({ status: 404, description: "Registration not found" })
  async cancel(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.registrationService.cancel(id, user);
  }
}
