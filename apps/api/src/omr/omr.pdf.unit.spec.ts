import { describe, expect, it } from "vitest";
import { omrResultsPdf } from "./omr.pdf";

describe("OMR PDF report", () => {
  it("contains a paginated printable PDF and never embeds executable content", () => {
    const rows: Array<Array<string | number>> = [["page", "upload", "ticket", "candidate", "branch", "variant", "score", "max", "status"]];
    for (let i = 0; i < 80; i++) rows.push([String(i), "upload", "ticket", "candidate", "branch", "A", 1.25, 5, "COMPLETED"]);
    const pdf = omrResultsPdf(rows).toString("latin1");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("/Count 3");
    expect(pdf).toContain("startxref");
  });
});
