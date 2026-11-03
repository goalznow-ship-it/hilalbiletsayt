import { Module } from "@nestjs/common";
import { BootstrapAdminService } from "./bootstrap-admin.service";

@Module({ providers: [BootstrapAdminService] })
export class BootstrapModule {}
