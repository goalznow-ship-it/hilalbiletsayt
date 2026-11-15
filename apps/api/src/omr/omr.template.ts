import { z } from "zod";

const coordinate = z.number().finite().min(0).max(1);
const grid = z.object({
  left: coordinate, top: coordinate, right: coordinate, bottom: coordinate,
  rows: z.number().int().min(1).max(150), columns: z.number().int().min(2).max(10),
  radius: z.number().finite().min(.002).max(.03),
}).strict().refine(g => g.right > g.left && (g.rows === 1 ? g.bottom === g.top : g.bottom > g.top));
export const templateLayoutSchema = z.object({
  width: z.number().int().min(600).max(2000), height: z.number().int().min(600).max(2000),
  answers: z.array(grid).min(1).max(10), workNumber: grid,
}).strict().refine(l => l.answers.reduce((n, g) => n + g.rows, 0) <= 150 &&
  l.answers.every(g => g.columns >= 2 && g.columns <= 5 && g.columns === l.answers[0].columns) &&
  l.workNumber.rows === 10 && l.workNumber.columns === 8);
export const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(100), answerKeyId: z.uuid(), layout: templateLayoutSchema,
}).strict();
export const templatePreviewSchema = z.object({
  width: z.number().int().min(600).max(2000), height: z.number().int().min(600).max(2000),
  image: z.string().max(4 * 1024 * 1024).regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
