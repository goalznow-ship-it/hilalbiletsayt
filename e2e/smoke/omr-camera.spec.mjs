import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { client, PASSWORD, seedWorld, uiLogin } from './helpers.mjs';

const photo = readFileSync(new URL('../../services/omr-worker/tests/fixtures/clean.png', import.meta.url));
let world;

async function mockCamera(page, base64) {
  await page.evaluate(async (image64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${image64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    canvas.getContext('2d').drawImage(image, 0, 0);
    window.__cameraCanvas = canvas;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.__cameraConstraints = constraints;
      window.__cameraStream = canvas.captureStream(10);
      window.__cameraTimer = setInterval(() => canvas.getContext('2d').drawImage(image, 0, 0), 100);
      return window.__cameraStream;
    };
  }, base64);
}

async function disableAutoCapture(page) {
  const auto = page.getByRole('checkbox', { name: /Avtomatik çəkim/ });
  if (await auto.isChecked()) await auto.uncheck();
}

test.beforeAll(async () => { world = await seedWorld(); });
test.beforeEach(async ({ page }) => {
  await uiLogin(page, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  await page.goto('/dashboard/omr/upload');
  await page.getByLabel('İmtahan', { exact: true }).selectOption(world.exam.id);
});

test('phone photo reaches real recognition and original image can be downloaded', async ({ page }) => {
  await page.locator('#omr-file').setInputFiles({ name: 'phone.png', mimeType: 'image/png', buffer: photo });
  await page.locator('form button[type=submit]').click();
  const link = page.locator("a[href*='/dashboard/omr/uploads/']").first();
  await expect(link).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('status').filter({ hasText: /yoxlama/ })).toBeVisible();
  await link.click();
  await expect(page.getByText(/Status: Yoxlama gözləyir/)).toBeVisible();
  // The fixture token is deliberately not issued by this exam: never bind it to a candidate.
  await expect(page.getByText(/QR kod bu imtahan və filial üçün təsdiqlənməyib/)).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(20);
  await expect(page.locator('tbody tr').first()).toContainText('A');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: /Orijinal skanı endir/ }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/\.png$/);
  expect(readFileSync(await file.path())).toEqual(photo);
});

test('live rear camera captures a JPEG and releases tracks after capture', async ({ page }, testInfo) => {
  await mockCamera(page, photo.toString('base64'));
  await page.getByRole('button', { name: 'Kameranı aç', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kartı çək', exact: true })).toBeEnabled();
  await disableAutoCapture(page);
  await page.getByRole('button', { name: 'Kartı çək', exact: true }).click();
  await expect(page.getByAltText('Çəkilmiş cavab kartı')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('camera-preview.png'), fullPage: true });
  expect(await page.evaluate(() => window.__cameraStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  expect(await page.evaluate(() => window.__cameraConstraints)).toMatchObject({ audio: false, video: { facingMode: { ideal: 'environment' } } });
  await page.locator('form button[type=submit]').click();
  const link = page.locator("a[href*='/dashboard/omr/uploads/']").first();
  await expect(link).toBeVisible({ timeout: 60_000 });
  const id = (await link.getAttribute('href')).split('/').pop();
  const token = world.admin;
  const result = await client().call('GET', `/omr/uploads/${id}`, { token });
  expect(result.mime).toBe('image/jpeg');
  expect(result.pages[0].data.answers).toHaveLength(20);
  expect(result.pages[0].data.answers[0].selected).toBe('A');
  expect(result.pages[0].sheetId).toBeNull();
});

test('automatic mode photographs a steady lit card and uploads it without the shutter', async ({ page }) => {
  let uploads = 0;
  await page.route('**/api/omr/exams/*/uploads', route => {
    uploads += 1;
    return route.fulfill({ json: [{ id: '0f701e13-737d-4899-88e3-745b1e1cba00', status: 'COMPLETED', pages: [] }] });
  });
  await mockCamera(page, photo.toString('base64'));
  await page.getByRole('button', { name: 'Kameranı aç', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kartı çək', exact: true })).toBeEnabled();
  const auto = page.getByRole('checkbox', { name: /Avtomatik çəkim/ });
  if (!(await auto.isChecked())) await auto.check();
  await expect(page.getByRole('status').filter({ hasText: 'Skan tamamlandı' })).toBeVisible({ timeout: 20_000 });
  expect(uploads).toBe(1);
  expect(await page.evaluate(() => window.__cameraStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
});

test('camera permission resolving after cancel or navigation cannot leak a live track', async ({ page }) => {
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 1800;
    window.__lateCamera = canvas.captureStream(1);
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.__grantCamera = resolve; });
  });
  await page.getByRole('button', { name: 'Kameranı aç', exact: true }).click();
  await page.getByRole('button', { name: 'Kameranı bağla', exact: true }).click();
  await page.evaluate(() => window.__grantCamera(window.__lateCamera));
  await expect.poll(() => page.evaluate(() => window.__lateCamera.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  await expect(page.getByRole('button', { name: 'Kameranı aç', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    window.__lateCamera = document.createElement('canvas').captureStream(1);
  });
  await page.getByRole('button', { name: 'Kameranı aç', exact: true }).click();
  await page.getByRole('link', { name: 'Geri qayıt', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/omr$/);
  await page.evaluate(() => window.__grantCamera(window.__lateCamera));
  await expect.poll(() => page.evaluate(() => window.__lateCamera.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
});

test('native phone capture accepts a photo and clearing it allows another card', async ({ page }) => {
  await page.locator('#omr-camera-file').setInputFiles({ name: 'native-phone.jpg', mimeType: 'image/jpeg',
    buffer: readFileSync(new URL('../../services/omr-worker/tests/fixtures/rotated.jpg', import.meta.url)) });
  await expect(page.getByAltText('Çəkilmiş cavab kartı')).toBeVisible();
  await page.getByRole('button', { name: 'Yeni kart', exact: true }).click();
  await expect(page.getByAltText('Çəkilmiş cavab kartı')).toHaveCount(0);
  await expect(page.locator('form button[type=submit]')).toBeDisabled();
  await page.locator('#omr-camera-file').setInputFiles({ name: 'native-phone.png', mimeType: 'image/png', buffer: photo });
  await expect(page.getByAltText('Çəkilmiş cavab kartı')).toBeVisible();
  await expect(page.locator('form button[type=submit]')).toBeEnabled();
});

test('denied camera and insecure context explain recovery and keep native capture available', async ({ page }) => {
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  });
  await page.getByRole('button', { name: 'Kameranı aç', exact: true }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText('icazə');
  await expect(page.locator('#omr-camera-file')).toHaveAttribute('capture', 'environment');
  await page.evaluate(() => Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true }));
  await page.getByRole('button', { name: 'Kameranı aç', exact: true }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText('HTTPS');
  await expect(page.getByRole('button', { name: 'Telefonla şəkil çək', exact: true })).toBeEnabled();
});

test('failed processing retains the file for retry and is never shown as success', async ({ page }) => {
  await page.route('**/api/omr/exams/*/uploads', route => route.fulfill({
    json: [{ id: '0f701e13-737d-4899-88e3-745b1e1cba00', status: 'FAILED', error: 'PROCESSING_FAILED_RETRY_ALLOWED', pages: [] }],
  }));
  await page.locator('#omr-file').setInputFiles({ name: 'phone.png', mimeType: 'image/png', buffer: photo });
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('form').getByRole('alert')).toContainText('tamamlanmadı');
  await expect(page.locator('form button[type=submit]')).toBeEnabled();
  await expect(page.getByRole('status').filter({ hasText: /qəbul edildi|tamamlandı/ })).toHaveCount(0);
});

test('operator gets actionable status for an unknown QR without access to other branch answers', async ({ page }) => {
  await uiLogin(page, world.users.OMR_OPERATOR, PASSWORD);
  await page.goto('/dashboard/omr/upload');
  await page.getByLabel('İmtahan', { exact: true }).selectOption(world.exam.id);
  await page.locator('#omr-file').setInputFiles({ name: 'phone.png', mimeType: 'image/png', buffer: photo });
  const responsePromise = page.waitForResponse(response => response.url().endsWith(`/omr/exams/${world.exam.id}/uploads`) && response.request().method() === 'POST');
  await page.locator('form button[type=submit]').click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const [result] = await response.json();
  expect(result).toMatchObject({ status: 'REVIEW', pages: [], detailsRestricted: true });
  await expect(page.getByRole('status').filter({ hasText: /QR və filial əlaqəsi təsdiqlənmədi/ })).toBeVisible();
  const token = await client().login(world.users.OMR_OPERATOR, PASSWORD);
  for (const suffix of ['', '/original']) {
    const forbidden = await client().call('GET', `/omr/uploads/${result.id}${suffix}`, { token, raw: true });
    expect(forbidden.status).toBe(403);
  }
});
