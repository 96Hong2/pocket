import { expect, test } from '@playwright/test';

test('앱이 뜨고 콘솔 오류가 없다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page.locator('#root')).not.toBeEmpty();
  expect(errors, `콘솔 오류: ${errors.join(' | ')}`).toHaveLength(0);
});

test('하단 3탭으로 이동한다', async ({ page }) => {
  await page.goto('/');

  const tabs = page.getByRole('link').filter({ hasText: /홈|리포트|관리/ });
  await expect(tabs).toHaveCount(3);

  await page.getByRole('link', { name: /리포트/ }).click();
  await expect(page).toHaveURL(/\/report$/);

  await page.getByRole('link', { name: /관리/ }).click();
  await expect(page).toHaveURL(/\/manage$/);

  await page.getByRole('link', { name: /홈/ }).click();
  await expect(page).toHaveURL(/\/$/);
});
