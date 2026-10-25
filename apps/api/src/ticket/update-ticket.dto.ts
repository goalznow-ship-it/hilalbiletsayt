import { Type } from "class-transformer";
import {
  IsUUID,
  IsOptional,
  IsInt,
  IsString,
  IsNotEmpty,
  IsBoolean,
} from "class-validator";

export class UpdateTicketDto {
  @IsUUID()
  @IsOptional()
  status?: string;

  @IsInt()
  @IsOptional()
  price?: number;

  @IsString()
  @IsOptional()
  paymentMethod?: string;
}