/** Dependency-free printable A4 landscape report of finalized OMR results. */
function clean(value: string | number): string {
  return String(value).replace(/[^\x20-\x7e]/g, "?")
    .replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function omrResultsPdf(rows: Array<Array<string | number>>): Buffer {
  const contentRows = rows.slice(1);
  const pageSize = 36;
  const pageCount = Math.max(1, Math.ceil(contentRows.length / pageSize));
  const fontId = pageCount * 2 + 3;
  const objectCount = fontId;
  const objects: string[] = new Array(objectCount + 1);
  const pageIds = Array.from({ length: pageCount }, (_, i) => 3 + 2 * i);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(i => `${i} 0 R`).join(" ")}] /Count ${pageCount} >>`;
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  for (let pageNo = 0; pageNo < pageCount; pageNo++) {
    const pageId = pageIds[pageNo];
    const streamId = pageId + 1;
    const batch = contentRows.slice(pageNo * pageSize, (pageNo + 1) * pageSize);
    const ops = [
      `BT /F1 14 Tf 36 552 Td (${clean("HILAL OMR - FINAL RESULTS")}) Tj ET`,
      `BT /F1 8 Tf 36 530 Td (${clean(`Page ${pageNo + 1}/${pageCount} | Finalized rows: ${contentRows.length}`)}) Tj ET`,
      "0.7 w 36 516 m 806 516 l S",
      "BT /F1 8 Tf 36 500 Td (PAGE ID) Tj ET",
      "BT /F1 8 Tf 232 500 Td (TICKET ID) Tj ET",
      "BT /F1 8 Tf 426 500 Td (CANDIDATE ID) Tj ET",
      "BT /F1 8 Tf 694 500 Td (SCORE) Tj ET",
    ];
    for (let i = 0; i < batch.length; i++) {
      const r = batch[i];
      const y = 486 - i * 12;
      ops.push(`BT /F1 7 Tf 36 ${y} Td (${clean(r[0])}) Tj ET`);
      ops.push(`BT /F1 7 Tf 232 ${y} Td (${clean(r[2])}) Tj ET`);
      ops.push(`BT /F1 7 Tf 426 ${y} Td (${clean(r[3])}) Tj ET`);
      ops.push(`BT /F1 7 Tf 694 ${y} Td (${clean(`${r[6]} / ${r[7]}`)}) Tj ET`);
    }
    const stream = ops.join("\n") + "\n";
    const length = Buffer.byteLength(stream, "latin1");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`;
    objects[streamId] = `<< /Length ${length} >>\nstream\n${stream}endstream`;
  }
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i <= objectCount; i++) {
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objectCount; i++)
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
