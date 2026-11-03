import { createHmac, timingSafeEqual } from "node:crypto";

// Ticket QR payloads are "<token>.<signature>". The token is the random value
// stored on the ticket; the signature is HMAC-SHA256 over it, so a QR code
// cannot be forged or altered without the server secret, and forged codes are
// rejected before any database lookup.
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const SIGNED = /^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/;

function secret(): string {
  const configured = process.env.QR_SIGNING_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production")
    throw new Error("QR_SIGNING_SECRET is required in production");
  const jwt = process.env.JWT_SECRET;
  if (!jwt) throw new Error("QR_SIGNING_SECRET or JWT_SECRET is required");
  // Domain-separated development key; never used in production.
  return createHmac("sha256", jwt).update("hilal-qr-dev-key-v1").digest("hex");
}

function mac(token: string): string {
  return createHmac("sha256", secret()).update(`ticket:${token}`).digest("base64url");
}

export function signTicketToken(token: string): string {
  if (!TOKEN.test(token)) throw new Error("Invalid ticket token");
  return `${token}.${mac(token)}`;
}

/** Returns the stored token when the signature is valid, otherwise null. */
export function verifySignedTicketToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = SIGNED.exec(value.trim());
  if (!match) return null;
  const expected = Buffer.from(mac(match[1]));
  const actual = Buffer.from(match[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual)
    ? match[1]
    : null;
}
