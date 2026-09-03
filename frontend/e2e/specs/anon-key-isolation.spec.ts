import type { Page } from '@playwright/test';

import { AppShell } from '../screens/AppShell';
import { installAnonKeyTrap, probeAnonKey } from '../support/anonKey';
import { E2E_API_URL, E2E_WEB_URL } from '../support/env';
import { expect, test } from '../support/fixtures';

/**
 * 격리 장치 자체를 증명한다.
 *
 * 이 장치가 조용히 풀리면 모든 테스트가 백엔드에서 한 사용자로 합쳐지고,
 * 그 사실이 '숫자가 왜 이러지' 로만 드러나 원인을 못 찾는다. 그래서 따로 증명해 둔다.
 *
 * 여기가 e2e 에서 백엔드 API 를 직접 부르는 유일한 자리다.
 * 화면에 아직 API 클라이언트가 없어 '데이터가 안 보인다' 를 화면으로 보일 수 없기 때문이다.
 * 화면이 생기면 이 spec 은 그대로 두고, 화면 쪽 검증을 따로 만든다.
 */

/** devtools 목이 손대지 않으면 주는 상수. 이 값이 나오면 격리가 풀린 것이다. */
const DEVTOOLS_DEFAULT_KEY = 'mock-anon-hash-xyz789';

interface CreateResult {
  status: number;
  id: string | null;
  body: string;
}

/** 페이지 안에서, 목이 든 익명키 그대로 거래를 만든다. 헤더를 테스트가 지어내지 않는다. */
async function createExpense(page: Page, amount: number): Promise<CreateResult> {
  return page.evaluate(
    async ({ api, amount }) => {
      const key =
        (window as unknown as { __ait?: { state?: { auth?: { anonymousKeyHash?: string } } } })
          .__ait?.state?.auth?.anonymousKeyHash ?? '';

      const response = await fetch(`${api}/api/v1/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Anon-Key': key },
        body: JSON.stringify({ occurred_at: new Date().toISOString(), amount }),
      });
      const text = await response.text();
      let id: string | null = null;
      try {
        id = (JSON.parse(text) as { transaction?: { id?: string } }).transaction?.id ?? null;
      } catch {
        id = null;
      }
      return { status: response.status, id, body: text.slice(0, 300) };
    },
    { api: E2E_API_URL, amount },
  );
}

/** 페이지 안에서, 목이 든 익명키 그대로 거래 목록을 읽는다. */
async function listTransactionIds(page: Page): Promise<string[]> {
  return page.evaluate(async (api) => {
    const key =
      (window as unknown as { __ait?: { state?: { auth?: { anonymousKeyHash?: string } } } }).__ait
        ?.state?.auth?.anonymousKeyHash ?? '';

    const response = await fetch(`${api}/api/v1/transactions`, {
      headers: { 'X-Anon-Key': key },
    });
    const body = (await response.json()) as { items?: { id: string }[] };
    return (body.items ?? []).map((item) => item.id);
  }, E2E_API_URL);
}

test('테스트마다 다른 익명키가 목에 주입된다', async ({ page, appShell, anonKey }) => {
  await appShell.open();

  const probe = await probeAnonKey(page);

  expect(probe.mockPresent, 'devtools 목 상태가 페이지에 없다').toBe(true);
  expect(probe.key).toBe(anonKey);
  expect(probe.key).not.toBe(DEVTOOLS_DEFAULT_KEY);
});

test('한쪽이 저장한 거래가 다른 쪽에 보이지 않는다', async ({
  page,
  appShell,
  anonKey,
  browser,
}) => {
  await appShell.open();

  // 이웃 컨텍스트. 같은 테스트 안이지만 익명키가 다르다.
  const neighbourKey = `${anonKey}-neighbour`;
  const neighbourContext = await browser.newContext({ baseURL: E2E_WEB_URL });
  const neighbour = await neighbourContext.newPage();
  await neighbour.addInitScript(installAnonKeyTrap, neighbourKey);
  await new AppShell(neighbour).open();

  try {
    const mine = await probeAnonKey(page);
    const theirs = await probeAnonKey(neighbour);
    expect(mine.key).toBe(anonKey);
    expect(theirs.key).toBe(neighbourKey);
    expect(mine.key).not.toBe(theirs.key);

    const created = await createExpense(page, 12345);
    expect(created.status, `거래 저장이 실패했다: ${created.body}`).toBe(201);
    expect(created.id).not.toBeNull();

    const mineIds = await listTransactionIds(page);
    expect(mineIds, '내가 만든 거래가 내 목록에 있어야 한다').toContain(created.id);

    const theirIds = await listTransactionIds(neighbour);
    expect(theirIds, '이웃 익명키로는 내 거래가 보이면 안 된다').not.toContain(created.id);
  } finally {
    await neighbourContext.close();
  }
});
