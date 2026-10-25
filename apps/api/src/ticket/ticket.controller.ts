import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
  Query,
} from "@nestjs/common";
import { TicketService } from "./ticket.service";
import { CreateTicketDto } from "./create-ticket.dto";
import { UpdateTicketDto } from "./update-ticket.dto";
import { TicketQueryDto } from "./ticket-query.dto";
import { AuthenticatedUser } from "../auth/authorization";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";

@ApiTags("ticket")
@Controller("ticket")
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Generate new ticket" })
  @ApiResponse({ status: 201, description: "Ticket successfully generated" })
  @ApiBearerAuth()
  async generate(
    @Body() dto: CreateTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketService.generate(dto, user);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "List tickets with filters" })
  @ApiResponse({ status: 200, description: "List of tickets" })
  @ApiBearerAuth()
  async list(
    @Query() dto: TicketQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketService.findAll(dto, user);
  }

  @Get("code/:code")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Find ticket by code (authenticated staff)" })
  @ApiResponse({ status: 200, description: "Ticket found" })
  @ApiResponse({ status: 401, description: "Authentication required" })
  @ApiResponse({ status: 403, description: "Ticket is outside the user's branch scope" })
  @ApiResponse({ status: 404, description: "Ticket not found" })
  @ApiBearerAuth()
  async findByCode(
    @Param("code") code: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketService.findByCode(code, user);
  }

  @Get("verify/:token")
  @ApiOperation({ summary: "Verify a ticket by its QR token (public)" })
  @ApiResponse({ status: 200, description: "Ticket verification result" })
  @ApiResponse({ status: 404, description: "Ticket not found" })
  async verify(@Param("token") token: string) {
    return this.ticketService.verifyByToken(token);
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get ticket details" })
  @ApiResponse({ status: 200, description: "Ticket details" })
  @ApiBearerAuth()
  async details(
    @Param("id") ticketId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketService.findOne(ticketId, user);
  }

  @Put(":id/use")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Mark ticket as used (scanned)" })
  @ApiResponse({ status: 200, description: "Ticket marked as used" })
  @ApiBearerAuth()
  async use(@Param("id") ticketId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ticketService.useTicket(ticketId, user.userId);
  }

  @Put(":id/cancel")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Cancel ticket" })
  @ApiResponse({ status: 200, description: "Ticket cancelled" })
  @ApiBearerAuth()
  async cancel(
    @Param("id") ticketId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketService.cancel(ticketId, user);
  }

  @Get(":id/stats")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get ticket usage statistics" })
  @ApiResponse({ status: 200, description: "Statistics" })
  @ApiBearerAuth()
  async getStats(
    @Param() params: { examId?: string; sessionId?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketService.getUsageStats({
      examId: params.examId,
      sessionId: params.sessionId,
    });
  }
}