import { expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { api } from "../lib/api.mjs";

export const PASSWORD = "smoke-password-123";
export const baseURL = () => process.env.BASE_URL ?? "http://localhost:3000";
export const client = () => api(baseURL());
export const adminLogin = () => client().login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
const tag = () => randomUUID().slice(0, 6).toUpperCase();

/** Branch with a seller, a manager and an OMR operator; a priced exam with an open session and an answer key. */
export async function seedWorld() {
  const c = client();
  const admin = await adminLogin();
  const t = { token: admin };
  const branch = await c.call("POST", "/branches", { ...t, body: { name: `Smoke filialı ${tag()}`, code: `SM${tag()}` } });
  const users = {};
  for (const role of ["SELLER", "BRANCH_MANAGER", "OMR_OPERATOR"]) {
    const email = `${role.toLowerCase().replace("_", "-")}-${tag().toLowerCase()}@smoke.test`;
    await c.call("POST", "/users", { ...t, body: { email, fullName: `Smoke ${role}`, password: PASSWORD, role, branchIds: [branch.id] } });
    users[role] = email;
  }
  const exam = await c.call("POST", "/exams", { ...t, body: { code: `SMK-${tag()}`, title: `Smoke imtahanı ${tag()}`, price: 2500 } });
  await c.call("PATCH", `/exams/${exam.id}/publish`, t);
  const startsAt = new Date(Date.now() + 10 * 864e5);
  const session = await c.call("POST", "/exam-sessions", {
    ...t,
    body: { examId: exam.id, sessionCode: `SS-${tag()}`, capacity: 30, venue: "Zal 2",
      startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 72e5).toISOString() },
  });
  await c.call("PATCH", `/exam-sessions/${session.id}`, { ...t, body: { status: "OPEN" } });
  const questionIds = [];
  for (const [index, correct] of [1, 2, 3].entries()) {
    const q = await c.call("POST", "/question", {
      ...t, body: { examId: exam.id, question: `Sual ${index + 1}`, variants: "A) 1|B) 2|C) 3|D) 4|E) 5", correct, points: 1 },
    });
    questionIds.push(q.id);
  }
  const key = await c.call("POST", "/omr/keys", {
    ...t, body: { examId: exam.id, variant: "A", questionIds, choiceCount: 5, scoring: { wrong: 0, unanswered: 0, multiple: 0, floorAtZero: true } },
  });
  return { admin, branch, users, exam, session, key };
}

export async function uiLogin(page, email, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("E-poçt ünvanı").fill(email);
  await page.getByLabel("Şifrə", { exact: true }).fill(password);
  await page.getByRole("button", { name: /Daxil ol/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
