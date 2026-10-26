import { Transform } from "class-transformer";
import { IsString, IsUUID, Length, Matches } from "class-validator";

export class PublicPurchaseDto {
  @IsUUID("4", { message: "Sifariş açarı düzgün deyil." })
  purchaseKey!: string;

  @IsUUID(undefined, { message: "Sessiya seçin." })
  sessionId!: string;

  @IsUUID(undefined, { message: "Filial seçin." })
  branchId!: string;

  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value,
  )
  @IsString()
  @Length(3, 150, { message: "Ad və soyad 3–150 simvol olmalıdır." })
  fullName!: string;

  @Transform(({ value }) =>
    typeof value === "string" ? value.replace(/[\s()-]/g, "") : value,
  )
  @Matches(/^(?:\+994|0)(?:10|50|51|55|60|70|77|99)\d{7}$/, {
    message: "Düzgün Azərbaycan mobil nömrəsi daxil edin.",
  })
  phone!: string;
}
