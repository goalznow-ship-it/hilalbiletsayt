import { describe, expect, it } from "vitest";
import { reviewSchema, scorePage, type ReadPage, scoringSchema } from "./omr.contract";

const marked = (question: number, selected: "A" | "B") => ({
  question, state: "MARKED" as const, selected,
  marked: [selected], confidence: 1, fillRatios: selected === "A" ? [1, 0] : [0, 1],
});

describe("OMR manual review request", () => {
  it("requires note, unique question numbers, and only answer selections", () => {
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
});
