import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
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

  @Get("keys")
  keys(@Query("examId", ParseUUIDPipe) examId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.omr.listKeys(examId, user);
  }

  @Get("exams/:examId/uploads")
  uploads(@Param("examId", ParseUUIDPipe) examId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.omr.listUploads(examId, user);
  }

  @Get("exams/:examId/results.csv")
  @Header("Cache-Control", "no-store")
  async csv(@Param("examId", ParseUUIDPipe) examId: string, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.omr.exportCsv(examId, user);
    return new StreamableFile(data, { type: "text/csv; charset=utf-8",
      disposition: 'attachment; filename="omr-results.csv"' });
  }

  @Get("exams/:examId/results.pdf")
  @Header("Cache-Control", "no-store")
  async resultsPdf(@Param("examId", ParseUUIDPipe) examId: string, @CurrentUser() user: AuthenticatedUser) {
    return new StreamableFile(await this.omr.exportPdf(examId, user), { type: "application/pdf",
      disposition: 'attachment; filename="omr-results.pdf"' });
  }

  @Get("exams/:examId/results.xlsx")
  @Header("Cache-Control", "no-store")
  async xlsx(@Param("examId", ParseUUIDPipe) examId: string, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.omr.exportXlsx(examId, user);
    return new StreamableFile(data, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      disposition: 'attachment; filename="omr-results.xlsx"' });
  }

  @Patch("uploads/:uploadId/pages/:pageId/review")
  @Roles(["SUPER_ADMIN", "CENTRAL_ADMIN", "BRANCH_MANAGER", "OMR_OPERATOR"])
  review(@Param("uploadId", ParseUUIDPipe) uploadId: string,
    @Param("pageId", ParseUUIDPipe) pageId: string,
    @Body() data: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.omr.reviewPage(uploadId, pageId, data, user);
  }

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
