import type { Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';
import { formatCurrency } from '../../src/shared/lib/format';
import { keyStrokesFor } from '../screens/RecordSheet';
import { expect, test } from '../support/fixtures';

/**
 * 첫 바퀴. 홈에서 저장하고 되돌리기까지 한 번 도는 것을 실제 화면으로 증명한다.
 *
 * 확인 항목이 곧 이 파일의 단계다. 새 컨텍스트가 곧 새 계정이라 매 실행이 빈 상태에서 시작한다.
 * 금액 기대값은 화면과 같은 포맷 함수로 만든다. 손으로 적으면 포맷을 바꿀 때 두 곳을 고쳐야 한다.
 */

const AMOUNT = 12_000;
const CATEGORY = '식비';
const BUDGET = 500_000;

/** 홈 CTA · 금액 · 카테고리. 금액은 몇 번을 누르든 한 단계로 센다. */
const EXPECTED_STEPS = 3;

/** 탭 계수기가 페이지에 남기는 자리. 이 이름으로 심고 이 이름으로 읽는다. */
const TAP_COUNT_KEY = '__pocketTapCount';

/**
 * 화면이 실제로 받은 탭을 센다.
 *
 * 이 함수 본문은 브라우저에서 돈다. 바깥 스코프를 참조하면 안 된다.
 * 테스트가 스스로 세면 앱이 아니라 테스트 코드를 검사하게 된다.
 */
function installTapCounter(key: string): void {
  const store = window as unknown as Record<string, number>;
  store[key] = 0;
  window.addEventListener(
    'click',
    () => {
      store[key] += 1;
    },
    true,
  );
}

async function tapCount(page: Page, key: string): Promise<number> {
  const count = await page.evaluate(
    (name) => (window as unknown as Record<string, number | undefined>)[name],
    key,
  );
  if (count == null) {
    throw new Error('탭 계수기가 페이지에 없다. 초기 스크립트가 걸리지 않았거나 화면이 다시 떴다');
  }
  return count;
}

test('처음 열어 기록하고 되돌리기까지 한 바퀴', async ({ page, home, recordSheet }) => {
  await page.addInitScript(installTapCounter, TAP_COUNT_KEY);

  await test.step('질문 없이 홈이 보인다', async () => {
    await home.open();
    await home.waitReady();

    // 예산을 정하기 전에는 남은 예산 대신 이번 달 지출만 보여준다. 첫 진입에 예산을 묻지 않는다.
    await expect(home.hero.monthSpent).toHaveText(formatCurrency(0));
    await expect(home.hero.remainingBudget).toHaveCount(0);
    await expect(home.hero.gauge).toHaveCount(0);
  });

  await test.step('12,000원 식비를 저장한다', async () => {
    await home.recordButton.click();
    await recordSheet.waitOpen();

    await recordSheet.input.enterAmount(AMOUNT);
    await expect(recordSheet.input.amountText).toHaveText(formatCurrency(AMOUNT));

    // 카테고리를 누르는 것이 곧 저장이다. 저장 버튼을 따로 누르지 않는다.
    await recordSheet.input.pickCategory(CATEGORY);
    await recordSheet.feedback.waitSaved();
  });

  await test.step('저장까지 세 단계를 넘지 않는다', async () => {
    // 금액 키패드 연타는 한 단계로 친다. 남는 것은 홈 CTA 와 카테고리 두 번뿐이어야 한다.
    // 화면에 확인 버튼 같은 조작이 하나라도 붙으면 실제로 누른 탭이 늘어 여기서 깨진다.
    const amountKeys = keyStrokesFor(AMOUNT).length;
    const taps = await tapCount(page, TAP_COUNT_KEY);

    expect(
      taps - amountKeys,
      `저장까지 탭 ${taps}번(금액 키 ${amountKeys}번 포함)이 필요했다`,
    ).toBe(EXPECTED_STEPS - 1);
  });

  await test.step('피드백에 이번 달 지출이 실제 숫자로 뜬다', async () => {
    // 판정이 실패해도 서버는 빈 결과로 201 을 준다. 그때 숫자 자리가 비므로
    // 카드가 떴는지가 아니라 금액 문자열이 찍혔는지를 본다.
    await expect(recordSheet.feedback.headline).toContainText(formatCurrency(AMOUNT));
  });

  await test.step('되돌리면 홈 숫자가 원래대로 돌아온다', async () => {
    // 되돌리기 전에 홈 숫자가 실제로 움직였는지부터 본다. 여기가 비면 왕복을 증명하지 못한다.
    // 시트는 포털이라 홈이 뒤에 그대로 붙어 있어 시트가 열린 채로도 잡힌다.
    await expect(home.hero.monthSpent).toHaveText(formatCurrency(AMOUNT));

    await recordSheet.feedback.undo();
    await recordSheet.waitClosed();

    // 새로고침 없이 돌아와야 한다. 다시 부르면 이 단언은 배선이 빠져도 통과한다.
    await expect(home.hero.monthSpent).toHaveText(formatCurrency(0));
    expect(new URL(page.url()).pathname).toBe(ROUTES.home);
  });
});

test('예산을 정하면 게이지가 생기고 기록할수록 찬다', async ({ home, recordSheet }) => {
  await test.step('첫 기록을 해야 예산 제안이 뜬다', async () => {
    await home.open();
    await home.waitReady();

    // 기록이 하나도 없을 때는 예산을 묻지 않는다.
    await expect(home.budget.saveButton).toHaveCount(0);

    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.input.enterAmount(AMOUNT);
    await recordSheet.input.pickCategory(CATEGORY);
    await recordSheet.feedback.waitSaved();
    await recordSheet.feedback.confirmButton.click();
    await recordSheet.waitClosed();

    await expect(home.budget.saveButton).toBeVisible();
  });

  let firstPercent = 0;

  await test.step('예산을 정하면 남은 예산과 하루 가용액이 보인다', async () => {
    await home.budget.set(BUDGET);

    const remaining = BUDGET - AMOUNT;
    await expect(home.hero.remainingBudget).toHaveText(formatCurrency(remaining));

    // 하루 가용액은 서버가 남은 일수로 나눠 준다. 화면이 다시 계산하지 않는다.
    // 그래서 화면이 함께 그리는 남은 일수로 되짚는다. 다른 값을 실어 보내면 여기서 깨진다.
    const days = await home.hero.remainingDays();
    expect(days, '남은 일수가 화면에 없다').not.toBeNull();
    const perDay = Math.floor(remaining / Math.max(1, days ?? 0));
    await expect(home.hero.dailyAllowance).toHaveText(formatCurrency(perDay));

    const percent = await home.hero.gaugePercent();
    expect(percent, '게이지가 없다').not.toBeNull();
    firstPercent = percent ?? 0;
  });

  await test.step('한 번 더 기록하면 게이지가 움직인다', async () => {
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.input.enterAmount(100_000);
    await recordSheet.input.pickCategory(CATEGORY);
    await recordSheet.feedback.waitSaved();
    await recordSheet.feedback.confirmButton.click();
    await recordSheet.waitClosed();

    await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - AMOUNT - 100_000));

    await expect
      .poll(() => home.hero.gaugePercent(), { message: '게이지가 그대로다' })
      .toBeGreaterThan(firstPercent);
  });
});

test('저장 응답이 300ms 안에 온다', async ({ page, home, recordSheet }) => {
  await home.open();
  await home.waitReady();

  await home.recordButton.click();
  await recordSheet.waitOpen();

  // 첫 저장은 계정을 만드는 왕복이 섞인다. 그것을 워밍업으로 쓰고 두 번째를 잰다.
  await recordSheet.input.enterAmount(1000);
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/transactions') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
  );

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(2000);
  await recordSheet.input.pickCategory(CATEGORY);

  const response = await saved;
  // waitForResponse 는 헤더를 받은 시점에 풀린다. 본문을 다 읽기 전의 responseEnd 는 -1 이라
  // 이 줄이 없으면 elapsed 가 항상 음수가 되어 아래 단언이 무슨 값이 와도 통과한다.
  await response.finished();

  const timing = response.request().timing();
  const elapsed = timing.responseEnd - timing.requestStart;

  // 음수면 시간을 못 잰 것이다. 못 잰 채로 초록이 되지 않게 여기서 먼저 막는다.
  expect(elapsed, '저장 응답 시간을 재지 못했다').toBeGreaterThan(0);
  expect(elapsed, `저장 응답이 ${Math.round(elapsed)}ms 걸렸다`).toBeLessThan(300);
});

test('되돌리기 버튼이 남은 초를 세어 보여준다', async ({ home, recordSheet, prep }) => {
  /*
    카운트다운 단언이 데모 녹화에만 있어서 CI 가 지키지 않았다.
    만료(12초를 기다려 409 를 받는 것)는 여기 옮기지 않는다. 고정 대기가 필요해
    검증 규약과 부딪히고, 그 장면은 데모 13번이 계속 보여준다.
  */
  const categoryId = await prep.categoryIdByName('식비');
  await prep.addExpense({ amount: 20_000, daysAgo: 0, categoryId });

  await home.open();
  await home.waitReady();
  await home.recordButton.click();

  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(12_000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  const started = await recordSheet.feedback.undoSecondsLeft();
  expect(started, '되돌리기 배지가 남은 초를 못 그렸다').not.toBeNull();
  expect(started).toBeGreaterThan(0);
  expect(started).toBeLessThanOrEqual(8);

  // 숫자가 실제로 줄어드는지 본다. 멈춘 배지는 창이 흐르는 것을 증명하지 않는다.
  await expect
    .poll(() => recordSheet.feedback.undoSecondsLeft(), { timeout: 5_000 })
    .toBeLessThan(started as number);
});
