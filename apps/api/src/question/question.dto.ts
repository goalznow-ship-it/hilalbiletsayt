import {
  IsUUID,
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  IsUrl,
} from "class-validator";
import { Transform, Type } from "class-transformer";

class QuestionMetadataDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  subject?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  topic?: string | null;

  @IsOptional()
  @IsUrl({ protocols: ["https"], require_protocol: true, disallow_auth: true })
  @MaxLength(2048)
  imageUrl?: string | null;
}

export class CreateQuestionDto extends QuestionMetadataDto {
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

export class UpdateQuestionDto extends QuestionMetadataDto {
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
  @Transform(({ value }) => value === "true" ? true : value === "false" ? false : value)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  topic?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class RandomQuestionDto {
  @IsUUID()
  examId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(150)
  count!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(5)
  choiceCount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  topic?: string;
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
