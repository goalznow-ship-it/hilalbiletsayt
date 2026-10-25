import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 5;
const MAX_ARRAY_ITEMS = 50;

const SENSITIVE_KEY_PARTS = [
  "password",
  "passwordhash",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "privatekey",
  "apikey",
  "authorization",
  "cookie",
  "email",
  "phone",
  "fullname",
  "address",
  "birthdate",
  "passport",
  "iban",
  "cardnumber",
  "cvv",
  "pin",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

function sanitizeValue(
  value: unknown,
  depth: number,
): Prisma.InputJsonValue | null | undefined {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return "[TRUNCATED]";

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1) ?? null);
  }

  if (isRecord(value)) {
    return sanitizeRecord(value, depth + 1);
  }

  return undefined;
}

type SanitizedJsonObject = { [key: string]: Prisma.InputJsonValue | null };

function sanitizeRecord(
  record: Record<string, unknown>,
  depth: number,
): SanitizedJsonObject {
  const sanitized: SanitizedJsonObject = {};

  for (const [key, value] of Object.entries(record)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = REDACTED;
      continue;
    }

    const safeValue = sanitizeValue(value, depth);
    if (safeValue !== undefined) {
      sanitized[key] = safeValue;
    }
  }

  return sanitized;
}

export function sanitizeAuditMetadata(
  metadata?: Record<string, unknown>,
): SanitizedJsonObject | undefined {
  if (!metadata) return undefined;
  return sanitizeRecord(metadata, 0);
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    action: string,
    actorId?: string,
    targetType?: string,
    targetId?: string,
    metadata?: Record<string, unknown>,
    client: Pick<Prisma.TransactionClient, "auditLog"> = this.prisma,
  ): Promise<void> {
    const safeMetadata = sanitizeAuditMetadata(metadata);

    await client.auditLog.create({
      data: {
        action,
        actorId: actorId ?? null,
        entityType: targetType ?? "Unknown",
        entityId: targetId ?? null,
        metadata: safeMetadata,
      },
    });
  }
}
