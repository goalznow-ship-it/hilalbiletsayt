import { Module } from "@nestjs/common";
import { TicketService } from "./ticket.service";
import { TicketController } from "./ticket.controller";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

@Module({
  providers: [TicketService, PrismaService, AuditService],
  controllers: [TicketController],
  exports: [TicketService],
})
export class TicketModule {}