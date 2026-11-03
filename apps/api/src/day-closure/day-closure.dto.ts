import { IsOptional, IsUUID, Matches } from "class-validator";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CloseDayDto {
  @IsUUID()
  branchId!: string;

  /** Asia/Baku business date; defaults to today. */
  @IsOptional()
  @Matches(ISO_DATE)
  date?: string;
}

export class DayClosureQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Matches(ISO_DATE)
  from?: string;

  @IsOptional()
  @Matches(ISO_DATE)
  to?: string;
}

export class DayPreviewQueryDto {
  @IsUUID()
  branchId!: string;

  @IsOptional()
  @Matches(ISO_DATE)
  date?: string;
}
