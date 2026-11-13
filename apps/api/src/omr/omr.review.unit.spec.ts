import { describe, expect, it, vi } from "vitest";
import { reviewSchema, scorePage, type ReadPage, scoringSchema } from "./omr.contract";
import { OmrService } from "./omr.service";

const marked = (question: number, selected: "A" | "B") => ({
  question, state: "MARKED" as const, selected,
  marked: [selected], confidence: 1, fillRatios: selected === "A" ? [1, 0] : [0, 1],
});

describe("OMR manual review request", () => {
  it("requires note, unique question numbers, and only answer selections", () => {
    expect(reviewSchema.safeParse({ note: "Bütün cavablar vərəqlə yoxlandı", changes: [] }).success).toBe(true);
    expect(reviewSchema.safeParse({ note: "Kağızdan yoxlandı", changes: [
      { question: 1, selected: "A" }, { question: 2, selected: null },
    ] }).success).toBe(true);
    expect(reviewSchema.safeParse({ note: "x", changes: [{ question: 1, selected: "A" }] }).success).toBe(false);
    expect(reviewSchema.safeParse({ note: "Yoxlandı", changes: [
      { question: 1, selected: "A" }, { question: 1, selected: "B" },
    ] }).success).toBe(false);
    expect(reviewSchema.safeParse({ note: "Yoxlandı", changes: [
      { question: 1, selected: "A", sheetId: crypto.randomUUID() },
    ] }).success).toBe(false);
  });
  it("recalculates score with immutable key after verified correction", () => {
    const page: ReadPage = {
      pageIndex: 0, engineVersion: "1.0.0", templateVersion: "hilal-a4-v1",
      sheetToken: null, questionCount: 2, choiceCount: 2,
      answers: [marked(1, "A"), marked(2, "B")],
      status: "READ", reviewFlags: [], confidence: 1, metadata: {},
    };
    const key = [{ questionId: "a", correct: "A", points: 2 },
      { questionId: "b", correct: "B", points: 3 }];
    expect(scorePage(page, key, scoringSchema.parse({}), 2).score).toBe(5);
    expect(scorePage(page, key.map(item => ({ ...item, correct: "A" })), scoringSchema.parse({}), 2).score).toBe(2);
  });
  it("allows unchanged human verification but refuses unresolved uncertainty", async () => {
    const data: ReadPage = { pageIndex: 0, engineVersion: "1.0.0", templateVersion: "hilal-a4-v1",
      sheetToken: null, questionCount: 1, choiceCount: 2, confidence: 1, status: "REVIEW",
      reviewFlags: ["IMAGE_BLURRED"], metadata: {}, answers: [marked(1, "A")] };
    const page = { id: "page", uploadId: "upload", status: "REVIEW", pageIndex: 0, data,
      upload: { id: "upload", status: "REVIEW", examId: "exam" },
      sheet: { id: "sheet", examId: "exam", branchId: "branch", candidateId: "candidate", templateVersion: "hilal-a4-v1",
        ticket: { examId: "exam", branchId: "branch", candidateId: "candidate", status: "SOLD", price: 0 },
        answerKey: { examId: "exam", choiceCount: 2, answers: [{ correct: "A", points: 2 }], scoring: scoringSchema.parse({}) } } };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), omrPage: {
      findUnique: vi.fn().mockResolvedValue(page), update: vi.fn(), count: vi.fn().mockResolvedValue(0),
    }, omrUpload: { update: vi.fn() } };
    const audit = { log: vi.fn() };
    const service = new OmrService({ $transaction: (callback: (value: unknown) => unknown) => callback(tx) } as never, audit as never);
    const input = { note: "Vərəqdəki cavab təsdiqləndi", changes: [] };
    expect(await service.reviewPage("upload", "page", input, { userId: "admin", roles: ["CENTRAL_ADMIN"] }))
      .toMatchObject({ status: "COMPLETED", score: 2 });
    expect(tx.omrPage.update.mock.calls[0][0].data.data.recognizedAnswers).toEqual(data.answers);
    tx.omrPage.update.mockClear();
    data.answers[0].confidence = .6;
    await expect(service.reviewPage("upload", "page", input, { userId: "admin", roles: ["CENTRAL_ADMIN"] }))
      .rejects.toThrow("Bütün qeyri-müəyyən cavablar yoxlanılmalıdır.");
    expect(tx.omrPage.update).not.toHaveBeenCalled();
  });
});
