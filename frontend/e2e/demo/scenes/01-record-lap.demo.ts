import { formatCurrency } from '../../../src/shared/lib/format';
import { expect, test } from '../support/director';

/**
 * 이 앱의 한 바퀴를 화면으로 찍는다.
 *
 * 01 은 처음 연 홈에서 12,000원을 식비로 남기고 되돌리기까지 간다.
 * 홈 CTA · 금액 · 카테고리, 저장까지 세 단계뿐이라는 것이 이 영상의 볼거리다.
 * 02 는 그 뒤 이야기다. 예산을 정하면 게이지가 생기고 기록할수록 찬다.
 */

const AMOUNT = 12_000;
const SECOND_AMOUNT = 100_000;
const CATEGORY = '식비';
const BUDGET = 500_000;

test('01 처음 열어 기록하고 되돌리기까지 한 바퀴', async ({ demo, home, recordSheet }) => {
  await home.open();
  await demo.open('10초 기록 한 바퀴', '홈 CTA · 금액 · 카테고리, 세 단계로 저장하고 되돌리기까지');
  await home.waitReady();

  // 첫 진입. 예산을 묻는 화면이 아니라 0원과 부담 덜기 한마디로 시작한다.
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(0));
  await expect(home.hero.remainingBudget).toHaveCount(0);
  await expect(home.hero.gauge).toHaveCount(0);
  await expect(home.hero.firstLead).toBeVisible();
  await expect(home.today.empty).toBeVisible();
  await demo.beat(2);

  await demo.step('처음 열어도 예산부터 묻지 않아요. 이번 달 쓴 돈 0원만 보여줍니다');
  await demo.beat(2);

  await demo.step('1단계 · 홈에서 10초 기록을 누릅니다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(0));
  await expect(recordSheet.input.hint).toHaveText('금액을 누르고 카테고리를 고르면 바로 저장돼요');
  // 금액을 찍기 전에는 카테고리를 못 고른다. 순서가 화면에 박혀 있다.
  await expect(recordSheet.input.categoryChip(CATEGORY)).toBeDisabled();
  await demo.beat(2);

  await demo.step('2단계 · 키패드로 금액만 찍어요');
  await recordSheet.input.enterAmount(AMOUNT);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(AMOUNT));
  await expect(recordSheet.input.hint).toHaveText('카테고리를 고르면 저장돼요');
  await expect(recordSheet.input.categoryChip(CATEGORY)).toBeEnabled();
  await demo.beat(2);

  // 여기부터 되돌리기 창(8초)이 흐른다. 저장과 되돌리기 사이는 짧게 붙인다.
  await demo.step('3단계 · 식비를 누르는 것이 곧 저장이에요. 저장 버튼은 없습니다');
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();

  await demo.clearStep();
  await expect(recordSheet.feedback.headline).toHaveText(
    `이번 달 ${formatCurrency(AMOUNT)} 썼어요.`,
  );
  await demo.beat(2);

  await demo.step('뒤에 있는 홈 숫자도 새로고침 없이 따라 올라갔어요');
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(AMOUNT));

  await demo.step('잘못 눌렀으면 되돌리기 한 번이면 됩니다');
  await recordSheet.feedback.undo();
  await recordSheet.waitClosed();

  await demo.clearStep();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(0));
  await expect(home.today.empty).toBeVisible();
  await demo.beat(3);
});

test('02 예산을 정하면 게이지가 생기고 기록할수록 찬다', async ({ demo, home, recordSheet }) => {
  await home.open();
  await demo.open('예산과 게이지', '기록을 한 건 마쳐야 예산을 묻고, 정하고 나면 게이지가 찬다');
  await home.waitReady();

  await demo.step('기록이 하나도 없을 때는 예산을 묻지 않아요');
  await expect(home.budget.saveButton).toHaveCount(0);
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(0));
  await demo.beat(2);

  await demo.step('먼저 12,000원 식비를 한 건 남깁니다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(AMOUNT);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(AMOUNT));
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await demo.step('기록을 마치니 그때 예산 제안 카드가 붙었어요');
  await expect(home.budget.suggestLead).toBeVisible();
  await expect(home.budget.saveButton).toBeVisible();
  await expect(home.today.row(CATEGORY)).toBeVisible();
  await demo.beat(2);

  await demo.step('이번 달 예산으로 500,000원을 넣고 예산 정하기를 누릅니다');
  await home.budget.set(BUDGET);

  const remaining = BUDGET - AMOUNT;
  await demo.clearStep();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(remaining));
  // 예산을 정했으니 제안 카드는 할 일을 마치고 사라진다.
  await expect(home.budget.saveButton).toHaveCount(0);
  await demo.beat(2);

  await demo.step('히어로가 남은 예산으로 바뀌고 게이지와 하루 가용액이 생겼어요');
  // 하루 가용액은 서버가 남은 일수로 나눠 준다. 화면이 함께 그리는 일수로 되짚는다.
  const days = await home.hero.remainingDays();
  expect(days, '남은 일수가 화면에 없다').not.toBeNull();
  const perDay = Math.floor(remaining / Math.max(1, days ?? 0));
  await expect(home.hero.dailyAllowance).toHaveText(formatCurrency(perDay));

  const firstPercent = await home.hero.gaugePercent();
  expect(firstPercent, '게이지가 없다').not.toBeNull();
  await demo.beat(3);

  await demo.step('한 번 더 기록하면 그만큼 게이지가 찹니다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(SECOND_AMOUNT);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(SECOND_AMOUNT));
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();
  await demo.beat();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await demo.clearStep();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(remaining - SECOND_AMOUNT));
  await expect
    .poll(() => home.hero.gaugePercent(), { message: '게이지가 그대로다' })
    .toBeGreaterThan(firstPercent ?? 0);
  await demo.beat(3);
});
