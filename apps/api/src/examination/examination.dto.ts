import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";
export class UpdateExamDto {
  @IsOptional() @IsString() @Length(1, 50) code?: string;
  @IsOptional() @IsString() @Length(1, 200) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) price?: number | null;
  @IsOptional() @IsIn(["DRAFT", "PUBLISHED", "ARCHIVED"]) status?: string;
}
export class CreateExamDto {
  @IsString() @Length(1, 50) code!: string;
  @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) price?: number | null;
  @IsOptional() @IsIn(["DRAFT"]) status?: string;
  @IsOptional() @IsUUID() createdBy?: string;
}
