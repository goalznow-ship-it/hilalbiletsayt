import { describe, it, expect } from "vitest";
import { scorePage, scoringSchema, keySchema, type ReadPage } from "./omr.contract";
const page: ReadPage = { pageIndex: 0, engineVersion: "1.0.0", templateVersion: "hilal-a4-v1", sheetToken: "a".repeat(43),
  questionCount: 4, choiceCount: 3, status: "READ", confidence: 1, reviewFlags: [], metadata: {}, answers: [
    { question: 1, state: "MARKED", selected: "A", marked: ["A"], confidence: 1, fillRatios: [1,0,0] },
    { question: 2, state: "MARKED", selected: "B", marked: ["B"], confidence: 1, fillRatios: [0,1,0] },
    { question: 3, state: "BLANK", selected: null, marked: [], confidence: 1, fillRatios: [0,0,0] },
    { question: 4, state: "MULTIPLE", selected: null, marked: ["A", "B"], confidence: 1, fillRatios: [1,1,0] },
  ] };
const key = [1,2,3,4].map(i => ({ questionId: String(i), correct: "A", points: 2 }));
describe("OMR authoritative scoring", () => {
  it("uses exact fractional penalties and leaves invalid multiple marks for review", () => {
    const result = scorePage(page, key, scoringSchema.parse({ wrong: -.25, unanswered: -.1, multiple: -.5 }), 3);
    expect(result.provisionalScore).toBe(1.15);
    expect(result.score).toBeNull();
    expect(result.maximumScore).toBe(8);
    expect(result.reviewFlags).toContain("MULTIPLE");
  });
  it("never assigns a final score to uncertain or low-confidence answers", () => {
    const uncertain = structuredClone(page);
    uncertain.answers[0].state = "UNCERTAIN";
    uncertain.answers[0].confidence = .4;
    const result = scorePage(uncertain, key, scoringSchema.parse({}), 3);
    expect(result.score).toBeNull();
    expect(result.outcomes[0].points).toBeNull();
  });
  it("rejects mismatched counts, order and contradictory choices", () => {
    expect(() => scorePage(page, key.slice(1), scoringSchema.parse({}), 3)).toThrow("TEMPLATE_KEY_MISMATCH");
    const altered = structuredClone(page);
    altered.answers[0].selected = "C";
    expect(() => scorePage(altered, key, scoringSchema.parse({}), 3)).toThrow("INCONSISTENT_RECOGNITION");
  });
  it("validates score limits and duplicate source questions", () => {
    expect(scoringSchema.safeParse({ wrong: Number.NaN }).success).toBe(false);
    expect(scoringSchema.safeParse({ wrong: .25 }).success).toBe(false);
    expect(keySchema.safeParse({ examId: crypto.randomUUID(), variant: "A", choiceCount: 3,
      scoring: {}, questionIds: ["bad", "bad"] }).success).toBe(false);
  });
  it("scores a reliable blank sheet using the configured unanswered penalty", () => {
    const blank = structuredClone(page);
    blank.answers = page.answers.map(a => ({ ...a, state: "BLANK", selected: null, marked: [], fillRatios: [0,0,0] }));
    expect(scorePage(blank, key, scoringSchema.parse({ unanswered: -.1, floorAtZero: false }), 3).score).toBe(-.4);
    expect(scorePage(blank, key, scoringSchema.parse({ unanswered: -.1 }), 3).score).toBe(0);
  });
});
