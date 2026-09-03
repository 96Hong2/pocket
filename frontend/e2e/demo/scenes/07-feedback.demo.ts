import { expect, test } from '../support/director';
import { formatCurrency, toLedgerDate } from '../../../src/shared/lib/format';

/**
 * 저장 직후 한마디가 상황마다 달라지는 것을 찍는다.
 *
 * 11 은 예산을 정하기 전. 이번 달 사실만 말하다가, 30,000원을 넘기면 그 지출부터 짚는다.
 * 12 는 예산을 정한 뒤. 계획대로 갈 때, 속도가 빠를 때, 예산을 넘겼을 때 세 가지가 이어진다.
 * 카드가 떴는지만 보면 판정 실패와 정상이 구분되지 않아서 문장을 금액까지 통째로 단언한다.
 */

const CATEGORY = '식비';

/** 예산이 없을 때. 30,000원이 큰 지출 기준이라 그 아래와 위를 하나씩 찍는다. */
const SMALL = 12_000;
const LARGE = 50_000;

/** 예산이 있을 때. 500,000원 예산에 세 번을 이어 넣으며 한마디가 바뀌는 것을 본다. */
const BUDGET = 500_000;
const STEADY = 20_000;
const FAST = 100_000;
const OVER = 400_000;

/** 속도 주의는 이번 달이 이 일수를 채워야 잡힌다. 서버의 MIN_PACE_ELAPSED_DAYS 와 같은 값이다. */
const MIN_PACE_ELAPSED_DAYS = 3;

interface MonthProgress {
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
}

/**
 * 오늘이 이번 달 며칠째이고 며칠 남았는지.
 *
 * 서버가 가계부 기준 시간대로 오늘을 판정하므로 여기서도 같은 기준을 쓴다.
 * 남은 일수에는 오늘이 들어간다.
 */
function monthProgress(): MonthProgress {
  const [year, month, day] = toLedgerDate(new Date()).split('-').map(Number);
  const totalDays = new Date(year, month, 0).getDate();
  return { totalDays, elapsedDays: day, remainingDays: totalDays - day + 1 };
}

/** 하루 가용액. 남은 예산을 남은 일수로 나눈 내림값이다. 넘치면 안 되니 올리지 않는다. */
function dailyAllowance(remaining: number, remainingDays: number): number {
  return Math.floor(Math.max(0, remaining) / Math.max(1, remainingDays));
}

/** 지금 속도로 갔을 때 월말 예상 지출. 이번 달 지출을 날짜 진행률로 나눈 값이다. */
function projectedMonthEnd(spend: number, progress: MonthProgress): number {
  return Math.round((spend * progress.totalDays) / progress.elapsedDays);
}

test('11 예산이 없을 때 저장 직후 한마디', async ({ demo, home, recordSheet }) => {
  const monthTotal = SMALL + LARGE;

  await home.open();
  await home.waitReady();

  await demo.open('저장하면 바로 한마디', '예산을 정하기 전에는 이번 달 사실만 말한다');

  await demo.step('예산은 아직 없다. 12,000원을 적어 본다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(SMALL);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(SMALL));

  await demo.step('카테고리를 누르는 것이 곧 저장이다');
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();

  await demo.step('예산이 없으니 이번 달 쓴 돈만 알려 준다');
  // 판정이 실패해도 서버는 빈 결과로 201 을 주고 그때도 kind 는 month_fact 다.
  // 카드가 떴는지로는 실패를 못 가르므로 금액이 박힌 문장 전체를 본다.
  await expect(recordSheet.feedback.headline).toHaveText(
    `이번 달 ${formatCurrency(SMALL)} 썼어요.`,
  );
  // 예산이 없으면 둘째 줄에 붙일 숫자가 없어 아예 그리지 않는다.
  await expect(recordSheet.feedback.detail).toHaveCount(0);
  // 조심할 것이 없는 한마디라 배지도 붙지 않는다.
  await expect(recordSheet.feedback.card).not.toContainText('주의');
  await demo.beat(2);

  await demo.step('확인을 누르면 시트가 닫힌다');
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SMALL));
  await demo.beat();

  await demo.step('이번엔 50,000원. 30,000원을 넘으면 큰 지출로 본다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(LARGE);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(LARGE));

  await demo.step('같은 식비로 저장한다');
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();

  await demo.step('한마디가 바뀐다. 방금 쓴 금액부터 짚어 준다');
  await expect(recordSheet.feedback.headline).toHaveText(
    `${formatCurrency(LARGE)}, 평소보다 큰 지출이에요.`,
  );
  // 예산이 없어 둘째 줄이 남은 예산 대신 이번 달 합계로 떨어진다.
  await expect(recordSheet.feedback.detail).toHaveText(
    `이번 달 쓴 돈은 ${formatCurrency(monthTotal)}이에요.`,
  );
  await expect(recordSheet.feedback.card).not.toContainText('주의');
  await demo.beat(3);

  await demo.step('닫으면 홈 숫자도 같은 값이다');
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(monthTotal));
  await demo.clearStep();
  await demo.beat(2);
});

test('12 예산이 있을 때 저장 직후 한마디', async ({ demo, home, prep, recordSheet }) => {
  const progress = monthProgress();

  const afterSteady = STEADY;
  const afterFast = STEADY + FAST;
  const afterOver = STEADY + FAST + OVER;
  const projectedAfterFast = projectedMonthEnd(afterFast, progress);

  // 예산은 배경이라 API 로 심는다. 이 영상이 보여줄 것은 저장 직후의 한마디다.
  await prep.setBudget(BUDGET);

  await home.open();
  await home.waitReady();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET));

  // 속도 주의는 이번 달 초반에만 성립한다. 달이 흐를수록 같은 지출로는 예상 지출이 예산에
  // 못 미쳐 계획대로(on_track)로 떨어진다. 그때는 문장이 어긋나기 전에 이유를 말하고 멈춘다.
  expect(
    progress.elapsedDays >= MIN_PACE_ELAPSED_DAYS && projectedAfterFast > BUDGET,
    `속도 주의 장면이 오늘 날짜에서는 서지 않는다. 이번 달 ${progress.elapsedDays}일차라 ` +
      `${formatCurrency(afterFast)}를 써도 예상 지출이 ${formatCurrency(projectedAfterFast)}다. ` +
      '달 초반에 다시 찍거나 금액을 다시 잡아야 한다',
  ).toBe(true);

  await demo.open('예산이 있으면 말이 달라진다', '계획대로 · 속도 주의 · 예산 초과가 차례로 온다');

  await demo.step('이번 달 예산은 500,000원. 20,000원을 적는다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(STEADY);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(STEADY));

  await demo.step('식비로 저장한다');
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();

  await demo.step('계획대로 가는 중이라 남은 예산과 하루 몫을 알려 준다');
  await expect(recordSheet.feedback.headline).toHaveText(
    `남은 예산은 ${formatCurrency(BUDGET - afterSteady)}이에요.`,
  );
  await expect(recordSheet.feedback.detail).toHaveText(
    `남은 ${progress.remainingDays}일 동안 하루 ` +
      `${formatCurrency(dailyAllowance(BUDGET - afterSteady, progress.remainingDays))}씩 쓸 수 있어요.`,
  );
  await expect(recordSheet.feedback.card).not.toContainText('주의');
  await demo.beat(2);

  await demo.step('확인하고 이어서 100,000원을 적는다');
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(FAST);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(FAST));

  await demo.step('저장하면 이번엔 주의가 붙는다');
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();

  await demo.step('아직 예산 안이지만 이 속도면 월말에 넘는다고 말해 준다');
  await expect(recordSheet.feedback.card).toContainText('주의');
  await expect(recordSheet.feedback.headline).toHaveText(
    `지금 속도면 이번 달 ${formatCurrency(projectedAfterFast)}쯤 쓰게 돼요.`,
  );
  // 겁만 주지 않는다. 예산 안에서 지낼 하루 몫을 함께 준다.
  await expect(recordSheet.feedback.detail).toHaveText(
    `남은 ${progress.remainingDays}일 하루 ` +
      `${formatCurrency(dailyAllowance(BUDGET - afterFast, progress.remainingDays))}이면 예산 안에서 지낼 수 있어요.`,
  );
  await demo.beat(3);

  await demo.step('확인하고 400,000원을 마저 적는다');
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(OVER);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(OVER));

  await demo.step('이걸 저장하면 이번 달 예산을 넘는다');
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();

  await demo.step('얼마나 넘었는지만 말하고 탓하지 않는다');
  await expect(recordSheet.feedback.card).toContainText('예산 초과');
  await expect(recordSheet.feedback.headline).toHaveText(
    `이번 달 예산을 ${formatCurrency(afterOver - BUDGET)} 넘었어요.`,
  );
  await expect(recordSheet.feedback.detail).toHaveText(
    `남은 ${progress.remainingDays}일은 조금 천천히 가도 괜찮아요.`,
  );
  await demo.beat(3);

  await demo.step('홈으로 돌아오면 남은 예산이 음수고 게이지가 꽉 찬다');
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - afterOver));
  expect(await home.hero.gaugePercent(), '예산을 넘겼는데 게이지가 꽉 차지 않았다').toBe(100);
  await demo.clearStep();
  await demo.beat(2);
});
