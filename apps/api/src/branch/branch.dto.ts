import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";
import { PartialType } from "@nestjs/swagger";

export class CreateBranchDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(1, 160, { message: "Filial adını daxil edin (ən çox 160 simvol)." })
  name!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(1, 40, { message: "Filial kodunu daxil edin (ən çox 40 simvol)." })
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
export class UpdateBranchDto extends PartialType(CreateBranchDto) {}
