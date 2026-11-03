import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.validation";

const baseEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://hilal:hilal@localhost:5432/hilal_test",
  JWT_SECRET: "x".repeat(32),
};

describe("validateEnv OMR configuration", () => {
  it("uses the local worker URL by default", () => {
    const result = validateEnv(baseEnv);

    expect(result.OMR_WORKER_URL).toBe("http://127.0.0.1:8000");
  });

  it("rejects a short worker secret", () => {
    expect(() =>
      validateEnv({ ...baseEnv, OMR_WORKER_SECRET: "short" }),
    ).toThrow(/32 characters/);
  });

  it("requires worker secret and persistent storage in production", () => {
    expect(() =>
      validateEnv({ ...baseEnv, NODE_ENV: "production" }),
    ).toThrow(/OMR_WORKER_SECRET/);
  });

  it("accepts complete production OMR configuration", () => {
    const result = validateEnv({
      ...baseEnv,
      NODE_ENV: "production",
      OMR_WORKER_URL: "http://omr-worker:8000",
      OMR_WORKER_SECRET: "s".repeat(64),
      OMR_STORAGE_DIR: "/var/lib/hilal/omr",
    });

    expect(result.OMR_WORKER_SECRET).toHaveLength(64);
    expect(result.OMR_STORAGE_DIR).toBe("/var/lib/hilal/omr");
  });

  it("rejects non-HTTP worker URLs", () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        OMR_WORKER_URL: "ftp://localhost:8000",
      }),
    ).toThrow(/HTTP or HTTPS/);
  });
});
