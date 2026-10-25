import { describe, it, expect } from "vitest";
import { isValidQepikPrice, qepikToAzn } from "./money";

describe("money unit", () => {
  it("accepts integer non-negative qepik values", () => {
    expect(isValidQepikPrice(0)).toBe(true);
    expect(isValidQepikPrice(3500)).toBe(true);
  });

  it("rejects null and negative or fractional values", () => {
    expect(isValidQepikPrice(null)).toBe(false);
    expect(isValidQepikPrice(-1)).toBe(false);
    expect(isValidQepikPrice(35.5)).toBe(false);
  });

  it("converts qepik to AZN", () => {
    expect(qepikToAzn(3500)).toBe(35);
    expect(qepikToAzn(0)).toBe(0);
  });
});
