import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser, isCentralAdmin } from "../auth/authorization";
import { issueSchema, keySchema, reviewSchema, pageSchema, KeyAnswer, Rules, ReadPage, scorePage, workerResultSchema } from "./omr.contract";
import { omrXlsx } from "./omr.xlsx";
import { omrResultsPdf } from "./omr.pdf";

export type ScanFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
const mimeExtensions: Record<string, string> = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg" };

@Injectable()
export class OmrService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private branchAllowed(user: AuthenticatedUser, id: string) {
    if (isCentralAdmin(user)) return true;
    return user.userBranchRoles
      ? user.userBranchRoles.some(b => b.branchId === id && ["BRANCH_MANAGER", "OMR_OPERATOR"].includes(b.role))
      : (user.roles ?? []).some(r => ["BRANCH_MANAGER", "OMR_OPERATOR"].includes(r)) && user.branches?.some(b => b.id === id);
  }

  private assertBranch(user: AuthenticatedUser, id: string | null) {
    if (!id || !this.branchAllowed(user, id)) throw new ForbiddenException("Bu filial üçün OMR icazəniz yoxdur.");
  }

  private storage() {
    if (process.env.NODE_ENV === "production" && !process.env.OMR_STORAGE_DIR)
      throw new ServiceUnavailableException("OMR_STORAGE_DIR konfiqurasiyası tələb olunur.");
    return resolve(process.env.OMR_STORAGE_DIR ?? "var/omr");
  }

  private async worker(path: string, body: BodyInit, headers?: Record<string, string>) {
    const secret = process.env.OMR_WORKER_SECRET;
    if (!secret || secret.length < 32) throw new ServiceUnavailableException("OMR worker konfiqurasiyası tamamlanmayıb.");
    try {
      const response = await fetch(`${process.env.OMR_WORKER_URL ?? "http://127.0.0.1:8000"}/api/omr/${path}`, {
        method: "POST", headers: { Authorization: `Bearer ${secret}`, ...headers }, body,
        signal: AbortSignal.timeout(110_000),
      });
      if (!response.ok) throw new Error("Worker rejected processing");
      return response;
    } catch {
      throw new ServiceUnavailableException("OMR emalı tamamlanmadı. Fayl saxlanılıb; yenidən cəhd edin.");
    }
  }

  async createKey(input: unknown, user: AuthenticatedUser) {
    if (!isCentralAdmin(user)) throw new ForbiddenException();
    const parsed = keySchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException("Cavab açarı və bal qaydalarını yoxlayın.");
    const data = parsed.data;
    if (data.templateVersionId)
      throw new BadRequestException("Bu versiyada ayrıca şablon ID-si dəstəklənmir; hilal-a4-v1 istifadə olunur.");
    return this.prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text", `omr-key:${data.examId}:${data.variant}`);
      const questions = await tx.question.findMany({ where: { id: { in: data.questionIds }, examId: data.examId, isActive: true } });
      if (questions.length !== data.questionIds.length) throw new BadRequestException("Suallar seçilmiş imtahana aid deyil və ya aktiv deyil.");
      const answers: KeyAnswer[] = data.questionIds.map(id => {
        const q = questions.find(q => q.id === id)!;
        if (q.correct < 1 || q.correct > data.choiceCount || q.variants.split("|").length !== data.choiceCount || q.points < 1 || q.points > 1000)
          throw new BadRequestException("Sualın variantları, düzgün cavabı və ya balı uyğun deyil.");
        return { questionId: id, correct: "ABCDE"[q.correct - 1], points: q.points };
      });
      const last = await tx.omrAnswerKey.aggregate({ where: { examId: data.examId, variant: data.variant }, _max: { version: true } });
      const digest = createHash("sha256").update(JSON.stringify([data.examId, data.variant, data.choiceCount, answers, data.scoring])).digest("hex");
      const key = await tx.omrAnswerKey.create({ data: { examId: data.examId, variant: data.variant,
        version: (last._max.version ?? 0) + 1, choiceCount: data.choiceCount, answers: json(answers), scoring: json(data.scoring), digest } });
      await this.audit.log("OMR_KEY_CREATED", user.userId, "OmrAnswerKey", key.id, { version: key.version, examId: key.examId }, tx);
      return key;
    });
  }

  async issue(input: unknown, user: AuthenticatedUser) {
    const parsed = issueSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException("Bilet və cavab açarı ID-lərini yoxlayın.");
    return this.prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "tickets" WHERE "id" = $1::uuid FOR UPDATE', parsed.data.ticketId);
      const ticket = await tx.ticket.findUnique({ where: { id: parsed.data.ticketId } });
      if (!ticket) throw new NotFoundException("Bilet tapılmadı.");
      this.assertBranch(user, ticket.branchId);
      if (!ticket.candidateId || ticket.status === "CANCELLED" || (ticket.price > 0 && ticket.paymentStatus !== "PAID"))
        throw new BadRequestException("Cavab vərəqi üçün namizədli, ödənişi təsdiqlənmiş bilet tələb olunur.");
      const key = await tx.omrAnswerKey.findUnique({ where: { id: parsed.data.answerKeyId } });
      if (!key || key.examId !== ticket.examId) throw new BadRequestException("Cavab açarı biletin imtahanına aid deyil.");
      const existing = await tx.omrSheet.findUnique({ where: { ticketId: ticket.id } });
      if (existing) {
        if (existing.answerKeyId !== key.id) throw new ConflictException("Bilet üçün başqa cavab açarı ilə vərəq artıq verilib.");
        return { id: existing.id, templateVersion: existing.templateVersion };
      }
      const sheet = await tx.omrSheet.create({ data: { token: randomBytes(32).toString("base64url"),
        ticketId: ticket.id, answerKeyId: key.id, candidateId: ticket.candidateId, examId: ticket.examId, branchId: ticket.branchId! } });
      await this.audit.log("OMR_SHEET_ISSUED", user.userId, "OmrSheet", sheet.id, { ticketId: ticket.id, answerKeyId: key.id }, tx);
      return { id: sheet.id, templateVersion: sheet.templateVersion };
    });
  }

  async pdf(id: string, user: AuthenticatedUser) {
    const sheet = await this.prisma.omrSheet.findUnique({ where: { id }, include: {
      answerKey: true, ticket: { include: { candidate: true, exam: true } },
    } });
    if (!sheet) throw new NotFoundException();
    this.assertBranch(user, sheet.ticket.branchId);
    if (sheet.candidateId !== sheet.ticket.candidateId || sheet.examId !== sheet.ticket.examId || sheet.branchId !== sheet.ticket.branchId || sheet.ticket.status === "CANCELLED")
      throw new ConflictException("Vərəqin bilet məlumatları dəyişib; yoxlama tələb olunur.");
    const response = await this.worker("sheets", JSON.stringify({ token: sheet.token,
      questionCount: (sheet.answerKey.answers as KeyAnswer[]).length, choiceCount: sheet.answerKey.choiceCount,
      exam: sheet.ticket.exam.code, variant: sheet.answerKey.variant,
      ticket: sheet.ticket.code, candidate: sheet.ticket.candidate!.candidate_number }), { "Content-Type": "application/json" });
    return Buffer.from(await response.arrayBuffer());
  }

  async getUpload(id: string, user: AuthenticatedUser) {
    const upload = await this.prisma.omrUpload.findUnique({
      where: { id },
      include: { pages: {
        orderBy: { pageIndex: "asc" },
        include: { sheet: { select: { branchId: true } } },
      } },
    });
    if (!upload) throw new NotFoundException();
    if (!isCentralAdmin(user)) {
      if (upload.createdBy !== user.userId) throw new ForbiddenException();
      // Fail closed if a scan is not attributable to an authorized branch.
      if (upload.pages.length === 0 || upload.pages.some(page =>
        !page.sheet || !this.branchAllowed(user, page.sheet.branchId)
      )) throw new ForbiddenException("Bu yükləmənin filialına icazəniz yoxdur.");
    }
    // Do not change the existing response shape by returning sheet metadata.
    return { ...upload, pages: upload.pages.map(({ sheet, ...page }) => page) };
  }

  async listKeys(examId: string, user: AuthenticatedUser) {
    // Answer contents are intentionally not exposed to branch users.
    const exam = await this.prisma.exam.findUnique({ where: { id: examId }, select: { id: true } });
    if (!exam) throw new NotFoundException("İmtahan tapılmadı.");
    if (!isCentralAdmin(user) && !(user.branches ?? []).some(b => this.branchAllowed(user, b.id)))
      throw new ForbiddenException();
    const keys = await this.prisma.omrAnswerKey.findMany({
      where: { examId }, orderBy: [{ variant: "asc" }, { version: "desc" }],
      select: { id: true, examId: true, variant: true, version: true, choiceCount: true,
        createdAt: true, answers: true },
      take: 100,
    });
    return keys.map(key => ({
      id: key.id, examId: key.examId, variant: key.variant,
      version: key.version, choiceCount: key.choiceCount, createdAt: key.createdAt,
      questionCount: Array.isArray(key.answers) ? key.answers.length : 0,
    }));
  }

  async listUploads(examId: string, user: AuthenticatedUser) {
    if (!await this.prisma.exam.findUnique({ where: { id: examId }, select: { id: true } }))
      throw new NotFoundException("İmtahan tapılmadı.");
    const candidateBranchIds = user.userBranchRoles
      ? user.userBranchRoles.map(entry => entry.branchId)
      : (user.branches ?? []).map(branch => branch.id);
    const allowedBranchIds = [...new Set(candidateBranchIds.filter(id => this.branchAllowed(user, id)))];
    const uploads = await this.prisma.omrUpload.findMany({
      where: { examId, ...(isCentralAdmin(user) ? {} : {
        createdBy: user.userId,
        // The upload must have only pages belonging to currently allowed branches.
        pages: {
          some: { sheet: { is: { branchId: { in: allowedBranchIds } } } },
          every: { sheet: { is: { branchId: { in: allowedBranchIds } } } },
        },
      }) },
      select: { id: true, examId: true, status: true, createdAt: true, updatedAt: true,
        error: true, _count: { select: { pages: true } } },
      orderBy: { createdAt: "desc" }, take: 100,
    });
    return uploads.map(({ _count, ...row }) => ({ ...row, pageCount: _count.pages }));
  }

  private async resultRows(examId: string, user: AuthenticatedUser): Promise<Array<Array<string | number>>> {
    if (!await this.prisma.exam.findUnique({ where: { id: examId }, select: { id: true } }))
      throw new NotFoundException("İmtahan tapılmadı.");
    const pages = await this.prisma.omrPage.findMany({
      where: { upload: { examId, ...(isCentralAdmin(user) ? {} : { createdBy: user.userId }) },
        sheetId: { not: null }, status: "COMPLETED" },
      include: { upload: { select: { createdBy: true } },
        sheet: { select: { branchId: true, ticketId: true, candidateId: true,
          answerKey: { select: { variant: true } } } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 5000,
    });
    const rows: Array<Array<string | number>> = [["page_id", "upload_id", "ticket_id", "candidate_id", "branch_id",
      "variant", "score", "maximum_score", "status"]];
    for (const page of pages) {
      if (!page.sheet || !this.branchAllowed(user, page.sheet.branchId)) continue;
      const data = page.data && typeof page.data === "object" && !Array.isArray(page.data)
        ? page.data as Record<string, unknown> : {};
      if (typeof data.score !== "number" || typeof data.maximumScore !== "number") continue;
      rows.push([page.id, page.uploadId, page.sheet.ticketId, page.sheet.candidateId,
        page.sheet.branchId, page.sheet.answerKey.variant, data.score,
        data.maximumScore, page.status]);
    }
    return rows;
  }

  async exportCsv(examId: string, user: AuthenticatedUser): Promise<Buffer> {
    const rows = await this.resultRows(examId, user);
    const csvField = (value: string | number): string => {
      const str = String(value);
      // Excel formula injection defense.
      const safe = /^[=+\-@\t\r]/.test(str) ? "'" + str : str;
      return '"' + safe.replace(/"/g, '""') + '"';
    };
    return Buffer.from("\uFEFF" + rows.map(row => row.map(csvField).join(",")).join("\r\n") + "\r\n", "utf8");
  }

  async exportXlsx(examId: string, user: AuthenticatedUser): Promise<Buffer> {
    return omrXlsx(await this.resultRows(examId, user));
  }

  async exportPdf(examId: string, user: AuthenticatedUser): Promise<Buffer> {
    return omrResultsPdf(await this.resultRows(examId, user));
  }

  async reviewPage(uploadId: string, pageId: string, input: unknown, user: AuthenticatedUser) {
    const parsed = reviewSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException("Düzəliş və izah məlumatları düzgün deyil.");
    return this.prisma.$transaction(async tx => {
      // Locks ensure concurrent reviewers cannot both finalize the same page.
      await tx.$queryRaw`SELECT "id" FROM "omr_pages" WHERE "id" = ${pageId}::uuid FOR UPDATE`;
      const page = await tx.omrPage.findUnique({ where: { id: pageId }, include: {
        upload: true, sheet: { include: { answerKey: true, ticket: true } },
      } });
      if (!page || page.uploadId !== uploadId) throw new NotFoundException("Səhifə tapılmadı.");
      if (!isCentralAdmin(user) && page.upload.createdBy !== user.userId)
        throw new ForbiddenException("Yalnız öz yükləmələrinizi yoxlaya bilərsiniz.");
      if (page.status !== "REVIEW" || page.upload.status !== "REVIEW")
        throw new ConflictException("Bu səhifə artıq yoxlanılıb və ya emal vəziyyəti dəyişib.");
      const sheet = page.sheet;
      if (!sheet) throw new ConflictException("Vərəqin QR identifikatoru təsdiqlənməyib. Avtomatik finalizasiya qadağandır.");
      this.assertBranch(user, sheet.branchId);
      if (sheet.examId !== page.upload.examId || sheet.examId !== sheet.ticket.examId ||
          sheet.candidateId !== sheet.ticket.candidateId || sheet.branchId !== sheet.ticket.branchId ||
          sheet.answerKey.examId !== sheet.examId || sheet.ticket.status === "CANCELLED" ||
          (sheet.ticket.price > 0 && sheet.ticket.paymentStatus !== "PAID"))
        throw new ConflictException("Bilet və namizəd məlumatları dəyişib.");
      const raw = page.data;
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new ConflictException("Tanınma məlumatları mövcud deyil.");
      const saved = raw as Record<string, unknown>;
      if (!Array.isArray(saved.answers)) throw new ConflictException("Cavablar mövcud deyil.");
      const initial = pageSchema.safeParse({ ...saved, pageIndex: page.pageIndex, sheetToken: null });
      if (!initial.success) throw new ConflictException("Skan məlumatlarının formatı düzgün deyil.");
      if (sheet.templateVersion !== initial.data.templateVersion)
        throw new ConflictException("Vərəq şablonunun versiyası uyğun deyil.");
      const answerCount = initial.data.answers.length;
      const choices = sheet.answerKey.choiceCount;
      const answers = initial.data.answers.map(a => ({ ...a, marked: [...a.marked], fillRatios: [...a.fillRatios] }));
      const changed = new Set<number>();
      for (const item of parsed.data.changes) {
        if (item.question > answerCount) throw new BadRequestException("Sual nömrəsi həddən artıqdır.");
        if (item.selected && "ABCDE".indexOf(item.selected) >= choices)
          throw new BadRequestException("Seçilmiş variant bu şablona uyğun deyil.");
        const target = answers[item.question - 1];
        if (target.question !== item.question) throw new ConflictException("Sual sırası dəyişib.");
        target.state = item.selected ? "MARKED" : "BLANK";
        target.selected = item.selected;
        target.marked = item.selected ? [item.selected] : [];
        target.confidence = 1; // human verified, source ratios are preserved in audit data
        changed.add(item.question);
      }
      if (answers.some(a => a.state === "UNCERTAIN" || a.state === "MULTIPLE" || a.confidence < .85))
        throw new BadRequestException("Bütün qeyri-müəyyən cavablar yoxlanılmalıdır.");
      const verified: ReadPage = { ...initial.data, status: "READ", reviewFlags: [], answers };
      let scored: ReturnType<typeof scorePage>;
      try {
        scored = scorePage(verified, sheet.answerKey.answers as KeyAnswer[],
          sheet.answerKey.scoring as Rules, choices);
      } catch {
        throw new ConflictException("Cavab açarı və skan şablonu uyğun deyil.");
      }
      if (scored.score === null) throw new ConflictException("Nəticə hələ təsdiqlənə bilmir.");
      const identity = { sheetId: sheet.id, ticketId: sheet.ticketId,
        candidateId: sheet.candidateId, examId: sheet.examId,
        answerKeyId: sheet.answerKeyId, keyVersion: sheet.answerKey.version,
        keyDigest: sheet.answerKey.digest, variant: sheet.answerKey.variant };
      const revised = {
        ...saved, answers, ...scored, identity, status: "READ", reviewFlags: [],
        recognizedAnswers: saved.recognizedAnswers ?? initial.data.answers,
        manualReview: { reviewedBy: user.userId, reviewedAt: new Date().toISOString(),
          note: parsed.data.note, questions: [...changed].sort((a,b) => a - b) },
      };
      await tx.omrPage.update({ where: { id: page.id }, data: { status: "COMPLETED", data: json(revised) } });
      const pending = await tx.omrPage.count({ where: { uploadId, status: { not: "COMPLETED" } } });
      if (pending === 0) await tx.omrUpload.update({ where: { id: uploadId }, data: { status: "COMPLETED", error: null } });
      await this.audit.log("OMR_PAGE_MANUAL_REVIEW", user.userId, "OmrPage", page.id,
        { uploadId, questions: [...changed], noteLength: parsed.data.note.length }, tx);
      return { id: page.id, uploadId, status: "COMPLETED", score: scored.score,
        maximumScore: scored.maximumScore, uploadStatus: pending === 0 ? "COMPLETED" : "REVIEW" };
    });
  }

  async original(id: string, user: AuthenticatedUser) {
    const upload = await this.getUpload(id, user);
    return { buffer: await readFile(join(this.storage(), upload.id)), mime: upload.mime };
  }

  async upload(examId: string, files: ScanFile[], user: AuthenticatedUser) {
    if (!files?.length || files.length > 4 || files.reduce((sum, f) => sum + f.size, 0) > 50 * 1024 * 1024)
      throw new BadRequestException("Ən çox 4 fayl və cəmi 50 MB qəbul olunur.");
    if (!isCentralAdmin(user) && !(user.branches ?? []).some(b => this.branchAllowed(user, b.id))) throw new ForbiddenException();
    if (!await this.prisma.exam.findUnique({ where: { id: examId } })) throw new NotFoundException("İmtahan tapılmadı.");
    for (const file of files) {
      const ext = extname(file.originalname).toLowerCase();
      const expected = mimeExtensions[file.mimetype];
      const signature = file.mimetype === "application/pdf" ? file.buffer.subarray(0, 5).toString() === "%PDF-" :
        file.mimetype === "image/png" ? file.buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
        file.buffer[0] === 255 && file.buffer[1] === 216 && file.buffer[2] === 255;
      if (!expected || !signature || !file.size || file.size !== file.buffer.length || file.size > 25 * 1024 * 1024 ||
          (ext !== expected && !(expected === ".jpg" && ext === ".jpeg"))) throw new BadRequestException("PDF, PNG və ya JPEG faylı tələb olunur; limit 25 MB.");
    }
    const results = [];
    for (const file of files) results.push(await this.processFile(examId, file, user));
    return results;
  }

  private async processFile(examId: string, file: ScanFile, user: AuthenticatedUser) {
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const upload = await this.prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(730142)::text");
      const previous = await tx.omrUpload.findUnique({ where: { examId_createdBy_sha256: { examId, createdBy: user.userId, sha256 } } });
      if (previous) return previous;
      const recent = await tx.omrUpload.count({ where: { createdBy: user.userId, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
      if (recent >= 20) throw new HttpException("OMR saatlıq yükləmə limiti dolub.", 429);
      const total = await tx.omrUpload.aggregate({ _sum: { size: true } });
      const maxBytes = Number(process.env.OMR_MAX_STORAGE_BYTES ?? 2 * 1024 ** 3);
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || (total._sum.size ?? 0) + file.size > maxBytes)
        throw new ServiceUnavailableException("OMR saxlama limiti dolub.");
      const created = await tx.omrUpload.create({ data: { examId, createdBy: user.userId, sha256, size: file.size, mime: file.mimetype } });
      await this.audit.log("OMR_UPLOAD_CREATED", user.userId, "OmrUpload", created.id, { size: file.size, examId }, tx);
      return created;
    });
    const attemptId = randomUUID();
    const claim = await this.prisma.omrUpload.updateMany({ where: { id: upload.id, OR: [
      { status: { in: ["PENDING", "FAILED"] } }, { status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - 300_000) } },
    ] }, data: { status: "PROCESSING", attemptId, error: null } });
    if (!claim.count) return this.getUpload(upload.id, user);
    try {
      const dir = this.storage();
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const temporary = join(dir, `${upload.id}.${attemptId}.tmp`);
      await writeFile(temporary, file.buffer, { mode: 0o600, flag: "wx" });
      await rename(temporary, join(dir, upload.id));
      const form = new FormData();
      form.append("files", new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), `scan${mimeExtensions[file.mimetype]}`);
      const response = await this.worker("process", form);
      const parsed = workerResultSchema.parse(await response.json()).files[0];
      await this.prisma.$transaction(async tx => {
        // Short global claim lock avoids deadlocks for batches containing the same sheets in different orders.
        await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(730143)::text");
        const current = await tx.omrUpload.findUniqueOrThrow({ where: { id: upload.id } });
        if (current.attemptId !== attemptId || current.status !== "PROCESSING") return;
        let review = parsed.status !== "READ";
        const pageIndexes = new Set<number>();
        for (const page of parsed.pages) {
          if (pageIndexes.has(page.pageIndex)) throw new Error("Duplicate page index");
          pageIndexes.add(page.pageIndex);
          const bound = await this.bindPage(tx, page, examId, user);
          if (bound.status !== "COMPLETED") review = true;
          await tx.omrPage.create({ data: { uploadId: upload.id, pageIndex: page.pageIndex, ...bound } });
        }
        if (!parsed.pages.length && parsed.status !== "REJECTED") throw new Error("Missing pages");
        await tx.omrUpload.update({ where: { id: upload.id }, data: {
          status: parsed.status === "REJECTED" ? "REJECTED" : review ? "REVIEW" : "COMPLETED", error: parsed.error ?? null,
        } });
        await this.audit.log("OMR_UPLOAD_PROCESSED", user.userId, "OmrUpload", upload.id, { pages: parsed.pages.length, review }, tx);
      });
    } catch {
      await this.prisma.omrUpload.updateMany({ where: { id: upload.id, attemptId, status: "PROCESSING" },
        data: { status: "FAILED", error: "PROCESSING_FAILED_RETRY_ALLOWED" } });
    }
    return this.getUpload(upload.id, user);
  }

  private async bindPage(tx: Prisma.TransactionClient, page: ReadPage, examId: string, user: AuthenticatedUser) {
    const { sheetToken, ...reading } = page;
    const review = (flag: string) => ({ sheetId: null, status: "REVIEW", data: json({ ...reading, score: null, reviewFlags: [...page.reviewFlags, flag] }) });
    if (!sheetToken) return review("IDENTIFIER_REQUIRED");
    const sheet = await tx.omrSheet.findUnique({ where: { token: sheetToken }, include: { answerKey: true, ticket: true, result: true } });
    if (!sheet || sheet.examId !== examId || !this.branchAllowed(user, sheet.branchId)) return review("IDENTITY_NOT_AUTHORIZED_FOR_EXAM");
    if (sheet.candidateId !== sheet.ticket.candidateId || sheet.examId !== sheet.ticket.examId || sheet.branchId !== sheet.ticket.branchId ||
        sheet.answerKey.examId !== examId || sheet.ticket.status === "CANCELLED" || (sheet.ticket.price > 0 && sheet.ticket.paymentStatus !== "PAID")) return review("TICKET_IDENTITY_OR_STATUS_CHANGED");
    const identity = { sheetId: sheet.id, ticketId: sheet.ticketId, candidateId: sheet.candidateId, examId,
      answerKeyId: sheet.answerKeyId, keyVersion: sheet.answerKey.version, keyDigest: sheet.answerKey.digest, variant: sheet.answerKey.variant };
    if (sheet.result) return { sheetId: null, status: "DUPLICATE", data: json({ duplicateOf: sheet.result.id, reviewFlags: ["SHEET_ALREADY_PROCESSED"] }) };
    try {
      const scored = scorePage(page, sheet.answerKey.answers as KeyAnswer[], sheet.answerKey.scoring as Rules, sheet.answerKey.choiceCount);
      return { sheetId: sheet.id, status: scored.score === null ? "REVIEW" : "COMPLETED", data: json({ ...reading, ...scored, identity }) };
    } catch {
      return review("TEMPLATE_KEY_MISMATCH");
    }
  }
}
