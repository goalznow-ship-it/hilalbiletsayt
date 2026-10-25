import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { LocalStrategy } from "./local.strategy";
import { PrismaService } from "../prisma/prisma.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import { BranchGuard } from "./guards/branch.guard";
import { AuditModule } from "../audit/audit.module";
import { AuthController } from "./controllers/auth.controller";

@Module({
  imports: [
    PassportModule,
    ConfigModule,
    AuditModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow("JWT_SECRET"),
        signOptions: { expiresIn: "15m" },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LocalStrategy, PrismaService, JwtAuthGuard, RolesGuard, BranchGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard, BranchGuard],
})
export class AuthModule {}
