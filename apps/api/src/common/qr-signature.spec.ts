import { afterEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { signTicketToken, verifySignedTicketToken } from "./qr-signature";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

describe("ticket QR signature", () => {
  const token = randomBytes(32).toString("base64url");

  it("round-trips a signed token", () => {
    process.env.QR_SIGNING_SECRET = "a".repeat(48);
    expect(verifySignedTicketToken(signTicketToken(token))).toBe(token);
  });

  it("rejects unsigned, altered and foreign-key signatures", () => {
    process.env.QR_SIGNING_SECRET = "a".repeat(48);
    const signed = signTicketToken(token);
    expect(verifySignedTicketToken(token)).toBeNull();
    const [raw, sig] = signed.split(".");
    const flipped = sig[0] === "A" ? "B" + sig.slice(1) : "A" + sig.slice(1);
    expect(verifySignedTicketToken(`${raw}.${flipped}`)).toBeNull();
    const otherToken = randomBytes(32).toString("base64url");
    expect(verifySignedTicketToken(`${otherToken}.${sig}`)).toBeNull();
    process.env.QR_SIGNING_SECRET = "b".repeat(48);
    expect(verifySignedTicketToken(signed)).toBeNull();
  });

  it("rejects malformed input", () => {
    process.env.QR_SIGNING_SECRET = "a".repeat(48);
    for (const value of [undefined, 42, "", "x.y", `${token}.`, `${token}.${token}.${token}`])
      expect(verifySignedTicketToken(value)).toBeNull();
  });

  it("refuses to sign in production without a dedicated secret", () => {
    process.env.NODE_ENV = "production";
    delete process.env.QR_SIGNING_SECRET;
    process.env.JWT_SECRET = "j".repeat(48);
    expect(() => signTicketToken(token)).toThrow(/QR_SIGNING_SECRET/);
  });
});
