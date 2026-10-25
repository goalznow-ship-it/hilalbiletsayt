import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { BranchModule } from "./branch/branch.module";
import { UserModule } from "./user/user.module";
import { ExaminationModule } from "./examination/examination.module";
import { CandidateModule } from "./candidate/candidate.module";
import { RegistrationModule } from "./registration/registration.module";
import { TicketModule } from "./ticket/ticket.module";
import { validateEnv } from "./config/env.validation";

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: ".env", validate: validateEnv }),
    HealthModule,
    PrismaModule,
    AuthModule,
    BranchModule,
    UserModule,
    ExaminationModule,
    CandidateModule,
    RegistrationModule,
    TicketModule,
  ],
})
export class AppModule {}
