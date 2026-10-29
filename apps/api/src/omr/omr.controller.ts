import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles, RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/authorization";
import { OmrService, ScanFile } from "./omr.service";

@Controller("omr")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER", "OMR_OPERATOR"])
export class OmrController {
  constructor(private readonly omr: OmrService) {}
  @Post("keys")
  @Roles(["SUPER_ADMIN", "CENTRAL_ADMIN"])
  createKey(@Body() data: unknown, @CurrentUser() user: AuthenticatedUser) { return this.omr.createKey(data, user); }

  @Post("sheets")
  issue(@Body() data: unknown, @CurrentUser() user: AuthenticatedUser) { return this.omr.issue(data, user); }

  @Get("sheets/:id/pdf")
  @Header("Cache-Control", "no-store")
  async pdf(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return new StreamableFile(await this.omr.pdf(id, user), { type: "application/pdf", disposition: 'attachment; filename="answer-sheet.pdf"' });
  }

  @Post("exams/:examId/uploads")
  @UseInterceptors(FilesInterceptor("files", 4, { limits: { files: 4, fields: 0, parts: 4, fileSize: 25 * 1024 * 1024 } }))
  upload(@Param("examId", ParseUUIDPipe) examId: string, @UploadedFiles() files: ScanFile[], @CurrentUser() user: AuthenticatedUser) {
    return this.omr.upload(examId, files, user);
  }

  @Get("uploads/:id")
  @Header("Cache-Control", "no-store")
  get(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) { return this.omr.getUpload(id, user); }

  @Get("uploads/:id/original")
  @Header("Cache-Control", "no-store")
  async original(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    const file = await this.omr.original(id, user);
    return new StreamableFile(file.buffer, { type: file.mime, disposition: 'attachment; filename="original-scan"' });
  }
}
