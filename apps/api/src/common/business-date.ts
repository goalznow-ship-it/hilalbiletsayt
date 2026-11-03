// Azerbaijan has used UTC+4 without daylight saving time since 2016.
const BAKU_OFFSET_MS = 4 * 60 * 60 * 1000;

/** Business date (YYYY-MM-DD) in Asia/Baku for an instant. */
export function bakuBusinessDate(instant: Date = new Date()): string {
  return new Date(instant.getTime() + BAKU_OFFSET_MS).toISOString().slice(0, 10);
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
