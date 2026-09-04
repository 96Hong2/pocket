import {
  formatCurrency,
  formatMonthLabel,
  shiftMonth,
  toLedgerDate,
} from '../../src/shared/lib/format';
import { lastMonth, thisMonth } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * 예산의 경계값과 달 경계.
 *
 * `budget.spec.ts` 가 예산을 정하고 고치는 보통의 흐름을 덮는다. 여기는 그 흐름의
 * 딱 한 칸 옆을 본다. 정확히 다 썼을 때, 1원 넘겼을 때, 예산에서 뺀 거래가 섞였을 때,
 * 달을 두 칸 건너뛰었을 때다. 부등호 하나가 뒤집히면 여기가 먼저 빨개진다.
 *
 * 기대값은 규칙에서 계산해 적는다. 화면이 적어 둔 숫자를 읽어다 기대값을 만들면
 * 서버가 틀린 값을 줘도 앞뒤가 맞아 그대로 통과한다.
 */

const THIS_MONTH = thisMonth();
const LAST_MONTH = lastMonth();
/** 이어쓰기가 한 칸만 건너뛰는지 보려고 두 칸 물러난다. */
const TWO_MONTHS_AGO = shiftMonth(THIS_MONTH, -2);

const MONTH_NUMBER = Number(THIS_MONTH.slice(5, 7));
const NO_BUDGET_TITLE = `아직 ${MONTH_NUMBER}월 예산이 없어요`;

/**
 * 이번 달에 남은 일수. 오늘을 포함해 마지막 날까지 센다. 서버가 세는 방식과 같다.
 *
 * 화면이 적어 둔 일수를 읽어 오면 서버가 하루 적게 줘도 하루 가용액과 앞뒤가 맞아
 * 통과한다. 달력에서 직접 세어 못 박는다. 오늘은 기기 시간대가 아니라 가계부
 * 시간대로 얻는다. UTC 로 도는 CI 에서 하루 어긋난다.
 */
function remainingDaysThisMonth(): number {
  const [year, month, day] = toLedgerDate(new Date()).split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return lastDay - day + 1;
}

/** 진행 중인 달의 카드 캡션. 서버가 남은 일수로 나눈 하루 가용액까지 함께 못 박는다. */
function runningCaption(percent: number, remaining: number): string {
  const days = remainingDaysThisMonth();
  const daily = Math.floor(Math.max(0, remaining) / days);
  return `${percent}% 사용 · 하루 ${formatCurrency(daily)} · ${days}일 남음`;
}

// ── 다 썼을 때와 넘겼을 때 ──────────────────────────────

test('예산을 정확히 다 쓰면 남은 예산이 0원이고 아직 초과는 아니다', async ({
  appShell,
  home,
  manage,
  prep,
}) => {
  await prep.setBudget(300_000);
  await prep.addExpense({ amount: 300_000, daysAgo: 0 });

  await manage.open();
  await manage.waitReady();

  await expect(manage.total.used).toHaveText(formatCurrency(300_000));
  await expect(manage.total.left).toHaveText(formatCurrency(0));
  expect(await manage.total.gaugePercent(), '딱 맞춰 쓴 게이지가 100 이 아니다').toBe(100);
  // 남은 돈이 0 이라 하루에 쓸 수 있는 돈도 0 이다. 여기서 음수가 나오면 안 된다.
  await expect(manage.total.caption).toHaveText(runningCaption(100, 0));

  await appShell.goToTab('홈');
  await home.waitReady();

  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(0));
  // 딱 맞춰 쓴 사람에게 초과라고 말하지 않는다. 100% 까지는 지킨 것이다.
  await expect(home.hero.spendPercent).toHaveText('100% 썼어요');
  await expect(home.hero.dailyAllowance).toHaveText(formatCurrency(0));
  expect(await home.hero.gaugePercent(), '홈 게이지가 100 이 아니다').toBe(100);
});

test('예산을 넘기면 게이지는 100에서 멈추고 퍼센트와 남은 예산은 넘긴 만큼 말한다', async ({
  home,
  prep,
  recordSheet,
}) => {
  await prep.setBudget(300_000);
  await prep.addExpense({ amount: 240_000, daysAgo: 0 });

  await home.open();
  await home.waitReady();

  expect(await home.hero.gaugePercent(), '기록 전 게이지가 80 이 아니다').toBe(80);
  const calmColor = await home.hero.gaugeFillColor();

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(90_000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  await expect(recordSheet.feedback.headline).toHaveText(
    `이번 달 예산을 ${formatCurrency(30_000)} 넘었어요.`,
  );
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  // 막대는 잘려도 숫자는 잘리면 안 된다. 1원 넘긴 사람과 30,000원 넘긴 사람이 같아 보인다.
  expect(await home.hero.gaugePercent(), '넘긴 뒤 게이지가 100 에서 안 멈췄다').toBe(100);
  await expect(home.hero.spendPercent).toHaveText('110% 썼어요');
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(-30_000));
  await expect(home.hero.dailyAllowance).toHaveText(formatCurrency(0));

  expect(await home.hero.gaugeFillColor(), '넘겼는데 게이지 색이 그대로다').not.toBe(calmColor);
});

// ── 예산에 안 세는 것들 ─────────────────────────────────

test('예산 제외 거래는 게이지와 남은 예산을 건드리지 않는다', async ({
  appShell,
  home,
  manage,
  prep,
}) => {
  await prep.setBudget(200_000);
  await prep.addExpense({ amount: 50_000, daysAgo: 0 });
  await prep.addTransaction({ amount: 100_000, daysAgo: 0, excludedFromBudget: true });

  await manage.open();
  await manage.waitReady();

  // 화면이 '남은 예산 + 쓴 돈' 으로 되짚으면 여기서 100,000 이 섞여 들어온다.
  await expect(manage.total.used).toHaveText(formatCurrency(50_000));
  await expect(manage.total.left).toHaveText(formatCurrency(150_000));
  expect(await manage.total.gaugePercent(), '제외 거래가 게이지에 섞였다').toBe(25);
  await expect(manage.total.caption).toHaveText(runningCaption(25, 150_000));

  await appShell.goToTab('홈');
  await home.waitReady();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(150_000));
});

test('수입과 이체는 예산 사용액에 섞이지 않는다', async ({ manage, prep }) => {
  await prep.setBudget(300_000);
  await prep.addExpense({ amount: 90_000, daysAgo: 0 });
  await prep.addTransaction({ amount: 2_000_000, daysAgo: 0, type: 'income' });
  await prep.addTransaction({ amount: 500_000, daysAgo: 0, type: 'transfer' });

  await manage.open();
  await manage.waitReady();

  // 월급이 들어온 달에 예산이 순식간에 초과로 뜨거나, 계좌 이체 한 번에 게이지가 튀면 안 된다.
  await expect(manage.total.used).toHaveText(formatCurrency(90_000));
  await expect(manage.total.left).toHaveText(formatCurrency(210_000));
  expect(await manage.total.gaugePercent(), '수입이나 이체가 게이지에 섞였다').toBe(30);
  await expect(manage.total.caption).toHaveText(runningCaption(30, 210_000));
});

// ── 카테고리 한도의 경계 ────────────────────────────────

test('카테고리 주의 칩은 80%에서 붙고 79%에서는 붙지 않는다', async ({ manage, prep }) => {
  const food = await prep.categoryIdByName('식비');
  const transport = await prep.categoryIdByName('교통');
  await prep.setBudget(600_000);
  await prep.setCategoryBudget(food, 100_000);
  await prep.setCategoryBudget(transport, 100_000);
  await prep.addExpense({ amount: 80_000, daysAgo: 0, categoryId: food });
  await prep.addExpense({ amount: 79_000, daysAgo: 0, categoryId: transport });

  await manage.open();
  await manage.waitReady();

  // 칩은 넘긴 뒤가 아니라 넘기기 전에 보여야 한다. 경계가 한 칸 밀리면 여기가 뒤집힌다.
  await expect(manage.categories.caution('식비')).toBeVisible();
  await expect(manage.categories.caution('교통')).toHaveCount(0);

  await expect(manage.categories.used('식비')).toHaveText(formatCurrency(80_000));
  await expect(manage.categories.cap('식비')).toHaveText(formatCurrency(100_000));
  await expect(manage.categories.used('교통')).toHaveText(formatCurrency(79_000));
  await expect(manage.categories.cap('교통')).toHaveText(formatCurrency(100_000));
});

test('카테고리 한도를 딱 채우면 초과가 아니고, 1원을 더 쓰면 그때 초과라고 말한다', async ({
  appShell,
  home,
  manage,
  prep,
  recordSheet,
}) => {
  const food = await prep.categoryIdByName('식비');
  await prep.setBudget(600_000);
  await prep.setCategoryBudget(food, 100_000);
  await prep.addExpense({ amount: 100_000, daysAgo: 0, categoryId: food });

  await manage.open();
  await manage.waitReady();

  await expect(manage.categories.used('식비')).toHaveText(formatCurrency(100_000));
  await expect(manage.categories.cap('식비')).toHaveText(formatCurrency(100_000));
  await expect(manage.categories.caution('식비')).toBeVisible();
  expect(await manage.categories.gaugePercent('식비'), '딱 채운 게이지가 100 이 아니다').toBe(100);
  // 넘겼는지는 줄에 글로 적히지 않고 색으로만 갈린다. 지금 색을 들고 있다가 뒤에서 견준다.
  const withinColor = await manage.categories.gaugeFillColor('식비');

  await appShell.goToTab('홈');
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(1);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  // 넘긴 금액을 어디서 빼는지가 여기서 드러난다. 1원이 아니면 기준이 틀린 것이다.
  await expect(recordSheet.feedback.headline).toHaveText(
    `식비에서 예산을 ${formatCurrency(1)} 넘었어요.`,
  );
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await appShell.goToTab('관리');
  await manage.waitReady();

  await expect(manage.categories.used('식비')).toHaveText(formatCurrency(100_001));
  expect(await manage.categories.gaugePercent('식비'), '게이지가 100 에서 안 멈췄다').toBe(100);
  expect(
    await manage.categories.gaugeFillColor('식비'),
    '한도를 넘겼는데 줄 색이 딱 채웠을 때와 같다',
  ).not.toBe(withinColor);

  // 카테고리만 넘겼다. 전체 예산은 아직 남아 있어야 한다.
  await expect(manage.total.left).toHaveText(formatCurrency(499_999));
});

// ── 달 경계 ─────────────────────────────────────────────

test('이어쓴 예산을 지운 뒤 직접 다시 정하면 배너 없이 그 금액이 남는다', async ({
  manage,
  prep,
}) => {
  await prep.setBudget(500_000, LAST_MONTH);

  await manage.open();
  await manage.waitReady();
  await expect(manage.banner.text).toBeVisible();
  await expect(manage.total.amount).toHaveText(formatCurrency(500_000));

  await manage.total.remove();
  await expect(manage.total.emptyTitle).toHaveText(NO_BUDGET_TITLE);

  // 지운 자리는 자동 이어쓰기를 막으려고 남긴 표시다. 직접 정하는 것까지 막으면 안 된다.
  await manage.total.start(300_000);

  await expect(manage.total.amount).toHaveText(formatCurrency(300_000));
  // 직접 정한 예산에 '지난달에서 가져왔어요' 가 붙으면 어디서 온 금액인지 거짓말이 된다.
  await expect(manage.banner.card).toHaveCount(0);

  await manage.open();
  await manage.waitReady();
  await expect(manage.total.amount).toHaveText(formatCurrency(300_000));
  await expect(manage.banner.card).toHaveCount(0);
});

test('이어쓰기는 한 칸만 건너뛴다. 두 달 전 예산은 지난달에도 이번 달에도 생기지 않는다', async ({
  manage,
  prep,
}) => {
  await prep.setBudget(400_000, TWO_MONTHS_AGO);

  await manage.open();
  await manage.waitReady();

  // 직전 한 기간만 본다. 두 칸 앞의 예산까지 끌어오지 않는다.
  await expect(manage.total.emptyTitle).toHaveText(NO_BUDGET_TITLE);
  await expect(manage.banner.card).toHaveCount(0);

  await manage.goToMonth(formatMonthLabel(LAST_MONTH));

  // 지난달을 넘겨보는 것만으로 없던 예산이 생기면, 끝난 달이라 고칠 수도 지울 수도 없다.
  await expect(manage.total.emptyTitle).toHaveText('이 달엔 예산이 없었어요');
  await expect(manage.banner.card).toHaveCount(0);

  await manage.goToMonth(formatMonthLabel(TWO_MONTHS_AGO));
  await expect(manage.total.amount).toHaveText(formatCurrency(400_000));

  await manage.goToMonth(formatMonthLabel(LAST_MONTH));
  await manage.goToMonth(formatMonthLabel(THIS_MONTH));

  await expect(manage.total.emptyTitle).toHaveText(NO_BUDGET_TITLE);
  await expect(manage.banner.card).toHaveCount(0);
});

// ── 관리 탭과 홈이 같은 예산을 본다 ─────────────────────

test('관리 탭에서 예산을 지우면 홈이 쓴 돈 화면으로 돌아간다', async ({
  appShell,
  home,
  manage,
  prep,
}) => {
  await prep.setBudget(300_000);
  await prep.addExpense({ amount: 50_000, daysAgo: 0 });

  await home.open();
  await home.waitReady();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(250_000));

  await appShell.goToTab('관리');
  await manage.waitReady();
  await manage.total.remove();
  await expect(manage.total.emptyTitle).toHaveText(NO_BUDGET_TITLE);

  await appShell.goToTab('홈');
  await home.waitReady();

  // 홈은 달을 안 붙여 부르고 관리 탭은 붙여 부른다. 한쪽만 낡으면 여기가 어긋난다.
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(50_000));
  await expect(home.hero.remainingBudget).toHaveCount(0);
  await expect(home.hero.gauge).toHaveCount(0);
  await expect(home.hero.dailyAllowance).toHaveCount(0);
  // 기록은 그대로 있으니 예산을 다시 권하는 카드가 돌아온다.
  await expect(home.budget.suggestLead).toBeVisible();
});

test('홈에서 정한 예산이 관리 탭에 같은 금액으로 뜬다', async ({
  appShell,
  home,
  manage,
  prep,
}) => {
  await prep.addExpense({ amount: 20_000, daysAgo: 0 });

  await home.open();
  await home.waitReady();
  await expect(home.budget.suggestLead).toBeVisible();

  await home.budget.set(400_000);
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(380_000));

  await appShell.goToTab('관리');
  await manage.waitReady();

  // 여기가 어긋나면 홈에는 예산이 있는데 관리 탭은 '아직 예산이 없어요' 라고 말한다.
  await expect(manage.total.amount).toHaveText(formatCurrency(400_000));
  await expect(manage.total.used).toHaveText(formatCurrency(20_000));
  await expect(manage.total.left).toHaveText(formatCurrency(380_000));
  expect(await manage.total.gaugePercent(), '관리 탭 게이지가 홈과 다른 값을 그렸다').toBe(5);
  await expect(manage.total.caption).toHaveText(runningCaption(5, 380_000));
});
