import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { DayClosureController } from "./day-closure.controller";
import { DayClosureService } from "./day-closure.service";

@Module({
  imports: [AuditModule],
  controllers: [DayClosureController],
  providers: [DayClosureService],
})
export class DayClosureModule {}
