import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';

const examId = '3f701e13-737d-4899-88e3-745b1e1cba00';
const reviewExam = '4f701e13-737d-4899-88e3-745b1e1cba00';
const uploadId = '5f701e13-737d-4899-88e3-745b1e1cba00';
const photo = readFileSync(new URL('../../services/omr-worker/tests/fixtures/clean.png', import.meta.url));
const exam = { id: examId, code: 'SINAQ-IX', title: 'IX sinif buraxılış sınağı' };
const answerDetails = [
  { question: 1, selected: 'C', marked: ['C'], correct: 'C', outcome: 'CORRECT', points: 2 },
  { question: 2, selected: 'B', marked: ['B'], correct: 'A', outcome: 'WRONG', points: -.25 },
  { question: 3, selected: null, marked: [], correct: 'D', outcome: 'BLANK', points: 0 },
];
async function prepare(page) {
  const state = { keys: [], uploads: 0, publishedAt: null, lastKey: null };
  await page.addInitScript(() => sessionStorage.setItem('hilal.session', JSON.stringify({ token: 'local-ui-fixture', expiresAt: Date.now() + 3600000, selectedBranch: '' })));
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    let json = [];
    if (path === '/api/auth/me') json = { userId: 'operator', email: 'operator@hilal.test', fullName: 'Aysel Həsənova', roles: ['CENTRAL_ADMIN'], branches: [] };
    else if (path === '/api/exams') json = [exam];
    else if (path === '/api/omr/keys') {
      if (request.method() === 'POST') {
        state.lastKey = request.postDataJSON();
        state.keys.push({ ...state.lastKey, id: 'key-1', version: 1, questionCount: state.lastKey.answers.length });
        json = state.keys[0];
      } else json = state.keys;
    } else if (path === `/api/omr/exams/${examId}/uploads`) {
      if (request.method() === 'POST') state.uploads++;
      json = [{ id: uploadId, status: request.method() === 'GET' ? 'REVIEW' : 'COMPLETED', pageCount: 1, createdAt: '2026-11-12T10:00:00Z', pages: [] }];
    } else if (path === '/api/results/exams') json = [
      { examId, code: exam.code, title: exam.title, completed: 28, review: 0, duplicate: 1, processing: 0, averagePercent: 72.6, publishedAt: state.publishedAt },
      { examId: reviewExam, code: 'SINAQ-XI', title: 'XI sinif sınağı', completed: 12, review: 2, duplicate: 0, processing: 0, averagePercent: 63.2, publishedAt: null },
    ];
    else if (path === `/api/results/exams/${examId}/publish`) json = { publishedAt: state.publishedAt = '2026-11-12T12:00:00Z' };
    else if (path === '/api/public/results/lookup') json = {
      examCode: exam.code, examTitle: exam.title, candidateNameMasked: 'A**** H*******', score: 1.75, maximumScore: 4,
      correct: 1, wrong: 1, blank: 1, multiple: 0, rank: 8, participants: 28, variant: 'B',
      publishedAt: '2026-11-12T12:00:00Z', answers: answerDetails,
      scoring: { wrong: -.25, unanswered: 0, multiple: 0, floorAtZero: true },
    };
    else if (path === `/api/omr/uploads/${uploadId}/original`) return route.fulfill({ contentType: 'image/png', body: photo });
    else if (path === `/api/omr/uploads/${uploadId}`) json = {
      id: uploadId, status: 'REVIEW', mime: 'image/png', pages: [{ id: 'page-1', sheetId: 'sheet-1', pageIndex: 0, status: 'REVIEW', data: {
        choiceCount: 4, reviewFlags: ['MULTIPLE'], answers: [
          { question: 1, selected: 'A', marked: ['A'], state: 'MARKED', confidence: 1 },
          { question: 2, selected: null, marked: ['A', 'B'], state: 'MULTIPLE', confidence: .7 },
        ],
      } }],
    };
    await route.fulfill({ json });
  });
  return state;
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}
async function camera(page, blank = false) {
  await page.evaluate(async ({ image64, blank }) => {
    const image = new Image(); image.src = `data:image/png;base64,${image64}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    window.__omrDraw = () => canvas.getContext('2d').drawImage(image, 0, 0);
    if (blank) {
      const context = canvas.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'black'; context.fillRect(canvas.width * .4, 0, canvas.width * .2, canvas.height);
    } else window.__omrDraw();
    navigator.mediaDevices.getUserMedia = async () => {
      window.__omrStream = canvas.captureStream(10);
      window.__omrTimer = setInterval(() => canvas.getContext('2d').drawImage(canvas, 0, 0), 100);
      return window.__omrStream;
    };
  }, { image64: photo.toString('base64'), blank });
}

for (const width of [390, 1280]) test.describe(`${width}px viewport`, () => {
  test.use({ viewport: { width, height: 844 }, isMobile: width < 640, hasTouch: width < 640 });
  test.setTimeout(45_000);

test('direct answer key supports touch choices and rejects malformed paste', async ({ page }, info) => {
  const state = await prepare(page);
  await page.goto('/dashboard/omr/keys');
  await page.getByRole('combobox', { name: 'İmtahan', exact: true }).selectOption(examId);
  await page.getByLabel('Sual sayı', { exact: true }).fill('3');
  for (const [index, answer] of ['A', 'B', 'D'].entries()) await page.getByRole('radio', { name: `Sual ${index + 1}: ${answer}`, exact: true }).check();
  await page.getByLabel('Sual 3 balı', { exact: true }).fill('2');
  await expect(page.getByText('3 / 3 cavab qeyd edilib')).toBeVisible();
  await page.getByRole('button', { name: 'Cavab açarını saxla' }).click();
  await expect(page.getByRole('status')).toContainText('cavab açarı saxlanıldı');
  expect(state.lastKey.answers).toEqual([{ correct: 'A', points: 1 }, { correct: 'B', points: 1 }, { correct: 'D', points: 2 }]);
  expect(state.lastKey).not.toHaveProperty('questionIds');
  await page.getByText('Hazır cavab siyahısını yapışdır').click();
  await page.getByLabel('Cavab siyahısı', { exact: true }).fill('1:A 3:B');
  await page.getByRole('button', { name: 'Cavabları yerləşdir' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'ardıcıl' })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath('answer-key.png'), fullPage: true });
});

test('phone auto capture waits for four corners, submits once and releases tracks', async ({ page }, info) => {
  const state = await prepare(page);
  await page.goto(`/dashboard/omr/upload?examId=${examId}`);
  await expect(page.getByRole('combobox', { name: 'İmtahan', exact: true })).toHaveValue(examId);
  await camera(page, true);
  await page.getByRole('button', { name: 'Kameranı aç', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kartı çək', exact: true })).toBeEnabled();
  const auto = page.getByRole('checkbox', { name: /Avtomatik çəkim/ });
  if (!await auto.isChecked()) await auto.check();
  await expect(page.getByRole('status').filter({ hasText: 'Dörd künc nişanını' })).toBeVisible();
  await page.waitForTimeout(1600);
  expect(state.uploads).toBe(0);
  await page.evaluate(() => window.__omrDraw());
  await expect(page.getByRole('status').filter({ hasText: 'Skan tamamlandı' })).toBeVisible();
  expect(state.uploads).toBe(1);
  expect(await page.evaluate(() => window.__omrStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  await expect(page.getByRole('button', { name: 'Skan et', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Növbəti kartı skan et' })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath('phone-scan.png'), fullPage: true });
  await page.getByRole('button', { name: 'Növbəti kartı skan et' }).click();
  await expect(page.getByRole('button', { name: 'Kartı çək', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Kameranı bağla' }).click();
  expect(await page.evaluate(() => window.__omrStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
});

test('publication blocks pending reviews and preserves the exam when opening scans', async ({ page }, info) => {
  await prepare(page); await page.goto('/dashboard/results');
  await expect(page.getByRole('button', { name: 'SINAQ-XI nəticələrini dərc et' })).toBeDisabled();
  await expect(page.getByText(/2 vərəq yoxlanmalıdır/)).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: `${exam.code} nəticələrini dərc et` }).click();
  await expect(page.getByRole('status')).toContainText('dərc edildi');
  await expect(page.getByRole('button', { name: `${exam.code} nəticələrini gizlət` })).toBeVisible();
  await noOverflow(page); await page.screenshot({ path: info.outputPath('publication.png'), fullPage: true });
  await page.getByRole('link', { name: 'Skanlara və hesabata bax' }).click();
  await expect(page.getByRole('combobox', { name: 'İmtahan', exact: true })).toHaveValue(examId);
  await expect(page.getByRole('link', { name: 'Cavabları yoxla', exact: true })).toBeVisible();
});

test('public answer comparisons filter mistakes, print all questions and clear stale results', async ({ page }, info) => {
  await prepare(page); await page.goto('/results');
  await page.getByLabel('Bilet kodu və ya QR keçidi').fill('HK-123456');
  await page.getByLabel('Namizəd nömrəsi').fill('QD-123');
  await page.getByRole('button', { name: 'Nəticəni göstər' }).click();
  await expect(page.getByRole('heading', { name: 'Sual-sual cavablarınız' })).toBeVisible();
  await expect(page.locator('.result-answer:visible')).toHaveCount(3);
  await page.getByRole('button', { name: 'Səhv və boş (2)' }).click();
  await expect(page.locator('.result-answer:visible')).toHaveCount(2);
  await noOverflow(page);
  expect((await new AxeBuilder({ page }).include('.public-result').analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('candidate-result.png'), fullPage: true });
  await page.emulateMedia({ media: 'print' }); await expect(page.locator('.result-answer:visible')).toHaveCount(3);
  await page.emulateMedia({ media: 'screen' });
  await page.getByLabel('Namizəd nömrəsi').fill('QD-124');
  await expect(page.locator('.result-card')).toHaveCount(0);
});

test('manual review opens the original and requires every uncertain answer', async ({ page }, info) => {
  await prepare(page); await page.goto(`/dashboard/omr/uploads/${uploadId}`);
  await page.getByRole('button', { name: 'Orijinal şəkli aç' }).click();
  await expect(page.getByAltText('Orijinal cavab vərəqi')).toBeVisible();
  await page.getByLabel('Yalnız şübhəli cavabları göstər').check();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Manual yoxlamanın səbəbi').fill('Orijinal vərəqlə müqayisə edildi');
  const confirm = page.getByRole('button', { name: /Manual düzəlişi təsdiqlə/ });
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Sual 2 düzəlişi').selectOption('B');
  await expect(confirm).toBeEnabled();
  await noOverflow(page); await page.screenshot({ path: info.outputPath('manual-review.png'), fullPage: true });
});

});
