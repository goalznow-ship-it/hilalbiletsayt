import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL tələb olunur.");
}
const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
if (!databaseName.endsWith("_test")) {
  throw new Error("Migration tests require an isolated *_test database.");
}

const schema = `price_migration_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
const client = new Client({ connectionString: databaseUrl });

beforeAll(async () => {
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET search_path TO "${schema}"`);
  await client.query(`
    CREATE TABLE exams (
      id text PRIMARY KEY,
      code text UNIQUE,
      title text,
      price integer NOT NULL DEFAULT 0
    );
    CREATE TABLE tickets (
      id text PRIMARY KEY,
      code text UNIQUE,
      price integer NOT NULL
    );
    INSERT INTO exams (id, code, title, price) VALUES
      ('exam-1', 'EX-1', 'Old paid exam', 35),
      ('exam-2', 'EX-2', 'Old free exam', 0);
    INSERT INTO tickets (id, code, price) VALUES
      ('ticket-1', 'T-1', 35),
      ('ticket-2', 'T-2', 0);
  `);
});

afterAll(async () => {
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await client.end();
});

describe("price unit migration", () => {
  it("converts existing prices and makes unset exam prices explicit", async () => {
    const migrationPath = resolve(
      process.cwd(),
      "prisma/migrations/20261025223000_price_unit_qepik/migration.sql",
    );
    const migration = readFileSync(migrationPath, "utf8");
    await client.query(migration);

    const exams = await client.query(`SELECT id, price FROM exams ORDER BY id`);
    expect(exams.rows[0]).toMatchObject({ id: "exam-1", price: 3500 });
    expect(exams.rows[1]).toMatchObject({ id: "exam-2", price: null });

    const tickets = await client.query(`SELECT id, price FROM tickets ORDER BY id`);
    expect(tickets.rows[0]).toMatchObject({ id: "ticket-1", price: 3500 });
    expect(tickets.rows[1]).toMatchObject({ id: "ticket-2", price: 0 });
  });
});
