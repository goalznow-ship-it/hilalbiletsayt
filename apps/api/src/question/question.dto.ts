import {
  IsUUID,
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsBoolean,
  Min,
  Max,
} from "class-validator";

export class CreateQuestionDto {
  @IsUUID()
  examId!: string;

  @IsString()
  @IsNotEmpty()
  question!: string;

  @IsString()
  @IsNotEmpty()
  variants!: string; // "A) cavab1|B) cavab2|C) cavab3|D) cavab4|E) cavab5"

  @IsInt()
  @Min(1)
  @Max(5)
  correct!: number;

  @IsInt()
  @Min(1)
  points: number = 1;

  @IsBoolean()
  isActive: boolean = true;
}

export class UpdateQuestionDto {
  @IsUUID()
  @IsOptional()
  examId?: string;

  @IsString()
  @IsOptional()
  question?: string;

  @IsString()
  @IsOptional()
  variants?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  correct?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  points?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class QuestionQueryDto {
  @IsUUID()
  @IsOptional()
  examId?: string;

  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  search?: string;
}

export class QuestionView {
  id: string;
  examId: string;
  question: string;
  variants: string;
  correct: number;
  points: number;
  isActive: boolean;
  createdAt: Date;
}
