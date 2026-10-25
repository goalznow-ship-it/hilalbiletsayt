import { Type } from "class-transformer";
import {
  IsUUID,
  IsNotEmpty,
  IsInt,
  IsString,
  IsOptional,
  IsIn,
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

  @IsInt()
  price!: number;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsOptional()
  paymentMethod?: string;
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