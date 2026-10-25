export const QEPIK_PER_AZN = 100;

/**
 * Monetary values are stored and exchanged as non-negative integer qəpik.
 * 0 is an explicit free amount; null means "not configured".
 */
export function isValidQepikPrice(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isInteger(value) && value >= 0;
}

export function qepikToAzn(qepik: number): number {
  if (!isValidQepikPrice(qepik)) {
    throw new RangeError("Qiymət qəpik ilə mənfi olmayan tam ədəd olmalıdır");
  }
  return qepik / QEPIK_PER_AZN;
}
