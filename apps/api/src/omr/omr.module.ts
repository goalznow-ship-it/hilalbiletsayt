import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { OmrController } from "./omr.controller";
import { OmrService } from "./omr.service";
@Module({ imports: [AuditModule], controllers: [OmrController], providers: [OmrService], exports: [OmrService] })
export class OmrModule {}
