import { formatCurrency, toLedgerDate } from '../../../src/shared/lib/format';
import type { HomeScreen } from '../../screens/HomeScreen';
import type { RecordSheet } from '../../screens/RecordSheet';
import { expect, test } from '../support/director';

/**
 * 홈이 상황마다 다른 얼굴로 뜨는 것을 두 영상에 담는다.
 *
 * 03 은 얼굴이 바뀌는 순서다. 첫 진입, 며칠 비운 뒤의 복구 카드, 예산을 정한 뒤, 다시 적은 뒤.
 * 04 는 예산 게이지의 색이다. 0% 부터 100% 까지는 같은 세이지고, 넘기는 순간에만 앰버로 바뀐다.
 * 배경 상태는 prep 으로 심고, 보여줄 동작은 홈 화면에서 실제로 누른다.
 */

const CATEGORY = '식비';

/** 며칠 비운 상태. 복구 카드는 사흘째부터 뜬다. */
const AWAY_DAYS = 4;
const AWAY_AMOUNT = 9_000;

/**
 * 비운 날의 지출 중 이번 달에 잡히는 몫.
 *
 * 나흘 전은 달 초에는 지난달이고 그 뒤로는 이번 달이다. 히어로·게이지는 달력 월만 세므로
 * 어느 쪽이든 한 값으로 박아 두면 매달 5일을 넘기는 순간부터 이 영상이 깨진다.
 */
function awayInThisMonth(): number {
  const now = new Date();
  const away = new Date();
  away.setDate(away.getDate() - AWAY_DAYS);
  const sameMonth = toLedgerDate(away).slice(0, 7) === toLedgerDate(now).slice(0, 7);
  return sameMonth ? AWAY_AMOUNT : 0;
}

const BUDGET = 300_000;
const CATCH_UP_AMOUNT = 12_000;

const GAUGE_BUDGET = 100_000;
/** 30% 까지 채운다. */
const PART_SPEND = 30_000;
/** 남은 것을 정확히 다 쓴다. 여기서 100% 가 된다. */
const FILL_SPEND = GAUGE_BUDGET - PART_SPEND;
/** 예산을 넘긴다. 남은 예산이 이만큼 마이너스가 된다. */
const OVER_SPEND = 30_000;

/** 홈에서 한 건 적고 시트를 닫는다. 이 파일 안에서만 쓰는 절차라 여기 둔다. */
async function recordOnce(home: HomeScreen, sheet: RecordSheet, amount: number): Promise<void> {
  await home.recordButton.click();
  await sheet.waitOpen();
  await sheet.input.enterAmount(amount);
  await expect(sheet.input.amountText).toHaveText(formatCurrency(amount));
  await sheet.input.pickCategory(CATEGORY);
  await sheet.feedback.waitSaved();
  await sheet.feedback.confirmButton.click();
  await sheet.waitClosed();
}

test('03 홈이 상황마다 다른 얼굴로 뜬다', async ({ page, home, recordSheet, prep, demo }) => {
  await home.open();
  await home.waitReady();
  await demo.open('상황마다 다른 홈', '예산과 기록이 어떤 상태냐에 따라 홈이 다른 얼굴로 뜬다');

  await demo.step('첫 진입. 예산도 기록도 없다');
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(0));
  await expect(home.hero.gauge).toHaveCount(0);
  await expect(home.budget.saveButton).toHaveCount(0);
  await expect(home.recovery.catchUpButton).toHaveCount(0);
  await demo.beat(2);

  await demo.step('예산부터 묻지 않는다. 부담 덜기 두 줄과 기록 버튼뿐이다');
  await expect(home.hero.firstLead).toBeVisible();
  await demo.beat(2);

  await demo.step('아래 오늘 목록도 비어 있다');
  // 목록은 하단 탭바에 가려지는 자리다. 화면 안으로 들여놓지 않으면 영상에 온전히 안 잡힌다.
  await home.today.reveal();
  await expect(home.today.empty).toBeInViewport();
  await demo.beat(2);
  await home.scrollToTop();

  await demo.step(`${AWAY_DAYS}일 전 기록 하나만 남기고 홈을 다시 연다`);
  const foodId = await prep.categoryIdByName(CATEGORY);
  await prep.addExpense({ amount: AWAY_AMOUNT, daysAgo: AWAY_DAYS, categoryId: foodId });
  await page.reload();
  await home.waitReady();

  await demo.step('며칠 비웠다. 빠진 날을 세는 대신 다음 한 걸음만 준다');
  await expect(home.recovery.lead(AWAY_DAYS)).toBeVisible();
  await expect(home.recovery.catchUpButton).toBeVisible();
  // 기록이 생겼으니 첫 진입 문구는 걷힌다.
  await expect(home.hero.firstLead).toHaveCount(0);
  await demo.beat(3);

  await demo.step('기록이 하나 생겼으니 예산 제안 카드도 같이 붙는다');
  await expect(home.budget.suggestLead).toBeVisible();
  await expect(home.budget.saveButton).toBeVisible();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(awayInThisMonth()));
  await demo.beat(3);

  await demo.step(`제안 카드에 이번 달 예산 ${formatCurrency(BUDGET)}을 넣는다`);
  await home.budget.set(BUDGET);

  await demo.step('히어로가 남은 예산으로 바뀌고 제안 카드는 걷힌다. 복구 카드는 남는다');
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - awayInThisMonth()));
  await expect(home.budget.saveButton).toHaveCount(0);
  await expect(home.recovery.catchUpButton).toBeVisible();
  expect(await home.hero.gaugePercent(), '게이지가 안 생겼다').toBe(
    Math.round((awayInThisMonth() / BUDGET) * 100),
  );
  await demo.beat(3);

  await demo.step('복구 카드의 버튼으로 하나 적어 본다');
  await home.recovery.catchUpButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(CATCH_UP_AMOUNT);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(CATCH_UP_AMOUNT));
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await demo.step('오늘 적었으니 복구 카드가 걷힌다. 남은 예산도 그만큼 줄었다');
  await expect(home.recovery.catchUpButton).toHaveCount(0);
  await expect(home.hero.remainingBudget).toHaveText(
    formatCurrency(BUDGET - awayInThisMonth() - CATCH_UP_AMOUNT),
  );
  await demo.beat(2);

  await demo.step('오늘 목록에도 방금 적은 것이 한 줄로 남는다');
  await home.today.reveal();
  await expect(home.today.row(CATEGORY)).toBeInViewport();
  await demo.beat(2);

  await demo.clearStep();
  await demo.beat(2);
});

test('04 예산 게이지는 넘길 때만 색이 바뀐다', async ({ home, recordSheet, prep, demo }) => {
  // 예산만 심는다. 지출은 화면에서 하나씩 적어 게이지가 차는 것을 그대로 찍는다.
  await prep.setBudget(GAUGE_BUDGET);

  await home.open();
  await home.waitReady();
  await demo.open('예산 게이지', '0% 부터 100% 까지는 같은 색이고, 넘기는 순간에만 색이 바뀐다');

  await demo.step(`이번 달 예산 ${formatCurrency(GAUGE_BUDGET)}. 아직 한 푼도 안 썼다`);
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(GAUGE_BUDGET));
  await expect(home.hero.spendPercent).toHaveText('0% 썼어요');
  expect(await home.hero.gaugePercent(), '게이지가 안 생겼다').toBe(0);
  await demo.beat(3);

  await demo.step(`${formatCurrency(PART_SPEND)}을 적는다`);
  await recordOnce(home, recordSheet, PART_SPEND);

  await demo.step('게이지가 30% 까지 찬다. 색은 세이지다');
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(GAUGE_BUDGET - PART_SPEND));
  await expect(home.hero.spendPercent).toHaveText('30% 썼어요');
  expect(await home.hero.gaugePercent()).toBe(30);
  // 여기서 잰 색을 기준으로 삼는다. 뒤에서 이 값과 같은지 다른지로 색이 바뀌었는지 가린다.
  const sage = await home.hero.gaugeFillColor();
  await demo.beat(3);

  await demo.step(`남은 ${formatCurrency(FILL_SPEND)}을 정확히 다 쓴다`);
  await recordOnce(home, recordSheet, FILL_SPEND);

  await demo.step('딱 100%. 꽉 찼는데도 색은 그대로다');
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(0));
  await expect(home.hero.spendPercent).toHaveText('100% 썼어요');
  await expect(home.hero.dailyAllowance).toHaveText(formatCurrency(0));
  expect(await home.hero.gaugePercent()).toBe(100);
  expect(await home.hero.gaugeFillColor(), '100% 인데 벌써 색이 바뀌었다').toBe(sage);
  await demo.beat(3);

  await demo.step(`여기서 ${formatCurrency(OVER_SPEND)}을 더 쓴다`);
  await recordOnce(home, recordSheet, OVER_SPEND);

  await demo.step('넘긴 순간 게이지가 앰버로 바뀐다. 남은 예산은 마이너스다');
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(-OVER_SPEND));
  // 막대는 100% 에서 멈춘다. 얼마나 넘겼는지는 옆 문구가 말한다.
  await expect(home.hero.spendPercent).toHaveText('130% 썼어요');
  expect(await home.hero.gaugePercent()).toBe(100);
  expect(await home.hero.gaugeFillColor(), '예산을 넘겼는데 색이 그대로다').not.toBe(sage);
  await demo.beat(3);

  await demo.step('색이 바뀌는 경계는 초과 하나뿐이다. 중간 경고 구간은 없다');
  await demo.beat(2);

  await demo.clearStep();
  await demo.beat(2);
});
