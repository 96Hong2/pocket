import type { Locator } from '@playwright/test';

import { expect, test } from '../support/fixtures';

/**
 * 달을 넘길 때 화면이 안 움직인다.
 *
 * 화면 녹화를 보고 잡은 자리다. 지난달 예산을 찾으려고 화살표를 여러 번 누르는데,
 * 누를 때마다 예산 카드 자리가 회색 줄 하나로 줄었다가 다시 카드로 부풀었다.
 * 그 아래 목록이 통째로 위아래로 뛰어서, 다음 화살표를 누르려던 손가락이 다른 것을 눌렀다.
 *
 * **단언은 「보인다」 가 아니라 「같은 자리에 있다」 다.** 자리표시자가 떠 있는 것만
 * 확인하면 그것이 얼마나 높은지는 아무도 안 본다. 실제로 그렇게 통과하고 있었다.
 */

const BUDGETS = '**/api/v1/budgets?*';
const SUMMARY = '**/api/v1/transactions/summary?*';
const CALENDAR = '**/api/v1/transactions/calendar?*';

/** 그 칸의 화면상 y 좌표. 못 재면 실패시킨다(없는 것을 0 으로 적으면 늘 같아진다). */
async function topOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  expect(box, '잴 대상이 화면에 없다').not.toBeNull();
  return box!.y;
}

/**
 * 여기서 잡으려는 것은 **손가락이 빗나갈 만큼의 밀림**이다.
 *
 * 예전에는 `Math.round` 로 잰 값을 그대로 맞췄다. 그런데 예산 자리는 불러오는 중과
 * 다 불러온 뒤가 **0.4px** 다르다(실측 580.015625 → 580.421875). 이건 원래 있던 차이고
 * 눈에 보이지 않는다. 다만 위쪽 카드 높이가 조금만 바뀌어도 그 0.4px 가 반올림 경계를
 * 넘나들어, 아무 관계 없는 회차에서 이 검사만 빨개졌다.
 *
 * 그래서 재는 자를 뜻에 맞춘다. **1px 미만은 같은 자리로 본다.** 이 검사가 잡으려던
 * 사고는 예산 카드가 회색 줄 하나로 줄면서 아래가 120px 뛴 것이라 그대로 걸린다.
 */
function expectSamePlace(now: number, before: number, message: string): void {
  expect(Math.abs(now - before), `${message} (${before} → ${now})`).toBeLessThan(1);
}

test('관리 탭에서 달을 넘겨도 아래 목록이 제자리에 있다', async ({ manage, page }) => {
  await manage.open();
  await manage.waitReady();

  // 예산이 없는 지난달로 간다. 거기서 또 지난달로 가는 동안을 본다.
  await manage.goToMonth('2026년 8월');
  await expect(manage.closedNotice).toBeVisible();

  const below = page.getByRole('navigation', { name: '관리 하위 화면' });
  const before = await topOf(below);

  // 응답을 늦춰 불러오는 중인 화면을 붙잡아 둔다. 안 그러면 너무 빨라 못 본다.
  await page.route(BUDGETS, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.fallback();
  });

  await page.getByRole('button', { name: '2026년 7월로 이동' }).click();

  await test.step('불러오는 동안에도 같은 자리다', async () => {
    // 자리표시자가 떠 있는 그 순간을 잡는다.
    await expect(page.getByRole('status', { name: '예산을 불러오는 중이에요' })).toBeVisible();
    expectSamePlace(await topOf(below), before, '예산 자리가 줄어 아래가 밀렸다');
  });

  await test.step('다 불러온 뒤에도 같은 자리다', async () => {
    await manage.waitReady();
    expectSamePlace(await topOf(below), before, '다 불러온 뒤 아래가 밀렸다');
  });
});

test('달력에서 달을 넘겨도 격자와 목록이 제자리에 있다', async ({ calendar, page }) => {
  await calendar.open();
  await calendar.waitReady();

  const gridTop = await topOf(calendar.grid.box);
  const searchTop = await topOf(calendar.search.input);

  await page.route(SUMMARY, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.fallback();
  });
  await page.route(CALENDAR, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.fallback();
  });

  await page.getByRole('button', { name: /^2026년 \d{1,2}월로 이동$/ }).first().click();

  await test.step('합계 자리가 카드로 부풀지 않는다', async () => {
    await expect(page.getByRole('status', { name: '이번 달 합계를 불러오는 중이에요' })).toBeVisible();
    expectSamePlace(await topOf(calendar.grid.box), gridTop, '합계 자리가 부풀어 달력이 밀렸다');
    expectSamePlace(await topOf(calendar.search.input), searchTop, '검색 칸이 밀렸다');
  });

  await test.step('다 불러온 뒤에도 같은 자리다', async () => {
    await calendar.waitReady();
    expectSamePlace(await topOf(calendar.grid.box), gridTop, '다 불러온 뒤 달력이 밀렸다');
    expectSamePlace(await topOf(calendar.search.input), searchTop, '다 불러온 뒤 검색 칸이 밀렸다');
  });
});

/**
 * 달력 격자는 **어느 달이든 여섯 줄**이다.
 *
 * 다섯 줄인 달과 여섯 줄인 달을 오가면 격자 높이가 48px 씩 오르내리고, 그 아래 검색 칸과
 * 목록이 통째로 따라 움직인다. 날 수가 달라지는 것은 어쩔 수 없지만 줄 수는 못 박을 수 있다.
 */
test('달마다 격자 높이가 같다', async ({ calendar, page }) => {
  await calendar.open();
  await calendar.waitReady();

  const heights: number[] = [];
  for (const label of ['2026년 8월', '2026년 7월', '2026년 6월']) {
    await calendar.goToMonth(label);
    await calendar.waitReady();
    const box = await calendar.grid.box.boundingBox();
    expect(box).not.toBeNull();
    heights.push(Math.round(box!.height));
  }

  // 8월은 여섯 줄, 6월은 다섯 줄이 나오는 달이다. 채워 두지 않으면 여기서 갈린다.
  expect(new Set(heights).size, `달마다 격자 높이가 다르다: ${heights.join(' · ')}`).toBe(1);
  await expect(page.getByRole('group', { name: '날짜 고르기' })).toBeVisible();
});

/**
 * 한 번이 아니라 **잇달아** 넘겨도 제자리다.
 *
 * 한 걸음만 재면 다섯 줄 달과 여섯 줄 달을 오가는 자리를 못 본다. 지난 달을 찾느라
 * 화살표를 대여섯 번 누르는 것이 실제 쓰임이라, 그만큼 눌러 보고 아래 목록이 어디에
 * 있는지 매번 잰다.
 */
test('달력에서 여러 달을 잇달아 넘겨도 검색 칸과 목록이 제자리에 있다', async ({
  calendar,
  page,
}) => {
  await calendar.open();
  await calendar.waitReady();

  const list = page.getByRole('region', { name: '고른 날 기록' });
  const gridTop = await topOf(calendar.grid.box);
  const searchTop = await topOf(calendar.search.input);
  const listTop = await topOf(list);

  for (let step = 0; step < 6; step += 1) {
    await page
      .getByRole('button', { name: /^\d{4}년 \d{1,2}월로 이동$/ })
      .first()
      .click();
    await calendar.waitReady();
    const label = await calendar.monthLabel.textContent();
    expect(await topOf(calendar.grid.box), `${label} 에서 격자가 밀렸다`).toBe(gridTop);
    expect(await topOf(calendar.search.input), `${label} 에서 검색 칸이 밀렸다`).toBe(searchTop);
    expect(await topOf(list), `${label} 에서 목록이 밀렸다`).toBe(listTop);
  }
});

/**
 * 리포트도 마찬가지다.
 *
 * 달을 옮기면 리포트가 통째로 다시 온다. 그 사이 화면이 월 선택기 하나로 줄면, 아래로
 * 굴려 보던 사람이 맨 위로 튕긴다. 자리만 잡아 두면 굴린 자리가 그대로 남는다.
 */
test('리포트가 달을 옮기는 동안 한 줄로 줄지 않는다', async ({ report, page }) => {
  await report.open();
  await report.waitReady();

  await page.route('**/api/v1/reports/monthly?*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.fallback();
  });

  await report.goPreviousMonth();

  const slot = page.locator('.report__slot');
  await expect(slot).toBeVisible();
  const box = await slot.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height, '본문 자리가 사라져 화면이 통째로 접혔다').toBeGreaterThanOrEqual(400);
});
