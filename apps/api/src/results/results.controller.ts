import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles, RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser, CENTRAL_ADMIN_ROLES } from "../auth/authorization";
import { PublicRateGuard } from "../public-sales/public-rate.guard";
import { ResultsService } from "./results.service";
import { ResultLookupDto } from "./results.dto";

@ApiTags("results")
@ApiBearerAuth()
@Controller("results")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get("exams")
  @Roles([...CENTRAL_ADMIN_ROLES, "OMR_OPERATOR"])
  @ApiOperation({ summary: "Result readiness and publication state per exam" })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.results.listExams(user);
  }

  @Post("exams/:examId/publish")
  @Roles(CENTRAL_ADMIN_ROLES)
  @ApiOperation({ summary: "Publish results (requires an empty review queue)" })
  @ApiResponse({ status: 409, description: "Review queue not empty or already published" })
  publish(@Param("examId", ParseUUIDPipe) examId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.results.publish(examId, user);
  }

  @Post("exams/:examId/unpublish")
  @Roles(CENTRAL_ADMIN_ROLES)
  @ApiOperation({ summary: "Hide published results again" })
  unpublish(@Param("examId", ParseUUIDPipe) examId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.results.unpublish(examId, user);
  }
}

@ApiTags("public")
@Controller("public/results")
export class PublicResultsController {
  constructor(private readonly results: ResultsService) {}

  @Post("lookup")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @UseGuards(PublicRateGuard)
  @ApiOperation({ summary: "Candidate result lookup (ticket + candidate number, published only)" })
  @ApiResponse({ status: 404, description: "Uniform response for any mismatch" })
  @ApiResponse({ status: 429, description: "Rate limit (10 lookups/min per IP)" })
  lookup(@Body() dto: ResultLookupDto) {
    return this.results.lookup(dto.ticket, dto.candidateNumber);
  }
}
