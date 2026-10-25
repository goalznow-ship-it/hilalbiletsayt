import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAzn, isValidQepikPrice } from "../src/lib/money.ts";

for (const value of [3500, 0, 12]) {
  test(`isValidQepikPrice accepts valid non-negative integer qepik: ${value}`, () => {
    assert.equal(isValidQepikPrice(value), true);
  });
}

test("isValidQepikPrice rejects missing, fractional, negative, and invalid values", () => {
  assert.equal(isValidQepikPrice(null), false);
  assert.equal(isValidQepikPrice(undefined), false);
  assert.equal(isValidQepikPrice(-1), false);
  assert.equal(isValidQepikPrice(35.5), false);
});

test("formatAzn converts integer qepik to AZN", () => {
  assert.equal(formatAzn(3500), "35.00 AZN");
  assert.equal(formatAzn(0), "Pulsuz");
});

test("formatAzn handles unset prices", () => {
  assert.equal(formatAzn(null), "Qiymət təyin edilməyib");
});
