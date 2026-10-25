import {
  IsOptional,
  IsBoolean,
  IsNotEmpty,
  IsUUID,
  IsIn,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Transform, Type } from "class-transformer";

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
};

export const REGISTRATION_STATUSES = ["ACTIVE", "CANCELLED"] as const;

export class CreateRegistrationDto {
  @IsUUID()
  @IsNotEmpty()
  candidate_id!: string;

  @IsUUID()
  @IsNotEmpty()
  exam_id!: string;

  @IsUUID()
  @IsNotEmpty()
  session_id!: string;

  @IsUUID()
  @IsOptional()
  branch_id?: string;
}

export class UpdateRegistrationDto {
  @IsIn(REGISTRATION_STATUSES)
  status!: "ACTIVE" | "CANCELLED";
}

export class RegistrationSearchDto {
  @IsUUID()
  @IsOptional()
  candidate_id?: string;

  @IsUUID()
  @IsOptional()
  exam_id?: string;

  @IsUUID()
  @IsOptional()
  session_id?: string;

  @IsIn(REGISTRATION_STATUSES)
  @IsOptional()
  status?: "ACTIVE" | "CANCELLED";

  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
