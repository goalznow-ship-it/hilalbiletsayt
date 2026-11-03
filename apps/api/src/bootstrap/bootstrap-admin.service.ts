import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { bootstrapAdmin } from "./bootstrap-admin";

@Injectable()
export class BootstrapAdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    const outcome = await bootstrapAdmin(this.prisma, {
      email: process.env.BOOTSTRAP_ADMIN_EMAIL,
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
      fullName: process.env.BOOTSTRAP_ADMIN_NAME,
      branchCode: process.env.BOOTSTRAP_BRANCH_CODE,
      branchName: process.env.BOOTSTRAP_BRANCH_NAME,
    });
    if (outcome === "created")
      this.logger.warn("First SUPER_ADMIN created from BOOTSTRAP_ADMIN_*; remove BOOTSTRAP_ADMIN_PASSWORD from the environment.");
    else if (outcome === "skipped-email-taken")
      this.logger.warn("BOOTSTRAP_ADMIN_EMAIL belongs to an existing non-admin user; no admin was created.");
  }
}
