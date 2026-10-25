import { Module } from "@nestjs/common";
import { ExaminationService } from "./examination.service";
import { ExaminationController } from "./examination.controller";
import { ExaminationSessionService } from "./examination.session.service";
import { ExaminationSessionController } from "./examination.session.controller";
import { AuditModule } from "../audit/audit.module";
@Module({
  imports: [AuditModule],
  providers: [
    ExaminationService,
    ExaminationSessionService,
  ],
  controllers: [
    ExaminationController,
    ExaminationSessionController,
  ],
  exports: [
    ExaminationService,
    ExaminationSessionService,
  ],
})
export class ExaminationModule {}
