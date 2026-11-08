import { Type } from "class-transformer";
import { IsUUID, IsOptional, IsInt, IsIn, Matches } from "class-validator";

export const TICKET_STATUSES = ["ACTIVE", "USED", "CANCELLED"] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export class TicketQueryDto {
  @IsUUID() @IsOptional() sellerId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;

  @IsUUID()
  @IsOptional()
  examId?: string;

  @IsUUID()
  @IsOptional()
  sessionId?: string;

  @IsUUID()
  @IsOptional()
  candidateId?: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsIn(TICKET_STATUSES)
  @IsOptional()
  status?: TicketStatus;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  limit?: number;
}
