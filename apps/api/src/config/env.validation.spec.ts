import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.validation";

const productionSecrets = {
  QR_SIGNING_SECRET: "q".repeat(48),
  CORS_ORIGIN: "https://bilet.example.az",
};

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
      ...productionSecrets,
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

describe("validateEnv production secrets", () => {
  const production = {
    ...baseEnv,
    ...productionSecrets,
    NODE_ENV: "production",
    OMR_WORKER_SECRET: "s".repeat(64),
    OMR_STORAGE_DIR: "/var/lib/hilal/omr",
  };

  it("requires a QR signing secret distinct from the JWT secret", () => {
    expect(() => validateEnv({ ...production, QR_SIGNING_SECRET: undefined })).toThrow(/QR_SIGNING_SECRET is required/);
    expect(() => validateEnv({ ...production, QR_SIGNING_SECRET: baseEnv.JWT_SECRET })).toThrow(/must differ/);
  });

  it("requires an explicit CORS origin", () => {
    expect(() => validateEnv({ ...production, CORS_ORIGIN: undefined })).toThrow(/CORS_ORIGIN/);
  });

  it("rejects the old compose default and .env.example placeholders", () => {
    expect(() => validateEnv({ ...production, JWT_SECRET: "your-very-secure-secret-at-least-32-characters-long" })).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...production, OMR_WORKER_SECRET: "change-me-omr-worker-secret-0000000000" })).toThrow(/OMR_WORKER_SECRET/);
    expect(() => validateEnv({ ...production, DATABASE_URL: "postgresql://hilal:change-me-postgres-password@postgres:5432/hilal" })).toThrow(/DATABASE_URL/);
  });

  it("requires bootstrap admin email and password together", () => {
    expect(() => validateEnv({ ...baseEnv, BOOTSTRAP_ADMIN_EMAIL: "admin@example.az" })).toThrow(/set together/);
    expect(() => validateEnv({ ...baseEnv, BOOTSTRAP_ADMIN_EMAIL: "admin@example.az", BOOTSTRAP_ADMIN_PASSWORD: "short" })).toThrow(/12 characters/);
    expect(validateEnv({ ...baseEnv, BOOTSTRAP_ADMIN_EMAIL: "admin@example.az", BOOTSTRAP_ADMIN_PASSWORD: "a-long-password-1" }).BOOTSTRAP_ADMIN_EMAIL).toBe("admin@example.az");
  });
});
