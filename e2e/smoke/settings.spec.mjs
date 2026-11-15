import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function setup(page, role = 'SUPER_ADMIN') {
  const state = { calls: [], wrong: true };
  await page.addInitScript(() => sessionStorage.setItem('hilal.session', JSON.stringify({ token: 'local-settings-test', expiresAt: Date.now() + 3600000, selectedBranch: '' })));
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    let json = [];
    if (path === '/api/auth/me') json = { userId: 'settings-user', email: 'settings@hilal.test', fullName: 'Aysel Həsənova', role, roles: [role], branches: [] };
    else if (path === '/api/health') json = { database: 'connected', timestamp: '2026-11-15T12:00:00Z' };
    else if (path === '/api/auth/password') {
      state.calls.push(request.postDataJSON());
      if (state.wrong) return route.fulfill({ status: 400, json: { message: 'Hazırkı şifrə düzgün deyil.' } });
      json = { changed: true };
    }
    await route.fulfill({ json });
  });
  return state;
}

for (const width of [390, 1280]) test.describe(`${width}px account settings`, () => {
  test.use({ viewport: { width, height: 844 }, isMobile: width < 640, hasTouch: width < 640 });
  test('profile menu opens settings and password change validates before clearing the session', async ({ page }, info) => {
    const state = await setup(page);
    await page.goto('/dashboard/exams');
    await page.getByRole('button', { name: /hesab menyusu/ }).click();
    await page.getByRole('menuitem', { name: 'Tənzimləmələr və şifrə' }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings$/);
    await expect(page.getByRole('heading', { name: 'Şifrəni dəyiş' })).toBeVisible();
    await page.getByLabel('Hazırkı şifrə', { exact: true }).fill('Old-settings-password!');
    await page.getByLabel('Yeni şifrə', { exact: true }).fill('New-settings-password!');
    await page.getByLabel('Yeni şifrəni təkrar yazın', { exact: true }).fill('Different-password!');
    await page.getByRole('button', { name: 'Şifrəni dəyiş', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Yeni şifrələr eyni deyil.' })).toBeVisible();
    expect(state.calls).toHaveLength(0);
    await page.getByLabel('Yeni şifrəni təkrar yazın', { exact: true }).fill('New-settings-password!');
    await page.getByLabel('Şifrələri göstər', { exact: true }).check();
    await expect(page.getByLabel('Yeni şifrə', { exact: true })).toHaveAttribute('type', 'text');
    await page.getByLabel('Şifrələri göstər', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Şifrəni dəyiş', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Hazırkı şifrə düzgün deyil.' })).toBeVisible();
    expect(await page.evaluate(() => !!sessionStorage.getItem('hilal.session'))).toBe(true);
    expect(state.calls[0]).toEqual({ currentPassword: 'Old-settings-password!', newPassword: 'New-settings-password!' });
    const a11y = await new AxeBuilder({ page }).include('#main-content').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(a11y.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath('account-settings.png'), fullPage: true });
    state.wrong = false;
    await page.getByRole('button', { name: 'Şifrəni dəyiş', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Şifrəniz dəyişdirildi' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Bütün cihazlardakı sessiyalar bağlandı' })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('hilal.session'))).toBeNull();
    await page.getByRole('link', { name: 'Yeni şifrə ilə daxil ol' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel('Şifrə', { exact: true })).toHaveValue('');
  });
});

test('seller can change own password without central administration links', async ({ page }) => {
  await setup(page, 'SELLER');
  await page.goto('/dashboard/settings');
  await expect(page.getByRole('heading', { name: 'Şifrəni dəyiş' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tənzimləmələr', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'İmtahan kodu, adı və qiyməti' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Filial məlumatları' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'İstifadəçilər və icazələr' })).toHaveCount(0);
});
