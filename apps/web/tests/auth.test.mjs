import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createFormControl } from "react-hook-form";
import { authenticate, loginRules } from "../src/lib/auth.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const user = {
  userId: "test-user",
  email: "audit@example.invalid",
  fullName: "UI yoxlaması",
  role: "SELLER",
  branches: [],
};
const token = (exp = Math.floor(Date.now() / 1000) + 900) =>
  `e30.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.test`;
const json = (data, status = 200) => Response.json(data, { status });

test("uses actual login contract, then verifies identity with Bearer token", async () => {
  const jwt = token();
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1 ? json({ access_token: jwt }, 201) : json(user);
  };
  const session = await authenticate(user.email, "synthetic-password");
  assert.equal(session.token, jwt);
  assert.deepEqual(session.user, user);
  assert.ok(session.expiresAt > Date.now());
  assert.equal(calls[0].url, "/api/auth/login");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    email: user.email,
    password: "synthetic-password",
  });
  assert.equal(calls[1].url, "/api/auth/me");
  assert.equal(calls[1].init.headers.Authorization, `Bearer ${jwt}`);
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[1].init.cache, "no-store");
});
for (const [status, expected] of [
  [401, /E-poçt və ya şifrə/],
  [429, /Çox sayda cəhd/],
  [503, /Giriş xidməti/],
]) {
  test(`handles login HTTP ${status} without exposing server details`, async () => {
    globalThis.fetch = async () =>
      json({ message: "private server detail" }, status);
    await assert.rejects(
      authenticate(user.email, "synthetic-password"),
      expected,
    );
  });
}
for (const response of [
  {},
  null,
  { access_token: "broken" },
  { access_token: token("wrong-type") },
]) {
  test(`rejects malformed authentication response ${JSON.stringify(response)}`, async () => {
    globalThis.fetch = async () => json(response);
    await assert.rejects(
      authenticate(user.email, "synthetic-password"),
      /Giriş cavabı etibarlı deyil/,
    );
  });
}
test("rejects expired tokens before fetching identity", async () => {
  let count = 0;
  globalThis.fetch = async () => {
    count++;
    return json({ access_token: token(1) });
  };
  await assert.rejects(
    authenticate(user.email, "synthetic-password"),
    /Sessiyanın müddəti bitib/,
  );
  assert.equal(count, 1);
});
test("does not authenticate when identity endpoint rejects token", async () => {
  let count = 0;
  globalThis.fetch = async () =>
    ++count === 1 ? json({ access_token: token() }) : json({}, 401);
  await assert.rejects(
    authenticate(user.email, "synthetic-password"),
    /İstifadəçi məlumatları alınmadı/,
  );
});
test("rejects malformed identity", async () => {
  let count = 0;
  globalThis.fetch = async () =>
    ++count === 1
      ? json({ access_token: token() })
      : json({ userId: "test-user", branches: null });
  await assert.rejects(
    authenticate(user.email, "synthetic-password"),
    /İstifadəçi məlumatları etibarlı deyil/,
  );
});
test("network errors become an actionable Azerbaijani message", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(
    authenticate(user.email, "synthetic-password"),
    /Serverlə əlaqə qurulmadı/,
  );
});

test("login form reports Azerbaijani errors without the incompatible Zod resolver", async () => {
  const form = createFormControl();
  form.register("email", loginRules.email);
  form.register("password", loginRules.password);
  form.setValue("email", "invalid-email");
  form.setValue("password", "");
  assert.equal(await form.trigger(), false);
  assert.equal(
    form.getFieldState("email").error.message,
    "Düzgün e-poçt ünvanı daxil edin.",
  );
  assert.equal(
    form.getFieldState("password").error.message,
    "Şifrənizi daxil edin.",
  );
});

test("login form trims email, preserves password, and accepts valid input", async () => {
  const form = createFormControl();
  form.register("email", loginRules.email);
  form.register("password", loginRules.password);
  form.setValue("email", "  ui@hilal.az  ");
  form.setValue("password", "  secret  ");
  assert.equal(await form.trigger(), true);
  await form.handleSubmit((values) => {
    assert.equal(values.email, "ui@hilal.az");
    assert.equal(values.password, "  secret  ");
  })();
});
