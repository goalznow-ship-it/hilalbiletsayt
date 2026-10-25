import {
  IsString,
  ValidateIf,
  IsOptional,
  IsBoolean,
  IsNotEmpty,
  Length,
  IsEmail,
  IsInt,
  IsUUID,
  MaxLength,
  Matches,
  Min,
  Max,
} from "class-validator";
import { Transform, Type } from "class-transformer";

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
};

const PHONE_PATTERN = /^[+0-9()\-\s]{7,20}$/;

export class CreateCandidateDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @Length(3, 100)
  full_name!: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(254)
  email?: string | null;

  @IsString()
  @IsOptional()
  @Matches(PHONE_PATTERN, { message: "Telefon nömrəsi düzgün deyil" })
  phone?: string | null;

  @IsBoolean()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  is_active?: boolean;

  @IsUUID()
  @IsOptional()
  branch_id?: string | null;
}

export class UpdateCandidateDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Length(3, 100)
  full_name?: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(254)
  email?: string | null;

  @IsString()
  @IsOptional()
  @Matches(PHONE_PATTERN, { message: "Telefon nömrəsi düzgün deyil" })
  phone?: string | null;

  @IsBoolean()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  is_active?: boolean;

  @IsUUID()
  @IsOptional()
  branch_id?: string | null;
}

export class CandidateSearchDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  search?: string;

  @Transform(toBoolean)
  @IsBoolean()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
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
