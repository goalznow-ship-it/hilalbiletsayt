import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PublicRateGuard } from "../public-sales/public-rate.guard";
import { PublicResultsController, ResultsController } from "./results.controller";
import { ResultsService } from "./results.service";

@Module({
  imports: [AuditModule],
  controllers: [ResultsController, PublicResultsController],
  providers: [ResultsService, PublicRateGuard],
})
export class ResultsModule {}
