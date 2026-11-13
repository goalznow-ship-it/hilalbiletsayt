// End-to-end smoke of the whole business flow through the browser:
// login -> sell ticket -> print -> take payment -> admit at the door ->
// scan the answer sheet -> manual review queue -> publish results ->
// close the day -> public result check.
import { test, expect } from "@playwright/test";
import { client, PASSWORD, seedWorld, uiLogin } from "./helpers.mjs";

test.describe.serial("Hilal business flow", () => {
  let world;
  let ticket;
  let uploadId;

  test.beforeAll(async () => {
    world = await seedWorld();
  });

  test("seller logs in and sells a ticket at the desk", async ({ page }) => {
    await uiLogin(page, world.users.SELLER);
    await page.goto("/examinations");
    await page.getByRole("button", { name: /Bilet al/ }).and(page.locator(`xpath=//*[contains(., "${world.exam.code}")]//button`)).first().click();
    await expect(page.getByLabel("Sessiya")).toHaveValue(world.session.id);
    await page.locator("#purchase-full-name").fill("Nigar Əliyeva");
    await page.getByRole("button", { name: "Bileti yarat" }).click();
    await expect(page.getByText("Bilet yaradıldı")).toBeVisible();

    const list = await client().call("GET", `/ticket?sessionId=${world.session.id}`, { token: world.admin });
    expect(list.data).toHaveLength(1);
    ticket = list.data[0];
    expect(ticket.branchId).toBe(world.branch.id);
    expect(ticket.qrCode).toMatch(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
  });

  test("seller prints the ticket and records the cash payment", async ({ page }) => {
    await uiLogin(page, world.users.SELLER);
    await page.goto(`/tickets/${ticket.id}`);
    await page.evaluate(() => {
      window.__printed = 0;
      window.print = () => { window.__printed += 1; };
    });
    await page.getByRole("button", { name: /Çap et/ }).click();
    expect(await page.evaluate(() => window.__printed)).toBe(1);

    await page.goto("/dashboard/tickets");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Ödənişi təsdiqlə" }).first().click();
    await expect(page.getByText("Ödənilib").first()).toBeVisible();
  });

  test("door staff admits the ticket once and rejects a second scan", async ({ page }) => {
    await uiLogin(page, world.users.SELLER);
    await page.goto("/dashboard/scan");
    const input = page.getByLabel("QR kod və ya yoxlama keçidi");
    await input.fill(`${process.env.BASE_URL ?? "http://localhost:3000"}/tickets/verify/${ticket.qrCode}`);
    await input.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Giriş icazəlidir" })).toBeVisible();
    await input.fill(ticket.qrCode);
    await input.press("Enter");
    await expect(page.getByRole("alert").filter({ hasText: "Giriş qadağandır" })).toBeVisible();
  });

  test("OMR operator scans the answer sheet; the blank sheet lands in the review queue", async ({ page }) => {
    const c = client();
    const operator = await c.login(world.users.OMR_OPERATOR, PASSWORD);
    const sheet = await c.call("POST", "/omr/sheets", { token: operator, body: { ticketId: ticket.id, answerKeyId: world.key.id } });
    const pdf = await c.call("GET", `/omr/sheets/${sheet.id}/pdf`, { token: operator, raw: true });
    expect(pdf.status).toBe(200);
    const buffer = Buffer.from(await pdf.arrayBuffer());

    await uiLogin(page, world.users.OMR_OPERATOR);
    await page.goto("/dashboard/omr/upload");
    await page.getByLabel("İmtahan").selectOption(world.exam.id);
    await page.getByLabel("Cavab vərəqi (PDF, JPEG, PNG)").setInputFiles({ name: "sheet.pdf", mimeType: "application/pdf", buffer });
    await page.locator("form button[type=submit]").click();
    const link = page.locator("a[href*='/dashboard/omr/uploads/']").first();
    await expect(link).toBeVisible({ timeout: 60_000 });
    uploadId = (await link.getAttribute("href")).split("/").pop();
    await link.click();
    await expect(page.getByText(/Status: Yoxlama gözləyir/)).toBeVisible();
    await expect(page.getByText(/ALL_BLANK/)).toBeVisible();
  });

  test("operator resolves the review queue item", async ({ page }) => {
    await uiLogin(page, world.users.OMR_OPERATOR);
    await page.goto(`/dashboard/omr/uploads/${uploadId}`);
    await page.getByLabel("Sual 1 düzəlişi").selectOption("A");
    await page.getByLabel("Sual 2 düzəlişi").selectOption("B");
    await page.getByLabel("Sual 3 düzəlişi").selectOption("A");
    await page.getByLabel("Manual yoxlamanın səbəbi").fill("Kağız vərəqlə müqayisə edildi");
    await page.getByRole("button", { name: /Manual düzəlişi təsdiqlə/ }).click();
    await expect(page.getByText("Səhifə təsdiqləndi. Bal: 2")).toBeVisible();
  });

  test("results stay hidden until the administrator publishes them", async ({ page }) => {
    const lookup = () => client().call("POST", "/public/results/lookup", {
      raw: true, body: { ticket: ticket.code, candidateNumber: ticket.candidateNumber },
    });
    expect((await lookup()).status).toBe(404);

    await uiLogin(page, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    await page.goto("/dashboard/results");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: `${world.exam.code} nəticələrini dərc et` }).click();
    await expect(page.getByRole("button", { name: `${world.exam.code} nəticələrini gizlət` })).toBeVisible();
    expect((await lookup()).status).toBe(200);
  });

  test("branch manager closes the day; sales of that day become read-only", async ({ page }) => {
    await uiLogin(page, world.users.BRANCH_MANAGER);
    await page.goto("/dashboard/day-closure");
    await expect(page.getByText("Satılan bilet")).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Günü bağla" }).click();
    await expect(page.getByText(/· Bağlanıb/)).toBeVisible();

    // A further sale in this branch today is refused.
    const c = client();
    const seller = await c.login(world.users.SELLER, PASSWORD);
    const buyer = await c.call("POST", "/candidates", { token: seller, body: { full_name: "Gecikmiş Alıcı" } });
    const response = await c.call("POST", "/ticket", {
      token: seller, raw: true, body: { examId: world.exam.id, sessionId: world.session.id, candidateId: buyer.id },
    });
    expect(response.status).toBe(409);
  });

  test("candidate checks the published result on the public page", async ({ page }) => {
    await page.goto("/results");
    await page.getByLabel("Bilet kodu və ya QR keçidi").fill(ticket.code);
    await page.getByLabel("Namizəd nömrəsi").fill(ticket.candidateNumber);
    await page.getByRole("button", { name: "Nəticəni göstər" }).click();
    await expect(page.getByText("Düzgün", { exact: true })).toBeVisible();
    await expect(page.locator(".public-result")).toContainText("2 / 3");
  });
});
