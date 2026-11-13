import { describe, expect, it, vi } from "vitest";
import { ResultsService } from "./results.service";

function setup() {
  const ticket = { examId: "exam", status: "SOLD", candidate: { candidate_number: "QD-123", full_name: "Aysel Məmmədova" },
    exam: { code: "IX-2026", title: "Sınaq imtahanı", resultsPublishedAt: new Date() as Date | null },
    omrSheet: { answerKey: { variant: "B", answers: [{ correct: "C", points: 2 }, { correct: "A", points: 1 }],
      scoring: { wrong: -.25, unanswered: 0, multiple: 0, floorAtZero: true } },
      result: { status: "COMPLETED", data: { score: 1.75, maximumScore: 3,
        identity: { ticketId: "private" }, manualReview: { note: "Private review" },
        answers: [{ question: 1, selected: "C", marked: ["C"], fillRatios: [0, 0, 1] },
          { question: 2, selected: "B", marked: ["B"], fillRatios: [0, 1, 0] }],
        outcomes: [{ question: 1, outcome: "CORRECT", points: 2 }, { question: 2, outcome: "WRONG", points: -.25 }] } } } };
  const prisma = { ticket: { findUnique: vi.fn().mockResolvedValue(ticket) },
    $queryRaw: vi.fn().mockResolvedValue([{ rank: 2, participants: 12 }]) };
  return { service: new ResultsService(prisma as never, {} as never), ticket, prisma };
}

describe("published candidate answer breakdown", () => {
  it("returns only this candidate's choices and immutable key after both lookup factors match", async () => {
    const { service } = setup();
    const result = await service.lookup("HK-123456", "qd-123");
    expect(result).toMatchObject({ variant: "B", correct: 1, wrong: 1, rank: 2, participants: 12,
      answers: [{ question: 1, selected: "C", marked: ["C"], correct: "C", outcome: "CORRECT", points: 2 },
        { question: 2, selected: "B", marked: ["B"], correct: "A", outcome: "WRONG", points: -.25 }] });
    expect(JSON.stringify(result)).not.toMatch(/fillRatios|ticketId|Private review|Aysel/);
  });
  it("never reveals answers for unpublished, unverified, cancelled or pending results", async () => {
    for (const change of [
      (ticket: ReturnType<typeof setup>["ticket"]) => { ticket.exam.resultsPublishedAt = null; },
      (ticket: ReturnType<typeof setup>["ticket"]) => { ticket.candidate.candidate_number = "QD-OTHER"; },
      (ticket: ReturnType<typeof setup>["ticket"]) => { ticket.status = "CANCELLED"; },
      (ticket: ReturnType<typeof setup>["ticket"]) => { ticket.omrSheet.result.status = "REVIEW"; },
    ]) {
      const { service, ticket, prisma } = setup();
      change(ticket);
      await expect(service.lookup("HK-123456", "QD-123")).rejects.toThrow("Nəticə tapılmadı və ya hələ dərc olunmayıb.");
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    }
  });
  it("keeps historical score-only results readable without fabricating selected answers", async () => {
    const { service, ticket } = setup();
    delete (ticket.omrSheet.result.data as Record<string, unknown>).answers;
    expect(await service.lookup("HK-123456", "QD-123")).toMatchObject({ score: 1.75, answers: [] });
  });
});
