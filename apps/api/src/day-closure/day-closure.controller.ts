import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles, RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser, TICKET_SELLER_ROLES } from "../auth/authorization";
import { DayClosureService } from "./day-closure.service";
import { CloseDayDto, DayClosureQueryDto, DayPreviewQueryDto } from "./day-closure.dto";

@ApiTags("day-closures")
@ApiBearerAuth()
@Controller("day-closures")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DayClosureController {
  constructor(private readonly closures: DayClosureService) {}

  @Get()
  @Roles(TICKET_SELLER_ROLES)
  @ApiOperation({ summary: "List closed business days (branch-scoped)" })
  list(@Query() query: DayClosureQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.closures.list(query, user);
  }

  @Get("preview")
  @Roles(TICKET_SELLER_ROLES)
  @ApiOperation({ summary: "Totals of a business day before or after closing" })
  preview(@Query() query: DayPreviewQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.closures.preview(query.branchId, query.date, user);
  }

  @Post()
  @Roles(["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER"])
  @ApiOperation({ summary: "Close a branch business day; its sales become read-only" })
  @ApiResponse({ status: 409, description: "Day already closed" })
  close(@Body() dto: CloseDayDto, @CurrentUser() user: AuthenticatedUser) {
    return this.closures.close(dto, user);
  }
}
