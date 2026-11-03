import { IsString, Length } from "class-validator";

export class ScanTicketDto {
  /** Signed QR payload, or the verification URL that contains it. */
  @IsString()
  @Length(10, 300)
  qr!: string;
}
