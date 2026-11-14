import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuditService } from "../src/audit/audit.service";
import { OmrService } from "../src/omr/omr.service";

const url = process.env.DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test") || url !== process.env.TEST_DATABASE_URL)
  throw new Error("Isolated *_test database required");
const prisma = new PrismaService();
const omr = new OmrService(prisma, new AuditService(prisma));
const admin = { userId: randomUUID(), roles: ["CENTRAL_ADMIN"] };
beforeAll(() => prisma.$connect());
afterAll(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await prisma.$disconnect(); });

describe("Multiple cards and work numbers in a real database", () => {
  it("backfills existing tickets and keeps numbers unique without changing their codes", async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const schema = `migration_${randomUUID().replaceAll("-", "")}`;
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await client.query('CREATE TABLE tickets (code TEXT PRIMARY KEY)');
      await client.query("INSERT INTO tickets (code) VALUES ('OLD-A'), ('OLD-B')");
      await client.query(await readFile("prisma/migrations/20261114000100_ticket_work_number/migration.sql", "utf8"));
      await client.query("INSERT INTO tickets (code) VALUES ('NEW-C')");
      const { rows } = await client.query('SELECT code, work_number FROM tickets ORDER BY code');
      expect(rows.map(row => row.code)).toEqual(["NEW-C", "OLD-A", "OLD-B"]);
      expect(new Set(rows.map(row => row.work_number)).size).toBe(3);
      expect(rows.every(row => /^[0-9]{8}$/.test(row.work_number))).toBe(true);
      await expect(client.query("INSERT INTO tickets (code, work_number) VALUES ('BAD', '123')")).rejects.toThrow();
    } finally { await client.end(); }
  });

  it("persists all 12 pupils separately, exports their names/codes and preserves results on repeat scans", async () => {
    const branch = await prisma.branch.create({ data: { code: randomUUID(), name: "OMR multi-card test" } });
    const exam = await prisma.exam.create({ data: { code: randomUUID(), title: "Multi-card test", createdBy: admin.userId } });
    const key = await omr.createKey({ examId: exam.id, variant: "A", choiceCount: 2, answers: [{ correct: "A", points: 2 }], scoring: {} }, admin);
    const pages = [];
    const numbers = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const candidate = await prisma.candidate.create({ data: { candidate_number: `QD-${randomUUID()}`, full_name: `Əli Əliyev ${i}`, branch_id: branch.id } });
      const ticket = await prisma.ticket.create({ data: { code: randomUUID(), qrCode: randomUUID(), examId: exam.id, branchId: branch.id, candidateId: candidate.id, price: 0 } });
      numbers.add(ticket.workNumber);
      const issued = await omr.issue({ workNumber: ticket.workNumber, answerKeyId: key.id }, admin);
      expect(issued.templateVersion).toBe("hilal-a4-v2");
      const sheet = await prisma.omrSheet.findUniqueOrThrow({ where: { id: issued.id } });
      pages.push({ pageIndex: i, templateVersion: issued.templateVersion, engineVersion: "1.0.0", sheetToken: sheet.token,
        workNumber: ticket.workNumber, questionCount: 1, choiceCount: 2, confidence: 1, status: "READ", reviewFlags: [], metadata: { sourcePageIndex: 0, sheetIndex: i },
        answers: [{ question: 1, state: "MARKED", selected: "A", marked: ["A"], confidence: 1, fillRatios: [1, 0] }] });
    }
    expect(numbers.size).toBe(12);
    vi.stubEnv("OMR_WORKER_SECRET", "local-worker-test-secret-32-characters");
    vi.stubEnv("OMR_STORAGE_DIR", `/tmp/hilal-omr-scan-test-${randomUUID()}`);
    const fetchWorker = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ files: [{ status: "READ", pages }] })));
    const buffer = Buffer.from([255, 216, 255, 0]);
    const file = { buffer, size: buffer.length, mimetype: "image/jpeg", originalname: "group.jpg" };
    const [upload] = await omr.upload(exam.id, [file], admin);
    expect(upload.status).toBe("COMPLETED");
    expect(upload.pages).toHaveLength(12);
    expect(upload.pages.every(page => page.status === "COMPLETED")).toBe(true);
    const details = await omr.getUpload(upload.id, admin);
    expect(new Set(details.pages.map(page => page.candidate?.workNumber))).toEqual(numbers);
    expect(details.pages[0].candidate?.name).toBe("Əli Əliyev 0");
    const csv = (await omr.exportCsv(exam.id, admin)).toString("utf8");
    expect(csv).toContain("candidate_name");
    expect(csv).toContain("work_number");
    expect(csv).toContain("Əli Əliyev 0");
    expect((await omr.upload(exam.id, [file], admin))[0].id).toBe(upload.id);
    expect(fetchWorker).toHaveBeenCalledTimes(1);
    const changed = Buffer.from([255, 216, 255, 1]);
    const [duplicate] = await omr.upload(exam.id, [{ ...file, buffer: changed }], admin);
    expect(duplicate.pages.every(page => page.status === "DUPLICATE")).toBe(true);
    expect(await prisma.omrPage.count({ where: { sheetId: { not: null }, upload: { examId: exam.id } } })).toBe(12);
    fetchWorker.mockRestore();
  });
});
