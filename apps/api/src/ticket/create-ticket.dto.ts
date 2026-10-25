import { Type } from "class-transformer";
import {
  IsUUID,
  IsNotEmpty,
  IsInt,
  IsString,
  IsOptional,
  IsIn,
  Min,
} from "class-validator";

export class CreateTicketDto {
  @IsUUID()
  @IsNotEmpty()
  examId!: string;

  @IsUUID()
  @IsOptional()
  sessionId?: string;

  @IsUUID()
  @IsOptional()
  candidateId?: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  /**
   * Kept for backwards compatibility. The server always uses the exam's
   * configured price in qəpik; a mismatching value is rejected.
   */
  @IsInt()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsString()
  @IsOptional()
  type?: string;

  @IsIn(["CASH", "CARD", "BANK_TRANSFER"])
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @IsOptional()
  paymentDate?: string;
}

export class UpdateTicketDto {
  @IsString()
  @IsOptional()
  status?: string;

  @IsInt()
  @IsOptional()
  price?: number;

  @IsString()
  @IsOptional()
  paymentMethod?: string;
}

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

  @IsIn(["ACTIVE", "USED", "CANCELLED"])
  @IsOptional()
  status?: string;

  @IsInt()
  @IsOptional()
  page?: number;

  @IsInt()
  @IsOptional()
  limit?: number;
}