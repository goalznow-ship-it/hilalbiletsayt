import { PublicSalesController } from "../public-sales/public-sales.controller";
import { PublicSalesService } from "../public-sales/public-sales.service";
import { PublicRateGuard } from "../public-sales/public-rate.guard";
import { Module } from "@nestjs/common";
import { TicketService } from "./ticket.service";
import { TicketController } from "./ticket.controller";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

@Module({
  providers: [
    TicketService,
    PrismaService,
    AuditService,
    PublicSalesService,
    PublicRateGuard,
  ],
  controllers: [TicketController, PublicSalesController],
  exports: [TicketService],
})
export class TicketModule {}
