import { describe, expect, it, vi } from "vitest";
import { OmrService } from "./omr.service";
import { issueSchema, workerResultSchema, type ReadPage } from "./omr.contract";

const admin = { userId: "admin", roles: ["CENTRAL_ADMIN"] };
const page: ReadPage = { pageIndex: 0, engineVersion: "1.0.0", templateVersion: "hilal-a4-v2",
  sheetToken: "a".repeat(43), workNumber: "12345678", questionCount: 1, choiceCount: 2,
  confidence: 1, status: "READ", reviewFlags: [], metadata: {}, answers: [
    { question: 1, selected: "A", marked: ["A"], state: "MARKED", confidence: 1, fillRatios: [1, 0] },
  ] };
const sheet = { id: "sheet", examId: "exam", branchId: "branch", candidateId: "candidate", ticketId: "ticket",
  answerKeyId: "key", templateVersion: "hilal-a4-v2", result: null,
  ticket: { examId: "exam", branchId: "branch", candidateId: "candidate", status: "ACTIVE", price: 0, workNumber: "12345678" },
  answerKey: { examId: "exam", version: 1, digest: "digest", variant: "A", choiceCount: 2,
    answers: [{ questionId: null, correct: "A", points: 2 }], scoring: { wrong: 0, unanswered: 0, multiple: 0, floorAtZero: true } },
};

describe("Coded OMR identity", () => {
  it("accepts 12 independent readings while bounding the document to 100", () => {
    const result = (count: number) => ({ files: [{ status: "READ", pages: Array.from({ length: count }, (_, pageIndex) => ({ ...page, pageIndex })) }] });
    expect(workerResultSchema.safeParse(result(12)).success).toBe(true);
    expect(workerResultSchema.safeParse(result(101)).success).toBe(false);
  });
  it("requires one unambiguous ticket selector", () => {
    const key = crypto.randomUUID();
    expect(issueSchema.safeParse({ workNumber: "12345678", answerKeyId: key }).success).toBe(true);
    expect(issueSchema.safeParse({ workNumber: "123", answerKeyId: key }).success).toBe(false);
    expect(issueSchema.safeParse({ workNumber: "12345678", ticketId: crypto.randomUUID(), answerKeyId: key }).success).toBe(false);
  });
  it("binds a matching code and never guesses missing, wrong or wrong-version identity", async () => {
    const service = new OmrService({} as never, {} as never);
    const tx = { omrSheet: { findUnique: vi.fn().mockResolvedValue(sheet) } };
    const bind = (reading: ReadPage) => service["bindPage"](tx as never, reading, "exam", admin);
    expect(await bind(page)).toMatchObject({ sheetId: "sheet", status: "COMPLETED", data: { score: 2, identity: { workNumber: "12345678", candidateId: "candidate" } } });
    for (const workNumber of [undefined, null, "87654321"]) {
      const result = await bind({ ...page, workNumber });
      expect(result.sheetId).toBeNull();
      expect(result.status).toBe("REVIEW");
    }
    expect(await bind({ ...page, templateVersion: "hilal-a4-v1" })).toMatchObject({ sheetId: null, status: "REVIEW" });
    tx.omrSheet.findUnique.mockResolvedValue({ ...sheet, result: { id: "prior" } } as never);
    expect(await bind(page)).toMatchObject({ status: "DUPLICATE" });
  });
  it("returns names and work numbers only after the upload branch is authorized", async () => {
    const ticket = { code: "HK-1", workNumber: "12345678", candidateId: "candidate", candidate: { full_name: "Əli Əliyev", candidate_number: "QD123" } };
    const prisma = { omrUpload: { findUnique: vi.fn().mockResolvedValue({ id: "upload", createdBy: "operator", pages: [
      { id: "page", sheet: { branchId: "branch", candidateId: "candidate", ticket }, data: { score: 2 } },
    ] }) } };
    const service = new OmrService(prisma as never, {} as never);
    const operator = { userId: "operator", roles: ["OMR_OPERATOR"], branches: [{ id: "branch" }] };
    expect((await service.getUpload("upload", operator)).pages[0]).toMatchObject({ candidate: { name: "Əli Əliyev", workNumber: "12345678" } });
    await expect(service.getUpload("upload", { ...operator, branches: [{ id: "other" }] })).rejects.toThrow();
    const restricted = await service.getUpload("upload", { ...operator, branches: [{ id: "other" }] }, true);
    expect(restricted.pages).toEqual([]);
    expect(JSON.stringify(restricted)).not.toContain("Əli");
  });
});
