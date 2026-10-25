import { Type } from "class-transformer";
import {
  IsUUID,
  IsOptional,
  IsInt,
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsIn,
} from "class-validator";

export const TICKET_STATUSES = ["ACTIVE", "USED", "CANCELLED"] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export class TicketQueryDto {
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

  @IsInt()
  @IsOptional()
  page?: number;

  @IsInt()
  @IsOptional()
  limit?: number;
}