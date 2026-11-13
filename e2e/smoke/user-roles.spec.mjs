import { test, expect } from '@playwright/test';

const branchA = { id: '3f701e13-737d-4899-88e3-745b1e1cba00', name: 'Bakı filialı', isActive: true };
const branchB = { id: '4f701e13-737d-4899-88e3-745b1e1cba00', name: 'Gəncə filialı', isActive: true };
const userId = '5f701e13-737d-4899-88e3-745b1e1cba00';

async function prepare(page, { role = 'CENTRAL_ADMIN', detailFails = false, inactiveAssigned = false } = {}) {
  const branches = [{ ...branchA }, { ...branchB, isActive: !inactiveAssigned }];
  const state = { mutations: [], userReads: 0, assignments: [
    { branchId: branchA.id, role: 'SELLER' }, { branchId: branchB.id, role: 'OMR_OPERATOR' },
  ] };
  await page.addInitScript(() => sessionStorage.setItem('hilal.session', JSON.stringify({ token: 'roles-test-session', expiresAt: Date.now() + 600000, selectedBranch: '' })));
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    expect(req.headers().authorization).toBe('Bearer roles-test-session');
    let json = [];
    if (path === '/api/auth/me') json = { userId: 'admin', fullName: 'Administrator', email: 'admin@example.invalid', roles: [role], branches: [] };
    else if (path === '/api/branches') json = new URL(req.url()).searchParams.get('includeInactive') === 'true' ? branches : branches.filter(branch => branch.isActive);
    else if (path === '/api/users' && req.method() === 'GET') {
      state.userReads++;
      json = { total: 1, data: [{ id: userId, fullName: 'Aysel Məmmədova', email: 'aysel@example.invalid', isActive: true,
        roles: [...new Set(state.assignments.map(entry => entry.role))], branches, assignments: state.assignments }] };
    } else if (path === `/api/users/${userId}` && req.method() === 'GET') {
      if (detailFails) return route.fulfill({ status: 500, json: { message: 'Unavailable' } });
      json = { id: userId, fullName: 'Aysel Məmmədova', email: 'aysel@example.invalid', isActive: true,
        userBranchRoles: state.assignments.map(entry => ({ branchId: entry.branchId, role: { name: entry.role }, branch: branches.find(branch => branch.id === entry.branchId) })) };
    } else if (['POST', 'PATCH'].includes(req.method())) {
      const body = req.postDataJSON(); state.mutations.push({ path, body });
      if (path.endsWith('/roles')) state.assignments = [
        ...state.assignments.filter(entry => entry.branchId !== body.branchId),
        ...body.roleIds.map(role => ({ branchId: body.branchId, role })),
      ];
      json = { id: userId };
    }
    await route.fulfill({ json });
  });
  return state;
}
const noOverflow = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

for (const width of [390, 1280]) test.describe(`${width}px users and roles`, () => {
  test.use({ viewport: { width, height: 844 }, isMobile: width < 640, hasTouch: width < 640 });

  test('explains roles and changes only the selected branch', async ({ page }, info) => {
    const state = await prepare(page);
    await page.goto('/dashboard/users');
    await page.getByText('Rollar nə edə bilər?', { exact: true }).click();
    await expect(page.getByText('Son aktiv super administratorun hesabı qorunur.', { exact: false })).toBeVisible();
    await expect(page.getByText('Bakı filialı: Satıcı', { exact: true })).toBeVisible();
    await expect(page.getByText('Gəncə filialı: OMR operatoru', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Rolları dəyiş', exact: true }).click();
    const branch = page.getByRole('combobox', { name: 'Rolun tətbiq olunduğu filial' });
    await expect(branch).toHaveValue(branchA.id);
    await expect(page.getByRole('checkbox', { name: /^Satıcı/ })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /^OMR operatoru/ })).not.toBeChecked();
    await branch.selectOption(branchB.id);
    await expect(page.getByRole('checkbox', { name: /^Satıcı/ })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: /^OMR operatoru/ })).toBeChecked();
    await page.getByRole('checkbox', { name: /^OMR operatoru/ }).uncheck();
    await expect(page.getByRole('button', { name: 'Rolları saxla' })).toBeDisabled();
    await page.getByRole('checkbox', { name: /^OMR operatoru/ }).check();
    await page.getByRole('checkbox', { name: /^Filial rəhbəri/ }).check();
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath('branch-roles.png'), fullPage: true });
    await page.getByRole('button', { name: 'Rolları saxla' }).click();
    await expect.poll(() => state.mutations.length).toBe(1);
    expect(state.mutations[0].body).toEqual({ branchId: branchB.id, roleIds: ['OMR_OPERATOR', 'BRANCH_MANAGER'] });
    expect(state.assignments).toContainEqual({ branchId: branchA.id, role: 'SELLER' });
  });

  test('never enables saving when role loading fails', async ({ page }) => {
    const state = await prepare(page, { detailFails: true });
    await page.goto('/dashboard/users');
    await page.getByRole('button', { name: 'Rolları dəyiş', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Əməliyyat tamamlanmadı' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rolları saxla' })).toBeDisabled();
    expect(state.mutations).toEqual([]);
    await page.getByRole('button', { name: 'Bağla', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Filial üzrə rollar' })).not.toBeVisible();
  });

  test('creates an explicit seller and edits a profile without silently replacing roles', async ({ page }) => {
    const state = await prepare(page);
    await page.goto('/dashboard/users');
    await page.getByRole('button', { name: 'Yeni istifadəçi', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Rol', exact: true })).toHaveValue('SELLER');
    await page.getByLabel('E-poçt', { exact: true }).fill('new@example.invalid');
    await page.getByLabel('Tam ad', { exact: true }).fill('Yeni İşçi');
    await page.getByLabel('Şifrə (ən azı 12 simvol)').fill('example-password-123!');
    await page.getByLabel('Filiallar', { exact: true }).selectOption(branchA.id);
    await page.getByRole('button', { name: 'Yadda saxla', exact: true }).click();
    await expect.poll(() => state.mutations.length).toBe(1);
    expect(state.mutations[0].body).toMatchObject({ role: 'SELLER', branchIds: [branchA.id] });
    await page.getByRole('button', { name: 'Redaktə et', exact: true }).click();
    await expect(page.getByLabel('Tam ad', { exact: true })).toHaveValue('Aysel Məmmədova');
    await page.getByLabel('Tam ad', { exact: true }).fill('Yeni Ad');
    await page.getByRole('button', { name: 'Redaktə et', exact: true }).first().click();
    await expect.poll(() => state.mutations.length).toBe(2);
    expect(state.mutations[1].body).not.toHaveProperty('role');
    expect(state.mutations[1].body).not.toHaveProperty('branchIds');
    await noOverflow(page);
  });

  test('keeps inactive branch assignments when editing only the name', async ({ page }) => {
    const state = await prepare(page, { inactiveAssigned: true });
    await page.goto('/dashboard/users');
    await expect(page.getByText('Gəncə filialı (passiv): OMR operatoru', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Redaktə et', exact: true }).click();
    await expect(page.getByLabel('Tam ad', { exact: true })).toHaveValue('Aysel Məmmədova');
    await expect(page.getByLabel('Filiallar', { exact: true })).toHaveValues([branchA.id, branchB.id]);
    await page.getByLabel('Tam ad', { exact: true }).fill('Yeni Ad');
    await page.locator('form').getByRole('button', { name: 'Redaktə et', exact: true }).click();
    await expect.poll(() => state.mutations.length).toBe(1);
    expect(state.mutations[0].body).not.toHaveProperty('branchIds');
    expect(state.mutations[0].body).not.toHaveProperty('role');
  });

  test('branch managers have read access without account mutation controls', async ({ page }) => {
    const state = await prepare(page, { role: 'BRANCH_MANAGER' });
    await page.goto('/dashboard/users');
    await expect(page.getByRole('heading', { name: 'Aysel Məmmədova' })).toBeVisible();
    for (const name of ['Yeni istifadəçi', 'Rolları dəyiş', 'Redaktə et'])
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    expect(state.userReads).toBeGreaterThan(0);
  });

  for (const role of ['SELLER', 'OMR_OPERATOR']) test(`${role} cannot open the user list by direct URL`, async ({ page }) => {
    const state = await prepare(page, { role });
    await page.goto('/dashboard/users');
    await expect(page.getByRole('alert').filter({ hasText: 'icazəniz yoxdur' })).toBeVisible();
    expect(state.userReads).toBe(0);
    await expect(page.getByRole('heading', { name: 'Aysel Məmmədova' })).toHaveCount(0);
  });
});
