import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { authenticatedRequest, ApiError } from "../src/lib/request.ts";
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
for (const path of [
  "/users",
  "/api/users",
  "/ticket?branchId=test",
  "/api/ticket?branchId=test",
  "/branches",
  "/exams?status=PUBLISHED",
  "/exam-sessions",
  "/candidates?page=2",
  "/registrations",
]) {
  test(`authenticated path ${path} uses exactly one API prefix and Bearer value`, async () => {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, `/api${path.replace(/^\/api(?=\/|$)/, "")}`);
      assert.equal(
        options.headers.get("Authorization"),
        "Bearer real-contract-test",
      );
      assert.equal(
        [...options.headers.keys()].filter(
          (key) => key.toLowerCase() === "authorization",
        ).length,
        1,
      );
      assert.equal(options.headers.get("X-Test"), "preserved");
      return Response.json({ data: [] });
    };
    assert.deepEqual(
      await authenticatedRequest("real-contract-test", path, {
        headers: { Authorization: "overridden", "X-Test": "preserved" },
      }),
      { data: [] },
    );
  });
}
test("preserves conflict status and useful validation message", async () => {
  globalThis.fetch = async () =>
    Response.json(
      { message: "Bu e-poçt ünvanı ilə namizəd artıq mövcuddur" },
      { status: 409 },
    );
  await assert.rejects(
    authenticatedRequest("test", "/candidates"),
    (error) =>
      error instanceof ApiError &&
      error.status === 409 &&
      error.message.includes("e-poçt"),
  );
});
test("clears session on 401 and rejects without a token before network access", async () => {
  let calls = 0;
  let cleared = false;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({}, { status: 401 });
  };
  await assert.rejects(
    authenticatedRequest("test", "/candidates", undefined, () => {
      cleared = true;
    }),
    { status: 401 },
  );
  assert.equal(cleared, true);
  await assert.rejects(authenticatedRequest(null, "/candidates"), {
    status: 401,
  });
  assert.equal(calls, 1);
});
test("does not expose internal server-error details", async () => {
  globalThis.fetch = async () =>
    Response.json({ message: "postgres password=private" }, { status: 500 });
  await assert.rejects(
    authenticatedRequest("test", "/candidates"),
    (error) => error.status === 500 && !error.message.includes("private"),
  );
});
