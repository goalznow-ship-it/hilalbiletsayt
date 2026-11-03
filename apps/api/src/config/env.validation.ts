import { z } from "zod";

// Values that must never reach production: the old compose default and the
// placeholders shipped in .env.example.
const KNOWN_WEAK_SECRETS = new Set([
  "your-very-secure-secret-at-least-32-characters-long",
]);
const isPlaceholder = (value: string | undefined) =>
  !!value && (KNOWN_WEAK_SECRETS.has(value) || /change[-_]?me/i.test(value));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CORS_ORIGIN: z.string().optional(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  OMR_WORKER_URL: z.string().url().refine(
    value => value.startsWith("http://") || value.startsWith("https://"),
    "OMR_WORKER_URL must use HTTP or HTTPS",
  ).default("http://127.0.0.1:8000"),

  OMR_WORKER_SECRET: z.string()
    .min(32, "OMR_WORKER_SECRET must be at least 32 characters")
    .optional(),

  OMR_STORAGE_DIR: z.string().min(1).optional(),

  API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(100000).optional(),
  AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(100000).optional(),

  /// HMAC key for ticket QR payloads. Derived from JWT_SECRET outside production.
  QR_SIGNING_SECRET: z.string()
    .min(32, "QR_SIGNING_SECRET must be at least 32 characters")
    .optional(),

  /// First super administrator, created once on startup when no SUPER_ADMIN exists.
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string()
    .min(12, "BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters")
    .optional(),
  BOOTSTRAP_ADMIN_NAME: z.string().min(1).max(120).optional(),
  BOOTSTRAP_BRANCH_CODE: z.string().regex(/^[A-Z0-9_-]{2,32}$/).optional(),
  BOOTSTRAP_BRANCH_NAME: z.string().min(1).max(120).optional(),
}).superRefine((config, context) => {
  if (!!config.BOOTSTRAP_ADMIN_EMAIL !== !!config.BOOTSTRAP_ADMIN_PASSWORD) {
    context.addIssue({
      code: "custom",
      path: ["BOOTSTRAP_ADMIN_PASSWORD"],
      message: "BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set together",
    });
  }

  if (config.NODE_ENV === "production") {
    for (const key of ["JWT_SECRET", "OMR_WORKER_SECRET", "QR_SIGNING_SECRET", "BOOTSTRAP_ADMIN_PASSWORD"] as const) {
      if (isPlaceholder(config[key])) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: `${key} still has a placeholder or known default value`,
        });
      }
    }

    if (!config.QR_SIGNING_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["QR_SIGNING_SECRET"],
        message: "QR_SIGNING_SECRET is required in production",
      });
    } else if (config.QR_SIGNING_SECRET === config.JWT_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["QR_SIGNING_SECRET"],
        message: "QR_SIGNING_SECRET must differ from JWT_SECRET",
      });
    }

    if (!config.CORS_ORIGIN) {
      context.addIssue({
        code: "custom",
        path: ["CORS_ORIGIN"],
        message: "CORS_ORIGIN is required in production",
      });
    }

    if (!config.OMR_WORKER_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["OMR_WORKER_SECRET"],
        message: "OMR_WORKER_SECRET is required in production",
      });
    }

    if (!config.OMR_STORAGE_DIR) {
      context.addIssue({
        code: "custom",
        path: ["OMR_STORAGE_DIR"],
        message: "OMR_STORAGE_DIR is required in production",
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(issue => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return parsed.data;
}
