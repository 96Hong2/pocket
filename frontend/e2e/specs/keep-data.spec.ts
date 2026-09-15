import { logsNamed } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 「기록을 지켜 두세요」 한 줄.
 *
 * 「내 계정」 은 관리 탭 목록 안에 있어 아무도 스스로 들어가지 않는다. 그런데 그 자리가
 * 정작 필요한 사람은 **이미 쌓아 둔 것이 있는 사람**이다.
 *
 * 여기서 지키는 것은 「뜬다」 가 아니라 **「함부로 안 뜬다」** 다.
 * 처음 온 사람에게 가입을 말하면 그 순간 이 앱은 가입해야 쓰는 앱이 된다.
 */

/** 이 기기에서 앱을 몇 번 열었는지 심는다. 목 SDK 의 저장소는 접두사 붙은 localStorage 다. */
async function seedOpens(page: import('@playwright/test').Page, count: number): Promise<void> {
  const day = 24 * 60 * 60 * 1000;
  await page.addInitScript(
    ([opens, ms]) => {
      try {
        const now = Date.now();
        window.localStorage.setItem(
          '__ait_storage:visit-log',
          JSON.stringify({ first: now - 7 * ms, last: now - ms, count: opens }),
        );
      } catch {
        /* 저장소를 못 여는 문서에서는 이 앱이 돌지 않는다. */
      }
    },
    [count, day] as const,
  );
}

test('처음 온 사람에게는 안 뜬다', async ({ manage, page }) => {
  await seedOpens(page, 1);
  await manage.open();
  await manage.waitReady();
  await expect(page.getByText('지금은 이 기기에만 있어요', { exact: false })).toHaveCount(0);
});

test('몇 번 와 본 사람에게만 뜨고, 누르면 내 계정으로 간다', async ({
  account,
  manage,
  page,
}) => {
  await seedOpens(page, 5);
  await manage.open();
  await manage.waitReady();

  await expect(page.getByText('기록을 지켜 두세요', { exact: true }).first()).toBeVisible();
  await page.getByRole('link', { name: '지켜 두기', exact: true }).click();

  await account.waitReady();
  await expect(account.linkButton).toBeVisible();

  const logs = await logsNamed(page, 'account_link_result');
  expect(logs.map((log) => log.params.result)).toEqual(['prompt_opened']);
});

test('안 할래요를 누르면 그 뒤로 다시 안 뜬다', async ({ manage, page }) => {
  await seedOpens(page, 5);
  await manage.open();
  await manage.waitReady();

  await page.getByRole('button', { name: '안 할래요', exact: true }).click();
  await expect(page.getByText('지금은 이 기기에만 있어요', { exact: false })).toHaveCount(0);

  const logs = await logsNamed(page, 'account_link_result');
  expect(logs.map((log) => log.params.result)).toEqual(['prompt_dismissed']);

  // 다시 들어와도 없다. 같은 말을 두 번 하면 그때부터 잔소리다.
  await manage.open();
  await manage.waitReady();
  await expect(page.getByText('지금은 이 기기에만 있어요', { exact: false })).toHaveCount(0);
});
