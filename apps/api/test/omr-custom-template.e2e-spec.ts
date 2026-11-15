import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { OmrService } from "../src/omr/omr.service";

const url = process.env.DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test") || url !== process.env.TEST_DATABASE_URL)
  throw new Error("Isolated *_test database required");
const prisma = new PrismaService();
const service = new OmrService(prisma, new AuditService(prisma));
const admin = { userId: randomUUID(), roles: ["CENTRAL_ADMIN"] };
const layout = { width: 1200, height: 1700,
  answers: [{ left: .1, right: .3, top: .5, bottom: .8, rows: 20, columns: 5, radius: .005 }],
  workNumber: { left: .3, right: .6, top: .1, bottom: .3, rows: 10, columns: 8, radius: .005 } };
const buffer = Buffer.from([255, 216, 255, 0]);
const file = { buffer, size: buffer.length, mimetype: "image/jpeg", originalname: "card.jpg" };
const preview = { width: 1200, height: 1700, image: Buffer.from("worker-validated-blank-png").toString("base64") };
const answers = Array.from({ length: 20 }, (_, i) => ({ question: i + 1, state: "MARKED", selected: "A", marked: ["A"], confidence: 1, fillRatios: [1, 0, 0, 0, 0] }));

beforeAll(async () => {
  await prisma.$connect();
  vi.stubEnv("OMR_WORKER_SECRET", "local-template-test-secret-32-characters");
  vi.stubEnv("OMR_STORAGE_DIR", `/tmp/hilal-custom-omr-${randomUUID()}`);
});
afterAll(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await prisma.$disconnect(); });

describe("Custom model persistence and safe pupil identity", () => {
  it("saves immutable models, reads own cards, scopes branches and keeps model-specific retries", async () => {
    const branch = await prisma.branch.create({ data: { code: randomUUID(), name: "Custom model" } });
    const other = await prisma.branch.create({ data: { code: randomUUID(), name: "Other branch" } });
    const operator = { userId: randomUUID(), roles: ["OMR_OPERATOR"], branches: [{ id: branch.id }], userBranchRoles: [{ role: "OMR_OPERATOR", branchId: branch.id }] };
    const exam = await prisma.exam.create({ data: { code: randomUUID(), title: "Own answer card", createdBy: admin.userId } });
    const key = await service.createKey({ examId: exam.id, variant: "A", choiceCount: 5,
      answers: Array.from({ length: 20 }, () => ({ correct: "A", points: 2 })), scoring: {} }, admin);
    const worker = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(preview)));
    const config = { name: "My card", answerKeyId: key.id, layout };
    await expect(service.createTemplate(file, config, operator)).rejects.toThrow();
    await expect(service.previewTemplate(file, operator)).rejects.toThrow();
    await expect(service.createTemplate(file, { ...config, layout: { ...layout, answers: [{ ...layout.answers[0], rows: 19 }] } }, admin)).rejects.toThrow();
    expect(worker).not.toHaveBeenCalled();
    const model = await service.createTemplate(file, config, admin);
    const model2 = await service.createTemplate(file, { ...config, name: "Another model" }, admin);
    const listed = await service.listTemplates(exam.id, operator);
    expect(listed).toHaveLength(2);
    expect(listed[0]).not.toHaveProperty("sample");
    expect(listed[0]).not.toHaveProperty("layout");
    const tickets = [];
    for (let i = 0; i < 4; i++) {
      const branchId = i === 2 ? other.id : branch.id;
      const candidate = await prisma.candidate.create({ data: { candidate_number: randomUUID(), full_name: `Şagird ${i}`, branch_id: branchId } });
      tickets.push(await prisma.ticket.create({ data: { code: randomUUID(), qrCode: randomUUID(), examId: exam.id,
        branchId, candidateId: candidate.id, price: 0 } }));
    }
    const reading = (workNumber: string | null, pageIndex = 0, modelId = model.id) => ({
      pageIndex, templateVersion: `custom:${modelId}`, engineVersion: "1.0.0", sheetToken: null, workNumber,
      questionCount: 20, choiceCount: 5, confidence: 1, status: "READ", reviewFlags: [], metadata: {}, answers,
    });
    let pages = tickets.slice(0, 2).map((ticket, i) => reading(ticket.workNumber, i));
    worker.mockImplementation(async (_url, options) => {
      const form = options!.body as FormData;
      expect(form.get("version")).toMatch(/^custom:/);
      expect(form.get("sample")).toBeInstanceOf(Blob);
      expect(JSON.parse(form.get("layout") as string)).toEqual(layout);
      return new Response(JSON.stringify({ files: [{ status: "READ", pages }] }));
    });
    const [upload] = await service.upload(exam.id, [file], operator, model.id);
    expect(upload.status).toBe("COMPLETED");
    expect(upload.pages).toHaveLength(2);
    expect(upload.pages[0].candidate).toMatchObject({ name: "Şagird 0", workNumber: tickets[0].workNumber });
    expect(await prisma.omrUpload.findUnique({ where: { id: upload.id } })).toMatchObject({ templateId: model.id });
    expect((await service.upload(exam.id, [file], operator, model.id))[0].id).toBe(upload.id);
    expect((await service.exportCsv(exam.id, admin)).toString()).toContain("Şagird 0");
    const [duplicate] = await service.upload(exam.id, [{ ...file, buffer: Buffer.from([255, 216, 255, 2]) }], operator, model.id);
    expect(duplicate.status).toBe("REVIEW");
    expect((await service.getUpload(duplicate.id, admin)).pages.every(page => page.status === "DUPLICATE")).toBe(true);
    pages = [reading(tickets[0].workNumber, 0, model2.id)];
    const [differentModel] = await service.upload(exam.id, [file], operator, model2.id);
    expect(differentModel.id).not.toBe(upload.id);
    expect(differentModel.status).toBe("REVIEW");
    expect(differentModel.pages).toEqual([]);
    const ownSheet = await prisma.omrSheet.findUniqueOrThrow({ where: { ticketId: tickets[0].id } });
    expect(ownSheet.templateVersion).toBe(`custom:${model.id}`);
    await expect(service.pdf(ownSheet.id, admin)).rejects.toThrow("standart PDF");
    pages = [reading(tickets[2].workNumber), reading(null, 1)];
    const [restricted] = await service.upload(exam.id, [{ ...file, buffer: Buffer.from([255, 216, 255, 1]) }], operator, model.id);
    expect(restricted.status).toBe("REVIEW");
    expect(restricted.pages).toEqual([]);
    expect(await prisma.omrSheet.findUnique({ where: { ticketId: tickets[2].id } })).toBeNull();
    await expect(service.original(restricted.id, operator)).rejects.toThrow();
    const privatePages = (await service.getUpload(restricted.id, admin)).pages;
    expect(privatePages.every(page => page.sheetId === null)).toBe(true);
    pages = [{ ...reading(tickets[3].workNumber), answers: answers.map((answer, i) => i === 0 ? {
      ...answer, state: "MULTIPLE", selected: null, marked: ["A", "B"], fillRatios: [1, 1, 0, 0, 0],
    } : answer) } as typeof pages[number]];
    const [review] = await service.upload(exam.id, [{ ...file, buffer: Buffer.from([255, 216, 255, 3]) }], operator, model.id);
    expect(review.status).toBe("REVIEW");
    expect(review.pages[0].candidate?.workNumber).toBe(tickets[3].workNumber);
    await expect(service.reviewPage(review.id, review.pages[0].id, {
      note: "Kağızdakı düzəlişi yoxladım", changes: [{ question: 1, selected: "A" }],
    }, operator)).resolves.toMatchObject({ status: "COMPLETED", score: 40 });
    await expect(service.upload(randomUUID(), [file], admin, model.id)).rejects.toThrow();
    await expect(service.upload(exam.id, [file], admin, randomUUID())).rejects.toThrow("bu imtahana");
    await prisma.exam.update({ where: { id: exam.id }, data: { resultsPublishedAt: new Date() } });
    await expect(service.upload(exam.id, [file], admin, model.id)).rejects.toThrow("dərc olunub");
    await expect(service.createTemplate(file, config, admin)).rejects.toThrow("dərc olunub");
    worker.mockRestore();
  });
});
