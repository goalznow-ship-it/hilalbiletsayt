import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles, RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser, CENTRAL_ADMIN_ROLES } from "../auth/authorization";
import { CreateBranchDto, UpdateBranchDto } from "./branch.dto";
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { BranchService } from "./branch.service";

@ApiTags("branches")
@Controller("branches")
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchController {
  constructor(private branchService: BranchService) {}

  @Get()
  @ApiOperation({ summary: "Get all branches" })
  @ApiResponse({ status: 200, description: "List of branches" })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.branchService.findAll(user);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get branch by ID" })
  @ApiResponse({ status: 200, description: "Branch details" })
  async findOne(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.branchService.findOne(id, user);
  }

  @Roles([...CENTRAL_ADMIN_ROLES])
  @Post()
  @ApiOperation({ summary: "Create a new branch" })
  @ApiResponse({ status: 201, description: "Branch created" })
  async create(@Body() data: CreateBranchDto) {
    return this.branchService.create(data);
  }

  @Roles([...CENTRAL_ADMIN_ROLES])
  @Patch(":id")
  @ApiOperation({ summary: "Update a branch" })
  @ApiResponse({ status: 200, description: "Branch updated" })
  async update(@Param("id") id: string, @Body() data: UpdateBranchDto) {
    return this.branchService.update(id, data);
  }
}
