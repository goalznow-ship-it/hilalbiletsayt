import { Body, Controller, Get, Param, Patch, Post, UseGuards, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/guards/roles.guard";
import { BranchGuard } from "../auth/guards/branch.guard";
import { Roles } from "../auth/guards/roles.guard";
import { AuditService } from "../audit/audit.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/authorization";
import { UserService } from "./user.service";
import { CreateUserDto, UpdateUserDto, PasswordResetDto } from "../dto/create-user.dto";

@ApiTags("users")
@Controller("users")
export class UserController {
  constructor(
    private userService: UserService,
    private auditService: AuditService,
  ) {}

  @UseGuards(AuthGuard("jwt"), RolesGuard, BranchGuard)
  @Roles(["SUPER_ADMIN", "CENTRAL_ADMIN"])
  @Post()
  @ApiOperation({ summary: "Create a new user" })
  @ApiResponse({ status: 201, description: "User created successfully" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  @ApiResponse({ status: 401, description: "Unauthenticated" })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.userService.create(dto, user.userId);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard, BranchGuard)
  @Roles(["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER"])
  @Get()
  @ApiOperation({ summary: "List users with pagination and filters" })
  @ApiQuery({ name: "page", required: false, type: "integer", description: "Page number" })
  @ApiQuery({ name: "limit", required: false, type: "integer", description: "Items per page" })
  @ApiQuery({ name: "status", required: false, enum: ["active", "inactive"] })
  @ApiQuery({ name: "branch", required: false, type: "string" })
  @ApiQuery({ name: "role", required: false, type: "string" })
  @ApiQuery({ name: "search", required: false, type: "string" })
  @ApiResponse({ status: 200, description: "List of users" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  @ApiResponse({ status: 401, description: "Unauthenticated" })
  async list(@Query() queries: any) {
    return this.userService.findAll(queries);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard, BranchGuard)
  @Roles(["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER"])
  @Get(":id")
  @ApiOperation({ summary: "Get user by ID" })
  @ApiResponse({ status: 200, description: "User details" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  @ApiResponse({ status: 404, description: "User not found" })
  @ApiResponse({ status: 401, description: "Unauthenticated" })
  async getOne(@Param("id") id: string) {
    return this.userService.findOne(id);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard, BranchGuard)
  @Roles(["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER"])
  @Patch(":id")
  @ApiOperation({ summary: "Update user" })
  @ApiResponse({ status: 200, description: "User updated successfully" })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  @ApiResponse({ status: 401, description: "Unauthenticated" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.userService.update(id, dto, user.userId);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard, BranchGuard)
  @Roles(["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER"])
  @Patch(":id/status")
  @ApiOperation({ summary: "Activate/deactivate user" })
  @ApiResponse({ status: 200, description: "User status updated" })
  @ApiResponse({ status: 403, description: "Insufficient permissions or cannot deactivate last SUPER_ADMIN" })
  @ApiResponse({ status: 401, description: "Unauthenticated" })
  async updateStatus(
    @Param("id") id: string,
    @Body("isActive") isActive: boolean,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.userService.updateStatus(id, isActive, user.userId);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard, BranchGuard)
  @Roles(["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER"])
  @Patch(":id/branches")
  @ApiOperation({ summary: "Assign branches to user" })
  @ApiResponse({ status: 200, description: "Branches assigned successfully" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  @ApiResponse({ status: 401, description: "Unauthenticated" })
  async assignBranches(
    @Param("id") id: string,
    @Body("branchIds") branchIds: string[],
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.userService.assignBranches(id, branchIds, user.userId);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard, BranchGuard)
  @Roles(["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER"])
  @Patch(":id/roles")
  @ApiOperation({ summary: "Assign roles to user" })
  @ApiResponse({ status: 200, description: "Roles assigned successfully" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  @ApiResponse({ status: 401, description: "Unauthenticated" })
  async assignRoles(
    @Param("id") id: string,
    @Body("roleIds") roleIds: string[],
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.userService.assignRoles(id, roleIds, user.userId);
  }

  @UseGuards(AuthGuard("jwt"), RolesGuard, BranchGuard)
  @Roles(["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER"])
  @Post(":id/password-reset")
  @ApiOperation({ summary: "Reset user password (admin-initiated)" })
  @ApiResponse({ status: 200, description: "Password reset completed" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  @ApiResponse({ status: 401, description: "Unauthenticated" })
  async resetPassword(
    @Param("id") id: string,
    @Body() dto: PasswordResetDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.userService.resetPassword(id, dto.newPassword, user.userId);
  }
}