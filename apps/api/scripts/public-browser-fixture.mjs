import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
const databaseUrl = process.env.DATABASE_URL;
if (
  !databaseUrl ||
  !new URL(databaseUrl).pathname.endsWith("_test") ||
  !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)
)
  throw new Error("Local isolated test database required");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
try {
  const branch = await prisma.branch.create({
    data: {
      name: "Brauzer yoxlama filialı",
      code: randomUUID(),
      address: "Lokal test ünvanı",
      phone: "0501234567",
    },
  });
  const role = await prisma.role.upsert({
    where: { name: "SUPER_ADMIN" },
    update: {},
    create: { name: "SUPER_ADMIN" },
  });
  const user = await prisma.user.upsert({
    where: { email: "browser@example.invalid" },
    update: {},
    create: {
      email: "browser@example.invalid",
      fullName: "Brauzer Administrator",
      passwordHash: await argon2.hash("Local-browser-test-123!"),
    },
  });
  await prisma.userBranchRole.create({
    data: { userId: user.id, branchId: branch.id, roleId: role.id },
  });
  const exam = await prisma.exam.create({
    data: {
      code: "BROWSER-" + randomUUID().slice(0, 8),
      title: "Brauzer sınaq imtahanı",
      description: "Yalnız lokal real alış sınağı üçün.",
      price: 3575,
      status: "PUBLISHED",
      createdBy: user.id,
    },
  });
  const session = await prisma.examSession.create({
    data: {
      examId: exam.id,
      sessionCode: "BROWSER-OPEN",
      startsAt: new Date(Date.now() + 86400000 * 3),
      endsAt: new Date(Date.now() + 86400000 * 3 + 7200000),
      venue: "Yoxlama zalı",
      capacity: 3,
      status: "OPEN",
    },
  });
  const closed = await prisma.examSession.create({
    data: {
      examId: exam.id,
      sessionCode: "BROWSER-CLOSED",
      startsAt: new Date(Date.now() + 86400000 * 3),
      endsAt: new Date(Date.now() + 86400000 * 3 + 7200000),
      capacity: 1,
      status: "CLOSED",
    },
  });
  writeFileSync(
    "/tmp/hilal-sales/browser-fixture.json",
    JSON.stringify({
      branchId: branch.id,
      examId: exam.id,
      sessionId: session.id,
      closedId: closed.id,
      examCode: exam.code,
    }),
  );
  console.log(
    "Added isolated local browser fixtures; no existing rows removed.",
  );
} finally {
  await prisma.$disconnect();
}
