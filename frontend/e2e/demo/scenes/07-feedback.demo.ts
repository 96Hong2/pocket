import { expect, test } from '../support/director';
import { formatCurrency } from '../../../src/shared/lib/format';

/**
 * 저장 뒤 화면을 찍는다.
 *
 * 11 은 예산이 없을 때. 저장 뒤 화면은 「내 가계부에 적었어요」 와 방금 적은 한 줄이 주인공이고,
 * 남은 돈이나 큰 지출을 따로 말하지 않는다. 남은 돈은 홈이 늘 들고 있다.
 * 12 는 예산이 있을 때. 예산 안이면 똑같이 아무 말도 안 하고, 넘은 지출에만 그 한 줄이 붙는다.
 * 줄이 떴는지만 보면 판정 실패와 정상이 구분되지 않아서 문장을 금액까지 통째로 단언한다.
 */

const CATEGORY = '식비';

/** 예산이 없을 때 적는 두 건. */
const SMALL = 12_000;
const LARGE = 50_000;

/** 예산이 있을 때. 500,000원 예산에 두 번을 이어 넣어 넘기는 순간을 본다. */
const BUDGET = 500_000;
const STEADY = 20_000;
const OVER = 500_000;

test('11 저장하면 어디에 무엇을 적었는지 보여 준다', async ({ demo, home, prep, recordSheet }) => {
  // 홈 맨 위 남은 돈이 음수로 서지 않게 월급을 심는다. 오늘 날짜로 둔다.
  // 며칠 전 기록만 있으면 홈이 복구 카드(「며칠 놓쳤어도 괜찮아요」)부터 세운다.
  await prep.addTransaction({
    amount: 3_200_000,
    type: 'income',
    merchant: '월급',
    categoryId: await prep.categoryIdByName('월급'),
  });
  await home.open();
  await home.waitReady();

  await demo.open('저장한 뒤 화면', '어디에 적었는지와 방금 적은 한 줄이 먼저 보인다');

  await demo.step('예산은 아직 없다. 기록하기에서 다음을 누르고 12,000원을 찍는다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.openKeypad();
  await recordSheet.input.enterAmount(SMALL);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(SMALL));

  await demo.step('식비를 누르는 것이 곧 저장이다');
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();

  await demo.step('가장 크게 내 가계부에 적었다고 말하고, 아래에 방금 적은 한 줄이 선다');
  await expect(recordSheet.feedback.headline).toHaveText('내 가계부에 적었어요');
  await expect(recordSheet.feedback.savedAmount).toHaveText(formatCurrency(SMALL));
  // 덧붙이는 말이 없다. 남은 돈은 홈이 늘 들고 있다.
  await expect(recordSheet.feedback.detail).toHaveCount(0);
  await demo.beat(3);

  await demo.step('무엇으로 냈는지는 여기서 고른다. 적는 화면에는 이 칸이 없다');
  await expect(recordSheet.feedback.paymentGroup).toBeVisible();
  await demo.beat(2);

  await demo.step('확인을 누르면 닫히고 홈의 쓴 돈이 올라가 있다');
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SMALL));
  await demo.beat();

  await demo.step('50,000원처럼 큰 지출도 저장 뒤 화면은 같다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.openKeypad();
  await recordSheet.input.enterAmount(LARGE);
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();
  await expect(recordSheet.feedback.headline).toHaveText('내 가계부에 적었어요');
  await expect(recordSheet.feedback.detail).toHaveCount(0);
  await demo.beat(3);

  await demo.step('닫으면 홈의 쓴 돈이 두 건을 더한 값이다');
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SMALL + LARGE));
  await demo.clearStep();
  await demo.beat(2);
});

test('12 예산을 넘었을 때만 저장 뒤에 한 줄 알린다', async ({ demo, home, prep, recordSheet }) => {
  // 예산은 배경이라 API 로 심는다. 이 영상이 보여줄 것은 저장 뒤 화면이다.
  await prep.setBudget(BUDGET);

  await home.open();
  await home.waitReady();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET));

  await demo.open('예산을 넘으면 한 줄', '예산 안에서는 아무 말도 안 하고, 넘은 순간에만 알린다');

  await demo.step('이번 달 예산은 500,000원. 20,000원을 식비로 적는다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.openKeypad();
  await recordSheet.input.enterAmount(STEADY);
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();

  await demo.step('예산 안이라 남은 예산을 세어 주지 않는다. 적었다는 말뿐이다');
  await expect(recordSheet.feedback.headline).toHaveText('내 가계부에 적었어요');
  await expect(recordSheet.feedback.detail).toHaveCount(0);
  await expect(recordSheet.sheet).not.toContainText('남은 예산');
  await demo.beat(3);

  await demo.step('확인하고 500,000원을 더 적는다');
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.openKeypad();
  await recordSheet.input.enterAmount(OVER);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(OVER));
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();

  await demo.step('이번에는 예산을 넘었다. 얼마나 넘었는지 한 줄만 붙는다');
  await expect(recordSheet.feedback.card).toContainText('예산 초과');
  await expect(recordSheet.feedback.detail).toHaveText(
    `이번 달 예산을 ${formatCurrency(STEADY + OVER - BUDGET)} 넘었어요.`,
  );
  await demo.beat(3);

  await demo.step('홈으로 돌아오면 남은 예산이 음수고 게이지가 꽉 찬다');
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - STEADY - OVER));
  expect(await home.hero.gaugePercent(), '예산을 넘겼는데 게이지가 꽉 차지 않았다').toBe(100);
  await demo.clearStep();
  await demo.beat(2);
});
