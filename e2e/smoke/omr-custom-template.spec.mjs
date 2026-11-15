import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';

const examId = '3f701e13-737d-4899-88e3-745b1e1cba00';
const keyId = '4f701e13-737d-4899-88e3-745b1e1cba00';
const modelId = '5f701e13-737d-4899-88e3-745b1e1cba00';
const uploadId = '6f701e13-737d-4899-88e3-745b1e1cba00';
const photo = readFileSync(new URL('../../services/omr-worker/tests/fixtures/clean.png', import.meta.url));
const preview = { width: photo.readUInt32BE(16), height: photo.readUInt32BE(20), image: photo.toString('base64') };
async function setup(page, role = 'CENTRAL_ADMIN') {
  const state = { config: null, templateId: null, saved: false, reject: false };
  await page.addInitScript(() => sessionStorage.setItem('hilal.session', JSON.stringify({ token: 'local-ui-fixture', expiresAt: Date.now() + 3600000, selectedBranch: '' })));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    let json = [];
    if (path === '/api/auth/me') json = { userId: 'user', email: 'operator@hilal.test', fullName: 'Aysel Həsənova', roles: [role], branches: [] };
    else if (path === '/api/exams') json = [{ id: examId, code: 'SINAQ', title: 'Öz kartım' }];
    else if (path === '/api/omr/keys') json = [{ id: keyId, variant: 'A', version: 1, choiceCount: 5, questionCount: 20 }];
    else if (path === '/api/omr/templates/preview') json = preview;
    else if (path === '/api/omr/templates') {
      if (request.method() === 'POST') {
        state.config = JSON.parse(request.postDataBuffer().toString().match(/name="config"\r\n\r\n(.*?)\r\n--/s)[1]);
        if (state.reject) return route.fulfill({ status: 400, json: { message: 'Dairələrin mərkəzlərini yoxlayın.' } });
        state.saved = true; json = { id: modelId, name: state.config.name, answerKeyId: keyId };
      } else json = state.saved ? [{ id: modelId, name: state.config.name, answerKeyId: keyId, answerKey: { variant: 'A', version: 1 } }] : [];
    } else if (path === `/api/omr/exams/${examId}/uploads` && request.method() === 'POST') {
      state.templateId = url.searchParams.get('templateId');
      json = [{ id: uploadId, status: 'COMPLETED', pages: [{ sheetId: 'sheet', status: 'COMPLETED' }] }];
    }
    await route.fulfill({ json });
  });
  return state;
}
async function mark(page, first, last) {
  const canvas = page.getByRole('button', { name: /^Kartda dairələrin/ });
  const box = await canvas.boundingBox();
  await canvas.click({ position: { x: first[0] * box.width, y: first[1] * box.height } });
  await canvas.click({ position: { x: last[0] * box.width, y: last[1] * box.height } });
  await page.getByRole('button', { name: 'Sahəni əlavə et', exact: true }).click();
}
for (const width of [390, 1280]) test.describe(`${width}px custom cards`, () => {
  test.setTimeout(45_000);
  test.use({ viewport: { width, height: 844 }, isMobile: width < 640, hasTouch: width < 640 });
  test('upload blank model, calibrate, retry validation, select model and scan', async ({ page }, info) => {
    const state = await setup(page);
    await page.goto('/dashboard/omr/templates');
    await page.getByRole('combobox', { name: 'İmtahan', exact: true }).selectOption(examId);
    await page.getByRole('combobox', { name: 'Cavab açarı', exact: true }).selectOption(keyId);
    await page.getByLabel('Modelin adı', { exact: true }).fill('Mənim cavab kartım');
    await page.getByLabel('Boş cavab kartının skanı', { exact: true }).setInputFiles({ name: 'blank.png', mimeType: 'image/png', buffer: photo });
    await expect(page.getByRole('heading', { name: '2. Oxunacaq sahələri tanıt' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Modeli yoxla və saxla' })).toBeDisabled();
    await mark(page, [.1, .45], [.3, .85]);
    await page.getByRole('combobox', { name: 'Sahə', exact: true }).selectOption('workNumber');
    await mark(page, [.3, .1], [.65, .3]);
    await expect(page.getByText('20 / 20 sual tanıdılıb · İş nömrəsi: tanıdılıb')).toBeVisible();
    state.reject = true;
    await page.getByRole('button', { name: 'Modeli yoxla və saxla' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Dairələrin' })).toBeVisible();
    state.reject = false;
    await page.getByRole('button', { name: 'Modeli yoxla və saxla' }).click();
    await expect(page.getByRole('link', { name: 'Bu modellə skan et' })).toBeVisible();
    expect(state.config).toMatchObject({ name: 'Mənim cavab kartım', answerKeyId: keyId, layout: {
      workNumber: { rows: 10, columns: 8 }, answers: [{ rows: 20, columns: 5 }],
    } });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const a11y = await new AxeBuilder({ page }).include('main.omr-workspace').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(a11y.violations).toEqual([]);
    await page.screenshot({ path: info.outputPath('custom-model.png'), fullPage: true });
    await page.getByRole('link', { name: 'Bu modellə skan et' }).click();
    await expect(page.getByLabel('Cavab kartının modeli', { exact: true })).toHaveValue(modelId);
    await expect(page.getByText('Bu modelin cavab açarı tətbiq olunur.', { exact: false })).toBeVisible();
    await expect(page.getByText('Avtomatik çəkim — kart hazır olanda özü çəkir')).toHaveCount(0);
    await page.getByLabel('Cavab vərəqi (PDF, JPEG, PNG)', { exact: true }).setInputFiles({ name: 'filled.png', mimeType: 'image/png', buffer: photo });
    await page.getByRole('button', { name: 'Skan et', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '1 kart uyğunlaşdırılıb' })).toBeVisible();
    expect(state.templateId).toBe(modelId);
  });
});
test('branch operator sees an explanation instead of model creation controls', async ({ page }) => {
  await setup(page, 'OMR_OPERATOR');
  await page.goto('/dashboard/omr/templates');
  await expect(page.getByText('Modeli mərkəzi administrator əlavə edir.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Boş cavab kartının skanı', { exact: true })).toHaveCount(0);
});
