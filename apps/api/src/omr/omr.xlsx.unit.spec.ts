import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { omrXlsx } from "./omr.xlsx";

// Read the first local ZIP entry, enough to test that the package is valid DEFLATE.
function firstEntry(data: Buffer): Buffer {
  expect(data.readUInt32LE(0)).toBe(0x04034b50);
  expect(data.readUInt16LE(8)).toBe(8);
  const name = data.readUInt16LE(26);
  const extras = data.readUInt16LE(28);
  const start = 30 + name + extras;
  return inflateRawSync(data.subarray(start, start + data.readUInt32LE(18)));
}

describe("OMR XLSX export", () => {
  it("produces a ZIP-based Excel workbook", () => {
    const xlsx = omrXlsx([["page_id", "score"], ["a", 1.25]]);
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
    expect(firstEntry(xlsx).toString()).toContain("spreadsheetml.sheet.main+xml");
    expect(xlsx.includes(Buffer.from("xl/worksheets/sheet1.xml"))).toBe(true);
  });
});
