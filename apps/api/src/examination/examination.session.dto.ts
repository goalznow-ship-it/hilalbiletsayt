import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";

export const SESSION_STATUSES = [
  "PLANNED",
  "OPEN",
  "CLOSED",
  "CANCELLED",
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

export class ExamSessionQueryDto {
  @IsUUID()
  @IsOptional()
  examId?: string;

  @IsIn(SESSION_STATUSES)
  @IsOptional()
  status?: SessionStatus;
}

export class CreateExamSessionDto {
  @IsUUID()
  examId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  sessionCode!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  venue?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number;
}

export class UpdateExamSessionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  capacity?: number;

  @IsIn(["OPEN", "CLOSED", "CANCELLED"])
  @IsOptional()
  status?: Exclude<SessionStatus, "PLANNED">;
}
