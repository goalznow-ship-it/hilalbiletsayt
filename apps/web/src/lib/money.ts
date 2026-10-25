export const QEPIK_PER_AZN = 100;

export function isValidQepikPrice(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isInteger(value) && value >= 0;
}

export function formatAzn(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Qiymət təyin edilməyib";
  if (!Number.isInteger(value) || value < 0) return "—";

  if (value === 0) return "Pulsuz";

  return `${(value / QEPIK_PER_AZN).toFixed(2)} AZN`;
}
