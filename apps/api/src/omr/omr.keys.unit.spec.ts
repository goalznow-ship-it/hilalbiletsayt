import { describe, expect, it, vi } from "vitest";
import { OmrService } from "./omr.service";

const admin = { userId: crypto.randomUUID(), roles: ["CENTRAL_ADMIN"] };
const input = { examId: crypto.randomUUID(), variant: "B", choiceCount: 4,
  scoring: { wrong: -.25 }, answers: [{ correct: "B", points: 2 }, { correct: "D", points: 3 }] };

function setup() {
  const tx = {
    $queryRawUnsafe: vi.fn(),
    exam: { findUnique: vi.fn().mockResolvedValue({ id: input.examId }) },
    question: { findMany: vi.fn() },
    omrAnswerKey: {
      aggregate: vi.fn().mockResolvedValue({ _max: { version: 2 } }),
      create: vi.fn().mockImplementation(({ data }) => ({ ...data, id: crypto.randomUUID() })),
      findMany: vi.fn().mockResolvedValue([{ ...input, id: "key", version: 3 }]),
    },
  };
  const audit = { log: vi.fn() };
  const service = new OmrService({ ...tx, $transaction: (callback: (value: unknown) => unknown) => callback(tx) } as never, audit as never);
  return { service, tx, audit };
}

describe("direct OMR answer keys", () => {
  it("creates an immutable, versioned snapshot without requiring question bank entries", async () => {
    const { service, tx, audit } = setup();
    const key = await service.createKey(input, admin);
    expect(key).toMatchObject({ version: 3, answers: input.answers.map(answer => ({ ...answer, questionId: null })) });
    expect(key.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(key.scoring).toMatchObject({ wrong: -.25, unanswered: 0, multiple: 0, floorAtZero: true });
    expect(tx.question.findMany).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalled();
  });
  it("preserves the requested order of question bank answers", async () => {
    const { service, tx } = setup();
    const first = crypto.randomUUID(), second = crypto.randomUUID();
    tx.question.findMany.mockResolvedValue([
      { id: second, correct: 2, variants: "A|B|C|D", points: 3 },
      { id: first, correct: 1, variants: "A|B|C|D", points: 2 },
    ]);
    const { answers: _answers, ...bankInput } = input;
    const key = await service.createKey({ ...bankInput, questionIds: [first, second] }, admin);
    expect(key.answers).toEqual([
      { questionId: first, correct: "A", points: 2 }, { questionId: second, correct: "B", points: 3 },
    ]);
  });
  it("rejects missing exams and branch writers, and never reveals the key to branch readers", async () => {
    const { service, tx } = setup();
    const operator = { userId: crypto.randomUUID(), roles: ["OMR_OPERATOR"], branches: [{ id: "branch" }] };
    await expect(service.createKey(input, operator)).rejects.toThrow();
    expect((await service.listKeys(input.examId, operator))[0]).not.toHaveProperty("answers");
    expect((await service.listKeys(input.examId, admin))[0]).toHaveProperty("answers", input.answers);
    tx.exam.findUnique.mockResolvedValue(null);
    await expect(service.createKey(input, admin)).rejects.toThrow("İmtahan tapılmadı");
    expect(tx.omrAnswerKey.create).not.toHaveBeenCalled();
  });
});

describe("OMR classroom scanning limit", () => {
  it("allows a full class of individual phone scans but retains an hourly cap", async () => {
    const create = vi.fn().mockRejectedValue(new Error("CREATE_REACHED"));
    const count = vi.fn().mockResolvedValue(239);
    const tx = { $queryRawUnsafe: vi.fn(), omrUpload: { findUnique: vi.fn().mockResolvedValue(null), count,
      aggregate: vi.fn().mockResolvedValue({ _sum: { size: 0 } }), create } };
    const prisma = { exam: { findUnique: vi.fn().mockResolvedValue({ resultsPublishedAt: null }) },
      $transaction: (callback: (value: unknown) => unknown) => callback(tx) };
    const service = new OmrService(prisma as never, {} as never);
    const file = { buffer: Buffer.from([255, 216, 255]), size: 3, originalname: "scan.jpg", mimetype: "image/jpeg" };
    await expect(service.upload(input.examId, [file], admin)).rejects.toThrow("CREATE_REACHED");
    create.mockClear(); count.mockResolvedValue(240);
    await expect(service.upload(input.examId, [file], admin)).rejects.toThrow("240 skan limiti");
    expect(create).not.toHaveBeenCalled();
  });
});
