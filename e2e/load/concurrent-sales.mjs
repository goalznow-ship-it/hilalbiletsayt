#!/usr/bin/env node
// Load test: many sellers hammer one session with concurrent sales, including
// repeated attempts for the same candidate. Proves that the system never
// sells more seats than the capacity and never issues two live tickets to
// one candidate for one session.
//
//   API_URL=http://localhost:3001 ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm --filter @hilal/e2e load
//
// The API must run with a high API_RATE_LIMIT_PER_MINUTE: all requests come
// from one address. Exit code 0 = invariants hold, 1 = violation, 2 = setup error.
import autocannon from "autocannon";
import { api, seedSalesFixture } from "../lib/api.mjs";

const env = (name, fallback) => process.env[name] ?? fallback;
const API_URL = env("API_URL", "http://localhost:3001");
const CAPACITY = Number(env("CAPACITY", 50));
const CANDIDATES = Number(env("CANDIDATES", 200));
const ATTEMPTS_PER_CANDIDATE = Number(env("ATTEMPTS_PER_CANDIDATE", 3));
const CONNECTIONS = Number(env("CONNECTIONS", 64));
const SELLERS = Number(env("SELLERS", 4));
const PASSWORD = env("LOAD_USER_PASSWORD", "load-test-password-1");

async function main() {
  const client = api(API_URL);
  const admin = await client.login(env("ADMIN_EMAIL"), env("ADMIN_PASSWORD"));
  const { branch, staff, exam, session } = await seedSalesFixture(client, admin, {
    capacity: CAPACITY, sellers: SELLERS, password: PASSWORD,
  });
  const candidates = [];
  for (let i = 0; i < CANDIDATES; i += 1) {
    const created = await client.call("POST", "/candidates", {
      token: admin, body: { full_name: `Yük Namizəd ${i + 1}`, branch_id: branch.id },
    });
    candidates.push(created.id);
  }

  // Every candidate is attempted several times by different sellers, interleaved.
  const plan = [];
  for (let round = 0; round < ATTEMPTS_PER_CANDIDATE; round += 1)
    candidates.forEach((candidateId, index) => plan.push({ candidateId, seller: (index + round) % staff.length }));
  for (let i = plan.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }

  let cursor = 0;
  const statuses = {};
  const started = Date.now();
  const result = await autocannon({
    url: API_URL,
    connections: CONNECTIONS,
    amount: plan.length,
    timeout: 30,
    requests: [{
      method: "POST",
      path: "/api/ticket",
      setupRequest: (request) => {
        const item = plan[cursor++ % plan.length];
        return {
          ...request,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${staff[item.seller].token}` },
          body: JSON.stringify({ examId: exam.id, sessionId: session.id, candidateId: item.candidateId }),
        };
      },
      onResponse: (status) => { statuses[status] = (statuses[status] ?? 0) + 1; },
    }],
  });
  const elapsed = (Date.now() - started) / 1000;

  // Read back every ticket of the session through the API.
  const tickets = [];
  for (let page = 1; ; page += 1) {
    const batch = await client.call("GET", `/ticket?sessionId=${session.id}&page=${page}&limit=100`, { token: admin });
    tickets.push(...batch.data);
    if (batch.data.length < 100) break;
  }
  const live = tickets.filter((t) => t.status === "ACTIVE" || t.status === "USED");
  const uniqueCandidates = new Set(live.map((t) => t.candidateId)).size;
  const created = statuses[201] ?? 0;
  const expected = Math.min(CAPACITY, CANDIDATES);
  const unexpected = Object.keys(statuses).filter((code) => !["201", "400", "409"].includes(code));

  const report = {
    requests: plan.length, connections: CONNECTIONS, sellers: SELLERS, capacity: CAPACITY,
    candidates: CANDIDATES, durationSeconds: Number(elapsed.toFixed(2)),
    requestsPerSecond: Math.round(result.requests.average),
    latencyMs: { p50: result.latency.p50, p97_5: result.latency.p97_5, max: result.latency.max },
    statuses, errors: result.errors, timeouts: result.timeouts,
    ticketsInDatabase: live.length, uniqueCandidates,
    invariants: {
      noOversell: live.length <= CAPACITY,
      noDuplicates: uniqueCandidates === live.length,
      allSeatsSold: live.length === expected,
      createdMatchesStored: created === live.length,
      onlyExpectedStatuses: unexpected.length === 0 && result.errors === 0,
    },
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(Object.values(report.invariants).every(Boolean) ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
