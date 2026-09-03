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

test('처음 열어 기록하고 되돌리기까지 한 바퀴', async ({ page, home, recordSheet }) => {
  await test.step('질문 없이 홈이 보인다', async () => {
    await home.open();
    await home.waitReady();

    // 예산을 정하기 전에는 남은 예산 대신 이번 달 지출만 보여준다. 첫 진입에 예산을 묻지 않는다.
    await expect(home.monthSpent).toHaveText(formatCurrency(0));
    await expect(home.remainingBudget).toHaveCount(0);
    await expect(home.gauge).toHaveCount(0);
  });

  let steps = 0;
  let keyPresses = 0;

  await test.step('12,000원 식비를 저장한다', async () => {
    await home.recordButton.click();
    steps += 1;
    await recordSheet.waitOpen();

    keyPresses = await recordSheet.enterAmount(AMOUNT);
    steps += 1;
    await expect(recordSheet.amountText).toHaveText(formatCurrency(AMOUNT));

    // 카테고리를 누르는 것이 곧 저장이다. 저장 버튼을 따로 누르지 않는다.
    await recordSheet.pickCategory(CATEGORY);
    steps += 1;
    await recordSheet.waitSaved();
  });

  await test.step('저장까지 세 단계를 넘지 않는다', () => {
    expect(steps).toBe(EXPECTED_STEPS);
    // 실제로 누른 키 수도 함께 남긴다. 흐름에 조작이 늘면 이 값이 먼저 움직인다.
    expect(keyPresses).toBe(keyStrokesFor(AMOUNT).length);
  });

  await test.step('피드백에 이번 달 지출이 실제 숫자로 뜬다', async () => {
    // 판정이 실패해도 서버는 빈 결과로 201 을 준다. 그때 숫자 자리가 비므로
    // 카드가 떴는지가 아니라 금액 문자열이 찍혔는지를 본다.
    await expect(recordSheet.feedbackHeadline).toContainText(formatCurrency(AMOUNT));
  });

  await test.step('되돌리면 홈 숫자가 원래대로 돌아온다', async () => {
    await recordSheet.undo();
    await recordSheet.waitClosed();

    // 새로고침 없이 돌아와야 한다. 다시 부르면 이 단언은 배선이 빠져도 통과한다.
    await expect(home.monthSpent).toHaveText(formatCurrency(0));
    expect(page.url()).toContain('/');
  });
});

test('예산을 정하면 게이지가 생기고 기록할수록 찬다', async ({ home, recordSheet }) => {
  await test.step('첫 기록을 해야 예산 제안이 뜬다', async () => {
    await home.open();
    await home.waitReady();

    // 기록이 하나도 없을 때는 예산을 묻지 않는다.
    await expect(home.saveBudgetButton).toHaveCount(0);

    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.enterAmount(AMOUNT);
    await recordSheet.pickCategory(CATEGORY);
    await recordSheet.waitSaved();
    await recordSheet.confirmButton.click();
    await recordSheet.waitClosed();

    await expect(home.saveBudgetButton).toBeVisible();
  });

  let firstPercent = 0;

  await test.step('예산을 정하면 남은 예산과 하루 가용액이 보인다', async () => {
    await home.setBudget(BUDGET);

    await expect(home.remainingBudget).toHaveText(formatCurrency(BUDGET - AMOUNT));

    // 하루 가용액은 서버가 남은 일수로 나눠 준다. 화면이 다시 계산하지 않는다.
    const daily = await home.dailyAllowance.textContent();
    expect(daily, '하루 가용액이 비어 있다').toBeTruthy();
    expect(daily).not.toContain('NaN');

    const percent = await home.gaugePercent();
    expect(percent, '게이지가 없다').not.toBeNull();
    firstPercent = percent ?? 0;
  });

  await test.step('한 번 더 기록하면 게이지가 움직인다', async () => {
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.enterAmount(100_000);
    await recordSheet.pickCategory(CATEGORY);
    await recordSheet.waitSaved();
    await recordSheet.confirmButton.click();
    await recordSheet.waitClosed();

    await expect(home.remainingBudget).toHaveText(formatCurrency(BUDGET - AMOUNT - 100_000));

    await expect
      .poll(() => home.gaugePercent(), { message: '게이지가 그대로다' })
      .toBeGreaterThan(firstPercent);
  });
});

test('저장 응답이 300ms 안에 온다', async ({ page, home, recordSheet }) => {
  await home.open();
  await home.waitReady();

  await home.recordButton.click();
  await recordSheet.waitOpen();

  // 첫 저장은 계정을 만드는 왕복이 섞인다. 그것을 워밍업으로 쓰고 두 번째를 잰다.
  await recordSheet.enterAmount(1000);
  await recordSheet.pickCategory(CATEGORY);
  await recordSheet.waitSaved();
  await recordSheet.confirmButton.click();
  await recordSheet.waitClosed();

  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/transactions') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
  );

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.enterAmount(2000);
  await recordSheet.pickCategory(CATEGORY);

  const response = await saved;
  const timing = response.request().timing();
  const elapsed = timing.responseEnd - timing.requestStart;

  expect(elapsed, `저장 응답이 ${Math.round(elapsed)}ms 걸렸다`).toBeLessThan(300);
});
