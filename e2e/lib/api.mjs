// Minimal API client used by the load test and the Playwright smoke suite to
// seed data through the public HTTP API (no direct database access).
import { randomUUID } from "node:crypto";

export function api(baseUrl) {
  const root = baseUrl.replace(/\/$/, "");
  async function call(method, path, { token, body, raw } = {}) {
    const response = await fetch(`${root}/api${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (raw) return response;
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`);
    return data;
  }
  return {
    root,
    call,
    login: async (email, password) => (await call("POST", "/auth/login", { body: { email, password } })).access_token,
  };
}

const suffix = () => randomUUID().slice(0, 6).toUpperCase();

/** Creates branch(es), staff, a published priced exam and an open session. */
export async function seedSalesFixture(client, adminToken, { capacity, sellers = 1, price = 1500, password }) {
  const t = { token: adminToken };
  const branch = await client.call("POST", "/branches", { ...t, body: { name: `Yük filialı ${suffix()}`, code: `L${suffix()}` } });
  const staff = [];
  for (let i = 0; i < sellers; i += 1) {
    const email = `seller-${suffix().toLowerCase()}@load.test`;
    await client.call("POST", "/users", { ...t, body: { email, fullName: `Satıcı ${i + 1}`, password, role: "SELLER", branchIds: [branch.id] } });
    staff.push({ email, token: await client.login(email, password) });
  }
  const exam = await client.call("POST", "/exams", { ...t, body: { code: `LOAD-${suffix()}`, title: "Yük testi imtahanı", price } });
  await client.call("PATCH", `/exams/${exam.id}/publish`, t);
  const startsAt = new Date(Date.now() + 14 * 864e5);
  const session = await client.call("POST", "/exam-sessions", {
    ...t,
    body: {
      examId: exam.id, sessionCode: `S-${suffix()}`, capacity, venue: "Zal 1",
      startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 2 * 3600e3).toISOString(),
    },
  });
  await client.call("PATCH", `/exam-sessions/${session.id}`, { ...t, body: { status: "OPEN" } });
  return { branch, staff, exam, session };
}
