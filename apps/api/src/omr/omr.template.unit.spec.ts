import { describe, expect, it } from "vitest";
import { createTemplateSchema } from "./omr.template";
import { pageSchema } from "./omr.contract";

const grid = { left: .1, top: .2, right: .4, bottom: .7, rows: 20, columns: 5, radius: .006 };
const config = { name: "My blank card", answerKeyId: crypto.randomUUID(), layout: { width: 1200, height: 1700,
  answers: [grid], workNumber: { ...grid, rows: 10, columns: 8 } } };
describe("Custom template trust boundary", () => {
  it("bounds all geometry and requires an eight-digit grid", () => {
    expect(createTemplateSchema.safeParse(config).success).toBe(true);
    for (const change of [{ rows: 151 }, { columns: 6 }, { left: -.1 }, { right: .05 }, { radius: .1 }]) {
      expect(createTemplateSchema.safeParse({ ...config, layout: { ...config.layout, answers: [{ ...grid, ...change }] } }).success).toBe(false);
    }
    expect(createTemplateSchema.safeParse({ ...config, layout: { ...config.layout, workNumber: grid } }).success).toBe(false);
  });
  it("accepts only UUID-named custom model versions", () => {
    const reading = { pageIndex: 0, engineVersion: "1.0.0", templateVersion: `custom:${crypto.randomUUID()}`,
      sheetToken: null, answers: [], confidence: 0, status: "REVIEW", reviewFlags: [], metadata: {} };
    expect(pageSchema.safeParse(reading).success).toBe(true);
    expect(pageSchema.safeParse({ ...reading, templateVersion: "custom:../../sample" }).success).toBe(false);
  });
});
