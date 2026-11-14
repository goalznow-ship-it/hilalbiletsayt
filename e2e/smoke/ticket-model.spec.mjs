import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const examId = '3f701e13-737d-4899-88e3-745b1e1cba00';
const ticketId = '5f701e13-737d-4899-88e3-745b1e1cba00';
const keyId = '6f701e13-737d-4899-88e3-745b1e1cba00';
const branches = [
  { id: 'branch-a', name: 'Nərimanov filialı', code: 'NRM', address: 'Bakı, Təbriz küçəsi 12', phone: '+994 50 123 45 67' },
  { id: 'branch-b', name: 'Sumqayıt filialı', code: 'SMQ', address: 'Sumqayıt, Sülh küçəsi 20', phone: '+994 55 987 65 43' },
];
const session = { id: 'session-a', sessionCode: 'SƏHƏR', startsAt: '2027-03-20T06:00:00Z', endsAt: '2027-03-20T09:00:00Z', venue: '23 nömrəli məktəb, əsas bina' };
const exam = { id: examId, code: 'SINAQ-IX', title: 'IX sinif buraxılış imtahanı', description: 'Buraxılış sınağı', price: 2500, sessions: [session] };
const ticket = { code: 'HK-12345678901234567890', workNumber: '12345678', price: 2500, status: 'ACTIVE', paymentStatus: 'PAID', qrCode: 'signed-test-token',
  exam, session, branch: branches[0], candidate: { full_name: 'Əli Əliyev', candidate_number: 'QDA234567890' } };

async function setup(page) {
  const state = { issued: null };
  await page.addInitScript(() => sessionStorage.setItem('hilal.session', JSON.stringify({ token: 'local-ticket-fixture', expiresAt: Date.now() + 3600000, selectedBranch: '' })));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let json = [];
    if (path === '/api/auth/me') json = { userId: 'admin', email: 'admin@hilal.test', fullName: 'Administrator', roles: ['CENTRAL_ADMIN'], branches: [] };
    else if (path === '/api/public/exams') json = { exams: [exam], branches };
    else if (path.startsWith('/api/public/orders/')) json = ticket;
    else if (path === '/api/exams') json = [exam];
    else if (path === '/api/branches') json = branches;
    else if (path === '/api/omr/keys') json = [{ id: keyId, variant: 'A', version: 1, questionCount: 150 }];
    else if (path === '/api/omr/sheets' && route.request().method() === 'POST') {
      state.issued = route.request().postDataJSON();
      json = { id: ticketId, templateVersion: 'hilal-a4-v2' };
    }
    else if (path === `/api/ticket/${ticketId}`) json = { ...ticket,
      id: ticketId, examCode: exam.code, examTitle: exam.title, candidateFullName: ticket.candidate.full_name, candidateNumber: ticket.candidate.candidate_number,
      sessionCode: session.sessionCode, sessionStartsAt: session.startsAt, sessionVenue: session.venue,
      branchName: branches[0].name, branchCode: branches[0].code, branchAddress: branches[0].address, branchPhone: branches[0].phone,
    };
    await route.fulfill({ json });
  });
  return state;
}

for (const width of [390, 1280]) test.describe(`ticket ${width}px`, () => {
  test.use({ viewport: { width, height: 900 }, isMobile: width < 640, hasTouch: width < 640 });
  test('sale shows selected branch details and hides available seat counts', async ({ page }) => {
    await setup(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Bilet al', exact: true }).click();
    const form = page.locator('form');
    await expect(form.getByText('Nərimanov filialı · NRM')).toBeVisible();
    await expect(form.getByRole('link', { name: branches[0].phone })).toHaveAttribute('href', 'tel:+994501234567');
    await page.getByLabel('Ödəniş ediləcək filial').selectOption('branch-b');
    await expect(form.getByText('Sumqayıt filialı · SMQ')).toBeVisible();
    await expect(form.getByRole('link', { name: branches[1].phone })).toBeVisible();
    await expect(form.getByRole('link', { name: branches[0].phone })).toHaveCount(0);
    await expect(page.getByText(/\d+ boş yer/)).toHaveCount(0);
  });
  test('staff and online tickets share readable identity, contacts and print layout', async ({ page }, info) => {
    await setup(page);
    for (const [name, path] of [['receipt', '/orders/' + 'a'.repeat(43)], ['staff', '/tickets/' + ticketId]]) {
      await page.goto(path);
      const card = page.getByRole('article', { name: 'İmtahan bileti' });
      await expect(card).toHaveCSS('border-radius', '18px');
      await expect(card.locator('header')).toHaveCSS('background-color', 'rgb(122, 0, 20)');
      await expect(card.getByText('12345678', { exact: true })).toBeVisible();
      await expect(card.getByText('Əli Əliyev', { exact: true })).toBeVisible();
      await expect(card.getByText('NRM', { exact: true })).toBeVisible();
      await expect(card.getByText(branches[0].address, { exact: true })).toBeVisible();
      await expect(card.getByRole('link', { name: branches[0].phone })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const audit = await new AxeBuilder({ page }).include('.exam-ticket').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(audit.violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
      await page.emulateMedia({ media: 'print' });
      await expect(card.getByText('12345678', { exact: true })).toBeVisible();
      if (width === 1280 && name === 'receipt') {
        const pdf = await page.pdf({ path: info.outputPath('ticket.pdf'), format: 'A4', printBackground: true });
        expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
      }
      await page.emulateMedia({ media: 'screen' });
    }
  });
  test('group camera mode gives clear instructions and the exact coded template is available', async ({ page }, info) => {
    const state = await setup(page);
    await page.goto(`/dashboard/omr/upload?examId=${examId}`);
    await page.getByLabel('Bir fotoda bir neçə kart çəkirəm').check();
    await expect(page.getByText(/Kartları yanaşı, üst-üstə düşmədən/)).toBeVisible();
    await expect(page.getByLabel(/Avtomatik çəkim/)).toHaveCount(0);
    await page.getByRole('link', { name: 'Tanınan kart nümunəsi və PDF şablonu' }).click();
    await expect(page.getByRole('img', { name: /Tanınan A4 cavab kartı/ })).toBeVisible();
    await expect(page.getByText(/İş nömrəsinin 8 rəqəmini/)).toBeVisible();
    const response = await page.request.get('/omr/answer-sheet-sample.pdf');
    expect(response.ok()).toBe(true);
    expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
    await page.getByLabel('İş nömrəsi və ya bilet UUID').fill('12345678');
    await page.getByRole('combobox', { name: 'İmtahan', exact: true }).selectOption(examId);
    await page.getByRole('combobox', { name: 'Cavab açarı', exact: true }).selectOption(keyId);
    await page.getByRole('button', { name: 'Vərəq yarat', exact: true }).click();
    await expect(page.getByText('Vərəq yaradıldı', { exact: true })).toBeVisible();
    expect(state.issued).toEqual({ workNumber: '12345678', answerKeyId: keyId });
    await page.screenshot({ path: info.outputPath('coded-template.png'), fullPage: true });
  });
});
