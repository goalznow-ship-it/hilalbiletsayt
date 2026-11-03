import { Module } from "@nestjs/common";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
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
import { QuestionModule } from "./question/question.module";
import { validateEnv } from "./config/env.validation";
import { OmrModule } from "./omr/omr.module";
import { DayClosureModule } from "./day-closure/day-closure.module";
import { ResultsModule } from "./results/results.module";
import { BootstrapModule } from "./bootstrap/bootstrap.module";

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
    QuestionModule,
    OmrModule,
    DayClosureModule,
    ResultsModule,
    BootstrapModule,
    // Per-IP limit for all API routes. Branch offices behind one NAT address
    // share it, so production deployments usually raise it (see .env.example).
    ThrottlerModule.forRoot([
      { ttl: 60000, limit: Number(process.env.API_RATE_LIMIT_PER_MINUTE ?? 60) || 60 },
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
