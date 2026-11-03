import { IsString, Length } from "class-validator";

export class ResultLookupDto {
  /** Signed ticket QR payload (or its verification URL) or the printed ticket code. */
  @IsString()
  @Length(6, 300)
  ticket!: string;

  /** Second factor printed on the ticket / known to the candidate. */
  @IsString()
  @Length(3, 64)
  candidateNumber!: string;
}
