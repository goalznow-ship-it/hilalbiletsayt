import { describe, expect, it } from "vitest";
import { bakuBusinessDate, isIsoDate } from "./business-date";

describe("bakuBusinessDate", () => {
  it("rolls over at local midnight (20:00 UTC)", () => {
    expect(bakuBusinessDate(new Date("2026-11-03T19:59:59Z"))).toBe("2026-11-03");
    expect(bakuBusinessDate(new Date("2026-11-03T20:00:00Z"))).toBe("2026-11-04");
  });

  it("validates calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("26-02-01")).toBe(false);
  });
});
