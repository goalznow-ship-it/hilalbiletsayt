import { z } from "zod";

const penalty = z.number().finite().min(-1000).max(0).multipleOf(.001);
export const scoringSchema = z.object({
  wrong: penalty.default(0), unanswered: penalty.default(0), multiple: penalty.default(0),
  floorAtZero: z.boolean().default(true),
}).strict();
export const keySchema = z.object({
  examId: z.uuid(), variant: z.string().regex(/^[A-Z0-9_-]{1,16}$/),
  questionIds: z.array(z.uuid()).min(1).max(150).refine(ids => new Set(ids).size === ids.length),
  choiceCount: z.number().int().min(2).max(5), scoring: scoringSchema,
}).strict();
export const issueSchema = z.object({ ticketId: z.uuid(), answerKeyId: z.uuid() }).strict();
export const answerSchema = z.object({
  question: z.number().int().min(1).max(150), state: z.enum(["MARKED", "BLANK", "MULTIPLE", "UNCERTAIN"]),
  selected: z.enum(["A", "B", "C", "D", "E"]).nullable(),
  marked: z.array(z.enum(["A", "B", "C", "D", "E"])).max(5),
  confidence: z.number().min(0).max(1), fillRatios: z.array(z.number().min(0).max(1)).min(2).max(5),
});
export const pageSchema = z.object({
  pageIndex: z.number().int().min(0).max(9), engineVersion: z.literal("1.0.0"),
  templateVersion: z.literal("hilal-a4-v1"), sheetToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/).nullable(),
  questionCount: z.number().int().min(1).max(150).optional(), choiceCount: z.number().int().min(2).max(5).optional(),
  answers: z.array(answerSchema).max(150), confidence: z.number().min(0).max(1),
  status: z.enum(["READ", "REVIEW"]), reviewFlags: z.array(z.string().max(80)).max(20),
  metadata: z.record(z.string(), z.unknown()),
});
export const workerResultSchema = z.object({ files: z.array(z.object({
  status: z.enum(["READ", "REVIEW", "REJECTED"]), pages: z.array(pageSchema).max(10),
  error: z.string().max(100).optional(),
})).length(1) });
export type ReadPage = z.infer<typeof pageSchema>;
export type KeyAnswer = { questionId: string; correct: string; points: number };
export type Rules = z.infer<typeof scoringSchema>;

export function scorePage(page: ReadPage, key: KeyAnswer[], rules: Rules, choices: number) {
  if (page.answers.length !== key.length || page.questionCount !== key.length || page.choiceCount !== choices)
    throw new Error("TEMPLATE_KEY_MISMATCH");
  const flags = new Set(page.reviewFlags);
  let ticks = 0;
  const outcomes = page.answers.map((a, i) => {
    if (a.question !== i + 1 || a.fillRatios.length !== choices ||
        a.marked.some(c => "ABCDE".indexOf(c) >= choices) || new Set(a.marked).size !== a.marked.length ||
        (a.state === "MARKED" && (a.marked.length !== 1 || a.selected !== a.marked[0])) ||
        (a.state === "BLANK" && (a.marked.length || a.selected !== null)) ||
        (a.state === "MULTIPLE" && (a.marked.length < 2 || a.selected !== null)))
      throw new Error("INCONSISTENT_RECOGNITION");
    if (a.confidence < .85) flags.add("LOW_CONFIDENCE");
    const outcome = a.state === "MARKED" ? (a.selected === key[i].correct ? "CORRECT" : "WRONG") : a.state;
    const value = outcome === "CORRECT" ? key[i].points : outcome === "WRONG" ? rules.wrong :
      outcome === "BLANK" ? rules.unanswered : outcome === "MULTIPLE" ? rules.multiple : null;
    if (a.state === "UNCERTAIN" || a.state === "MULTIPLE") flags.add(a.state);
    if (value !== null) ticks += Math.round(value * 1000);
    return { question: i + 1, outcome, points: value };
  });
  if (rules.floorAtZero) ticks = Math.max(0, ticks);
  if (page.status === "REVIEW") flags.add("RECOGNITION_REVIEW");
  return { score: flags.size ? null : ticks / 1000, provisionalScore: ticks / 1000,
    maximumScore: key.reduce((sum, a) => sum + a.points, 0), outcomes, reviewFlags: [...flags] };
}
