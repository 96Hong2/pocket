import { formatCurrency, toLedgerDate } from '../../../src/shared/lib/format';
import { expect, test } from '../support/director';

/**
 * 이 앱의 한 바퀴를 화면으로 찍는다.
 *
 * 01 은 처음 연 홈에서 12,000원을 식비로 남기고, 저장한 줄을 눌러 고치는 데까지 간다.
 * 기록하기, 다음, 금액, 분류. 고르는 화면은 기본값이 골라져 있어 「다음」 한 번이면 된다.
 * 02 는 그 뒤 이야기다. 예산을 정하면 게이지가 생기고 기록할수록 찬다.
 */

/** 히어로 라벨 앞에 붙는 달. 기기 시간대가 아니라 가계부 시간대로 얻는다. */
const MONTH_NUMBER = Number(toLedgerDate(new Date()).slice(5, 7));

const AMOUNT = 12_000;
/** 저장한 줄을 눌러 고쳐 넣는 금액. 처음 값과 자릿수가 달라 화면에서 갈린다. */
const FIXED_AMOUNT = 30_000;
const SECOND_AMOUNT = 100_000;
const CATEGORY = '식비';
const BUDGET = 500_000;

test('01 처음 열어 기록하고 그 자리에서 고치기까지 한 바퀴', async ({
  demo,
  home,
  recordSheet,
}) => {
  await home.open();
  await demo.open(
    '10초 기록 한 바퀴',
    '고르는 화면에서 다음, 금액, 분류를 누르면 저장. 저장한 줄에서 바로 고치기까지',
  );
  await home.waitReady();

  // 첫 진입. 예산을 묻는 화면이 아니라 0원과 부담 덜기 한마디로 시작한다.
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(0));
  await expect(home.hero.remainingBudget).toHaveCount(0);
  await expect(home.hero.gauge).toHaveCount(0);
  await expect(home.hero.firstLead).toBeVisible();
  await expect(home.today.empty).toBeVisible();
  await demo.beat(2);

  await demo.step('처음 열어도 예산부터 묻지 않아요. 이번 달 남은 돈과 번 돈, 쓴 돈만 보여줍니다');
  // 예산이 없으면 히어로는 수입·지출 갈래로 떨어진다(homeMode.ts resolveHeroLayout).
  await expect(home.hero.label).toHaveText(`${MONTH_NUMBER}월 · 이번 달 남은 돈`);
  await demo.beat(2);

  await demo.step('기록하기를 누르면 오늘, 직접 입력, 지출이 미리 골라져 있어요');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.dayButton).toContainText('오늘');
  await expect(recordSheet.methodTab('직접 입력')).toHaveAttribute('aria-checked', 'true');
  await expect(recordSheet.kindChip('지출')).toHaveAttribute('aria-checked', 'true');
  await demo.beat(2);

  await demo.step('그대로 다음을 누르면 금액 화면이에요');
  await recordSheet.next();
  await expect(recordSheet.amountTitle).toHaveText('얼마 썼어요?');
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(0));
  // 안내 줄 없이 금액과 칩만 선다. 누를 곳이 곧 설명이다.
  await expect(recordSheet.input.hint).toHaveCount(0);
  await expect(recordSheet.input.categoryChip(CATEGORY)).toBeEnabled();
  await demo.beat(2);

  await demo.step('키패드로 금액만 찍어요');
  await recordSheet.input.enterAmount(AMOUNT);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(AMOUNT));
  await demo.beat(2);

  await demo.step('식비를 누르는 것이 곧 저장이에요');
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();

  await demo.clearStep();
  await expect(recordSheet.feedback.headline).toHaveText('내 가계부에 적었어요');
  await expect(recordSheet.feedback.savedAmount).toHaveText(formatCurrency(AMOUNT));
  await demo.beat(2);

  await demo.step('뒤에 있는 홈의 쓴 돈도 새로고침 없이 따라 올라갔어요');
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(AMOUNT));

  await demo.step('잘못 적었으면 저장한 줄의 금액을 눌러 고칩니다');
  await recordSheet.feedback.changeAmountButton.click();
  await recordSheet.feedback.enterAmount(FIXED_AMOUNT);
  await recordSheet.feedback.applyAmountButton.click();

  await demo.clearStep();
  await expect(recordSheet.feedback.savedAmount).toHaveText(formatCurrency(FIXED_AMOUNT));
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(FIXED_AMOUNT));
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
