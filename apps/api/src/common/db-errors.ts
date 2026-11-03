import { BadRequestException, ConflictException } from "@nestjs/common";

// Database triggers raise these markers (see migration 20261103000000).
export const SESSION_CAPACITY_EXCEEDED = "HILAL_SESSION_CAPACITY_EXCEEDED";
export const BUSINESS_DAY_CLOSED = "HILAL_BUSINESS_DAY_CLOSED";

function describe(error: unknown): { code?: string; text: string } {
  if (!error || typeof error !== "object") return { text: String(error) };
  const record = error as { code?: unknown; message?: unknown; meta?: unknown };
  return {
    code: typeof record.code === "string" ? record.code : undefined,
    text: `${typeof record.message === "string" ? record.message : ""} ${JSON.stringify(record.meta ?? {})}`,
  };
}

/** Translates database invariant violations into HTTP errors; rethrows anything else. */
export function rethrowDbError(error: unknown): never {
  const { code, text } = describe(error);
  if (text.includes(SESSION_CAPACITY_EXCEEDED))
    throw new BadRequestException("Sessiya kapasitəsi doldurulub");
  if (text.includes(BUSINESS_DAY_CLOSED))
    throw new ConflictException(
      "Bu filial üçün iş günü bağlanıb; bu günün satışları dəyişdirilə bilməz.",
    );
  if (code === "P2002" && /candidate_session|candidate_id/.test(text))
    throw new ConflictException(
      "Bu namizəd üçün bu sessiyada bilet artıq yaradılıb",
    );
  throw error;
}
