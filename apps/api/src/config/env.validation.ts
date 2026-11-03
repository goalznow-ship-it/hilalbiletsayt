import { z } from "zod";

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
}).superRefine((config, context) => {
  if (config.NODE_ENV === "production") {
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
