import { describe, expect, it } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateQuestionDto } from "./question.dto";

const input = {
  examId: "485693f7-0bbb-4b8b-8836-b99e6841be3c",
  question: "2 + 2 = ?",
  variants: "A) 3|B) 4",
  correct: 2,
};

describe("Question input defaults", () => {
  it("defaults omitted points and active status without invalid decorators", async () => {
    const dto = plainToInstance(CreateQuestionDto, input);
    expect(dto.points).toBe(1);
    expect(dto.isActive).toBe(true);
    expect(await validate(dto)).toHaveLength(0);
  });

  it("rejects invalid explicit values instead of replacing them with defaults", async () => {
    const dto = plainToInstance(CreateQuestionDto, { ...input, points: 0, isActive: "false" });
    const errors = await validate(dto);
    expect(errors.map(error => error.property).sort()).toEqual(["isActive", "points"]);
  });
});
