import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { pageSchema, scorePage, scoringSchema, KeyAnswer } from "./omr.contract";

// Contract test across the Python/TypeScript boundary: the real worker output
// for the committed clean scan (services/omr-worker/tests/fixtures) must parse
// and score to the expected result.
const fixtures = join(__dirname, "../../../../services/omr-worker/tests/fixtures");
const snapshot = JSON.parse(readFileSync(join(fixtures, "clean.worker.json"), "utf8"));
const expected = JSON.parse(readFileSync(join(fixtures, "expected.json"), "utf8")) as { answers: string[] };

describe("scanned sample sheet -> score", () => {
  const page = pageSchema.parse({ ...snapshot, pageIndex: 0 });

  it("matches the answers marked on the sample sheet", () => {
    expect(page.status).toBe("READ");
    expect(page.answers.map((a) => a.selected)).toEqual(expected.answers);
  });

  it("scores 15 correct and 5 wrong answers with a wrong-answer penalty", () => {
    // Key agrees with the candidate on questions 1-15 and disagrees on 16-20.
    const key: KeyAnswer[] = expected.answers.map((answer, index) => ({
      questionId: randomUUID(),
      correct: index < 15 ? answer : "ABCDE"[("ABCDE".indexOf(answer) + 1) % 5],
      points: 2,
    }));
    const rules = scoringSchema.parse({ wrong: -0.5 });
    const result = scorePage(page, key, rules, 5);
    expect(result.reviewFlags).toEqual([]);
    expect(result.score).toBe(15 * 2 - 5 * 0.5);
    expect(result.maximumScore).toBe(40);
    expect(result.outcomes.filter((o) => o.outcome === "CORRECT")).toHaveLength(15);
    expect(result.outcomes.filter((o) => o.outcome === "WRONG")).toHaveLength(5);
  });
});
