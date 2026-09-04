import {
  formatCurrency,
  formatMonthLabel,
  shiftMonth,
  toLedgerDate,
} from '../../src/shared/lib/format';
import { lastMonth, thisMonth } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * 예산을 정하고 이어 쓰는 화면.
 *
 * 준비는 API 로 심고, 행동과 단언은 화면으로 한다. 배너·초과 표시·합계 안내처럼
 * 나중에 생기는 것은 뜨기 전 상태를 먼저 못 박고 나서 본다. 항상 떠 있는 문구를
 * 확인해 버리면 그 단언은 아무것도 지키지 않는다.
 *
 * 끝난 기간에 예산을 저장하면 서버가 422 로 막는다는 것은 여기서 못 본다.
 * e2e 스택은 지난달 예산을 심으려고 그 잠금을 열어 두기 때문이다. 잠금 자체는
 * 스위치가 꺼진 백엔드 API 테스트가 지킨다. 화면이 끝난 달을 읽기 전용으로
 * 그리는 것은 `is_editable` 이 진짜 규칙으로 오므로 여기서 그대로 검증된다.
 */

const THIS_MONTH = thisMonth();
const LAST_MONTH = lastMonth();
/** 예산을 한 번도 정한 적 없는 끝난 달을 보려고 두 칸 물러난다. */
const TWO_MONTHS_AGO = shiftMonth(THIS_MONTH, -2);

/** 화면이 빈 상태 제목에 적는 달. `아직 9월 예산이 없어요`. */
const MONTH_NUMBER = Number(THIS_MONTH.slice(5, 7));
const LAST_MONTH_NUMBER = Number(LAST_MONTH.slice(5, 7));

const NO_BUDGET_TITLE = `아직 ${MONTH_NUMBER}월 예산이 없어요`;

/**
 * 이번 달에 남은 일수. 오늘을 포함해 마지막 날까지 센다. 서버가 세는 방식과 같다.
 *
 * 화면이 적어 둔 일수를 읽어다 기대값을 만들면, 서버가 하루 적게 줘도 앞뒤가 맞아
 * 그대로 통과한다. 달력에서 직접 세어 못 박는다.
 *
 * 오늘은 기기 시간대가 아니라 가계부 시간대로 얻는다. UTC 로 도는 CI 에서 하루 어긋난다.
 */
function remainingDaysThisMonth(): number {
  const [year, month, day] = toLedgerDate(new Date()).split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return lastDay - day + 1;
}

/** 지난달 마지막 날은 며칠 전인가. 오늘이 며칠이든 그만큼 물러나면 지난달 말일이다. */
function daysAgoForLastMonth(): number {
  return Number(toLedgerDate(new Date()).slice(8, 10));
}

// ── 예산이 없는 상태 ────────────────────────────────────

test('예산이 없으면 관리 탭이 정하기를 권하고, 홈은 쓴 돈만 보여준다', async ({
  appShell,
  home,
  manage,
  recordSheet,
}) => {
  await manage.open();
  await manage.waitReady();

  await expect(manage.total.emptyTitle).toHaveText(NO_BUDGET_TITLE);
  // 왜 없는지는 화면이 모른다. 지난달 사정을 아는 척하지 않고 할 수 있는 것만 말한다.
  await expect(manage.total.emptyNote).toHaveText(
    '정하면 남은 예산과 하루에 쓸 수 있는 돈을 알려드려요.',
  );
  await expect(manage.total.startButton).toBeVisible();

  // 정한 것이 없으니 게이지도 숫자도 그리지 않는다.
  await expect(manage.total.gauge).toHaveCount(0);
  await expect(manage.total.left).toHaveCount(0);
  await expect(manage.total.caption).toHaveCount(0);
  // 카테고리 예산은 전체 예산을 정한 뒤에 나온다.
  await expect(manage.categories.addButton).toHaveCount(0);

  await appShell.goToTab('홈');
  await home.waitReady();

  // 예산이 없어도 앱은 온전히 돈다. 히어로는 쓴 돈만 말한다.
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(0));
  await expect(home.hero.remainingBudget).toHaveCount(0);
  await expect(home.hero.gauge).toHaveCount(0);
  await expect(home.hero.dailyAllowance).toHaveCount(0);

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(12_000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  // 예산이 없을 때의 한마디는 사실만 말한다.
  await expect(recordSheet.feedback.headline).toHaveText(
    `이번 달 ${formatCurrency(12_000)} 썼어요.`,
  );
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await expect(home.hero.monthSpent).toHaveText(formatCurrency(12_000));
  await expect(home.hero.gauge).toHaveCount(0);
  await expect(home.hero.dailyAllowance).toHaveCount(0);
});

// ── 전체 예산 ───────────────────────────────────────────

test('전체 예산을 정하면 그 자리에서 게이지가 생기고, 홈도 같은 값을 보여준다', async ({
  appShell,
  home,
  manage,
  prep,
}) => {
  await prep.addExpense({ amount: 120_000, daysAgo: 0 });

  await manage.open();
  await manage.waitReady();

  // 정하기 전에는 한도도 게이지도 캡션도 없다.
  await expect(manage.total.amount).toHaveCount(0);
  await expect(manage.total.gauge).toHaveCount(0);
  await expect(manage.total.caption).toHaveCount(0);

  await manage.total.start(600_000);

  await expect(manage.total.amount).toHaveText(formatCurrency(600_000));
  await expect(manage.total.used).toHaveText(formatCurrency(120_000));
  await expect(manage.total.left).toHaveText(formatCurrency(480_000));
  expect(await manage.total.gaugePercent(), '게이지가 사용률을 안 그렸다').toBe(20);

  // 하루 가용액은 서버가 남은 일수로 나눠 준다. 화면이 다시 계산하지 않는다.
  // 남은 일수도 캡션에서 읽어 오면 서버가 하루 적게 줘도 하루 가용액과 앞뒤가 맞아 통과한다.
  // 달력으로 직접 세어 두 숫자를 함께 못 박는다.
  const days = remainingDaysThisMonth();
  const daily = Math.floor(480_000 / days);
  await expect(manage.total.caption).toHaveText(
    `20% 사용 · 하루 ${formatCurrency(daily)} · ${days}일 남음`,
  );

  await appShell.goToTab('홈');
  await home.waitReady();

  // 홈은 달을 인자 없이 부른다. 캐시가 갈려 있어도 같은 값이 보여야 한다.
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(480_000));
  expect(await home.hero.gaugePercent(), '홈 게이지가 없다').toBe(20);
});

test('수정 시트는 지금 정해 둔 금액을 담아 열리고, 금액은 세 자리마다 끊어 보여준다', async ({
  manage,
  prep,
}) => {
  await prep.setBudget(1_200_000);

  await manage.open();
  await manage.waitReady();

  // 콤마 표기 자체가 확인 대상이라 여기서는 기대값을 직접 적는다.
  // formatCurrency 로 적으면 콤마가 사라질 때 기대값도 같이 사라져 아무것도 못 잡는다.
  await expect(manage.total.amount).toHaveText('1,200,000원');

  await manage.total.openEdit();
  // 빈 칸으로 열면 지금 얼마인지 모른 채 처음부터 다시 눌러야 한다.
  await expect(manage.total.sheet.amountField).toHaveValue('1,200,000');

  await manage.total.sheet.save(900_000);
  await expect(manage.total.amount).toHaveText('900,000원');

  // 다시 열면 방금 바꾼 값이 들어 있다. 처음 값이 남아 있지 않다.
  await manage.total.openEdit();
  await expect(manage.total.sheet.amountField).toHaveValue('900,000');
});

// ── 카테고리 예산 ───────────────────────────────────────

test('카테고리 예산은 정한 것만 목록에 남는다', async ({ manage, prep }) => {
  await prep.setBudget(600_000);

  await manage.open();
  await manage.waitReady();

  await expect(manage.categories.rows).toHaveCount(0);
  await expect(manage.categories.countBadge).toHaveText('0개');

  await manage.categories.add('식비', 200_000);
  await manage.categories.add('교통', 100_000);

  await expect(manage.categories.rows).toHaveCount(2);
  await expect(manage.categories.countBadge).toHaveText('2개');
  await expect(manage.categories.cap('식비')).toHaveText(formatCurrency(200_000));
  await expect(manage.categories.cap('교통')).toHaveText(formatCurrency(100_000));

  // 정하지 않은 카테고리를 0원으로 채워 넣지 않는다.
  await expect(manage.categories.row('쇼핑')).toHaveCount(0);
  await expect(manage.categories.row('생활')).toHaveCount(0);
});

test('정해 둔 카테고리 한도를 눌러 고치고, 지우면 목록에서 빠진다', async ({ manage, prep }) => {
  const food = await prep.categoryIdByName('식비');
  const transport = await prep.categoryIdByName('교통');
  await prep.setBudget(600_000);
  await prep.setCategoryBudget(food, 200_000);
  await prep.setCategoryBudget(transport, 100_000);

  await manage.open();
  await manage.waitReady();
  await expect(manage.categories.rows).toHaveCount(2);

  await manage.categories.openEdit('식비');

  // 고칠 때는 대상이 이미 정해져 있다. 다른 카테고리를 고르는 칩이 아예 없다.
  await expect(manage.categories.sheet.picker).toHaveCount(0);
  // 지금 한도를 담고 열려야 얼마에서 얼마로 바꾸는지 알고 고친다.
  await expect(manage.categories.sheet.amountField).toHaveValue('200,000');

  await manage.categories.sheet.save(250_000);

  await expect(manage.categories.cap('식비')).toHaveText('250,000원');
  await expect(manage.categories.rows).toHaveCount(2);

  await manage.categories.remove('교통');

  await expect(manage.categories.row('교통')).toHaveCount(0);
  await expect(manage.categories.rows).toHaveCount(1);
  await expect(manage.categories.countBadge).toHaveText('1개');

  // 지운 줄이 다음 조회에서 되살아나지 않고, 남긴 줄은 고친 값 그대로다.
  await manage.open();
  await manage.waitReady();
  await expect(manage.categories.row('교통')).toHaveCount(0);
  await expect(manage.categories.cap('식비')).toHaveText('250,000원');
});

test('그 카테고리로 지출하면 그 줄의 사용액이 움직인다', async ({
  appShell,
  home,
  manage,
  prep,
  recordSheet,
}) => {
  const food = await prep.categoryIdByName('식비');
  await prep.setBudget(600_000);
  await prep.setCategoryBudget(food, 200_000);

  await manage.open();
  await manage.waitReady();
  await expect(manage.categories.used('식비')).toHaveText(formatCurrency(0));

  await appShell.goToTab('홈');
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(30_000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await appShell.goToTab('관리');
  await manage.waitReady();

  await expect(manage.categories.used('식비')).toHaveText(formatCurrency(30_000));
  // 한도는 그대로다. 움직인 것은 사용액이다.
  await expect(manage.categories.cap('식비')).toHaveText(formatCurrency(200_000));
});

test('카테고리 예산을 넘겨 지출하면 저장 직후 그 카테고리를 말한다', async ({
  appShell,
  home,
  manage,
  prep,
  recordSheet,
}) => {
  const food = await prep.categoryIdByName('식비');
  await prep.setBudget(600_000);
  await prep.setCategoryBudget(food, 50_000);
  await prep.addExpense({ amount: 30_000, daysAgo: 0, categoryId: food });

  await manage.open();
  await manage.waitReady();

  // 아직 한도 안이다. 주의 칩도 붙지 않았다.
  await expect(manage.categories.used('식비')).toHaveText(formatCurrency(30_000));
  await expect(manage.categories.caution('식비')).toHaveCount(0);

  await appShell.goToTab('홈');
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(40_000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  // 전체 예산은 아직 남았다. 넘긴 것은 이 카테고리라고 짚어 말해야 한다.
  await expect(recordSheet.feedback.headline).toHaveText(
    `식비에서 예산을 ${formatCurrency(20_000)} 넘었어요.`,
  );
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await appShell.goToTab('관리');
  await manage.waitReady();

  await expect(manage.categories.used('식비')).toHaveText(formatCurrency(70_000));
  await expect(manage.categories.caution('식비')).toBeVisible();
});

test('카테고리 예산 합이 전체 예산보다 크면 한 줄로 알려 주고 저장은 막지 않는다', async ({
  manage,
  prep,
}) => {
  const food = await prep.categoryIdByName('식비');
  await prep.setBudget(300_000);
  await prep.setCategoryBudget(food, 200_000);

  await manage.open();
  await manage.waitReady();
  await expect(manage.categories.sumNotice).toHaveCount(0);

  await manage.categories.add('교통', 150_000);

  await expect(manage.categories.sumNotice).toHaveText(
    `카테고리 예산 합(${formatCurrency(350_000)})이 전체 예산(${formatCurrency(300_000)})보다 커요`,
  );
  // 알려 주기만 한다. 정한 한도는 그대로 저장돼 있다.
  await expect(manage.categories.rows).toHaveCount(2);
  await expect(manage.categories.cap('교통')).toHaveText(formatCurrency(150_000));
});

// ── 자동 이어쓰기 ───────────────────────────────────────

test('지난달 예산이 있으면 이번 달을 처음 열 때 그대로 넘어온다', async ({ manage, prep }) => {
  await manage.open();
  await manage.waitReady();

  // 지난달에 아무것도 없으면 넘어올 것도 없다.
  await expect(manage.banner.card).toHaveCount(0);
  await expect(manage.total.emptyTitle).toHaveText(NO_BUDGET_TITLE);

  const food = await prep.categoryIdByName('식비');
  await prep.setBudget(400_000, LAST_MONTH);
  await prep.setCategoryBudget(food, 150_000, LAST_MONTH);

  await manage.open();
  await manage.waitReady();

  await expect(manage.banner.text).toBeVisible();
  await expect(manage.total.amount).toHaveText(formatCurrency(400_000));
  // 금액만이 아니라 카테고리 한도까지 함께 넘어온다.
  await expect(manage.categories.rows).toHaveCount(1);
  await expect(manage.categories.cap('식비')).toHaveText(formatCurrency(150_000));
});

test('이어쓴 예산을 배너의 수정으로 바꾸면 배너가 사라진다', async ({ manage, prep }) => {
  await prep.setBudget(400_000, LAST_MONTH);

  await manage.open();
  await manage.waitReady();
  await expect(manage.banner.text).toBeVisible();
  await expect(manage.total.amount).toHaveText(formatCurrency(400_000));

  // '수정' 이라는 이름의 버튼이 둘이다. 배너 것과 카드 것이 따로 잡히는지 먼저 못 박는다.
  await expect(manage.banner.editButton).toHaveCount(1);
  await expect(manage.total.editButton).toHaveCount(1);

  await manage.banner.editButton.click();
  await manage.total.sheet.save(700_000);

  await expect(manage.banner.card).toHaveCount(0);
  await expect(manage.total.amount).toHaveText(formatCurrency(700_000));

  // 한 번 손댄 예산은 다시 열어도 이어쓴 것이 아니다.
  await manage.open();
  await manage.waitReady();
  await expect(manage.banner.card).toHaveCount(0);
  await expect(manage.total.amount).toHaveText(formatCurrency(700_000));
});

test('자동 이어쓰기를 끄면 다음 기간에 예산이 만들어지지 않는다', async ({ manage, prep }) => {
  await manage.open();
  await manage.waitReady();

  await expect(manage.settings.carryoverToggle).toHaveAttribute('aria-checked', 'true');
  await manage.settings.setCarryover(false);

  await prep.setBudget(500_000, LAST_MONTH);

  await manage.open();
  await manage.waitReady();
  await expect(manage.total.emptyTitle).toHaveText(NO_BUDGET_TITLE);
  await expect(manage.banner.card).toHaveCount(0);

  // 다시 켜면 같은 자리에서 이어쓰기가 일어난다. 꺼 둔 설정이 막고 있었다는 증거다.
  await manage.settings.setCarryover(true);

  await expect(manage.banner.text).toBeVisible();
  await expect(manage.total.amount).toHaveText(formatCurrency(500_000));
});

test('이어써진 예산을 지우면 다시 열어도 되살아나지 않는다', async ({ manage, prep }) => {
  await prep.setBudget(500_000, LAST_MONTH);

  await manage.open();
  await manage.waitReady();
  await expect(manage.banner.text).toBeVisible();
  await expect(manage.total.amount).toHaveText(formatCurrency(500_000));

  await manage.total.remove();

  await expect(manage.total.emptyTitle).toHaveText(NO_BUDGET_TITLE);
  await expect(manage.banner.card).toHaveCount(0);

  // 지운 자리가 남아 다음 조회에서 다시 복사되지 않는다.
  await manage.open();
  await manage.waitReady();
  await expect(manage.total.emptyTitle).toHaveText(NO_BUDGET_TITLE);
  await expect(manage.banner.card).toHaveCount(0);
});

// ── 끝난 달 ─────────────────────────────────────────────

test('지난달로 옮기면 고칠 입구가 모두 사라지고 보기만 할 수 있다', async ({
  manage,
  prep,
}) => {
  const food = await prep.categoryIdByName('식비');
  await prep.setBudget(600_000);
  await prep.setCategoryBudget(food, 200_000);
  await prep.setBudget(300_000, LAST_MONTH);
  await prep.setCategoryBudget(food, 100_000, LAST_MONTH);

  await manage.open();
  await manage.waitReady();

  // 이번 달에는 고칠 입구가 다 있다.
  await expect(manage.closedNotice).toHaveCount(0);
  await expect(manage.total.editButton).toBeVisible();
  await expect(manage.total.deleteButton).toBeVisible();
  await expect(manage.categories.addButton).toBeVisible();
  await expect(manage.categories.editButton('식비')).toBeVisible();

  await manage.goToMonth(formatMonthLabel(LAST_MONTH));

  await expect(manage.closedNotice).toBeVisible();
  await expect(manage.total.title).toHaveText(`${LAST_MONTH_NUMBER}월 전체 예산`);
  await expect(manage.total.amount).toHaveText(formatCurrency(300_000));
  await expect(manage.categories.cap('식비')).toHaveText(formatCurrency(100_000));

  // 입력·수정·추가가 하나도 없다.
  await expect(manage.total.editButton).toHaveCount(0);
  await expect(manage.total.deleteButton).toHaveCount(0);
  await expect(manage.total.startButton).toHaveCount(0);
  await expect(manage.categories.addButton).toHaveCount(0);
  await expect(manage.categories.editButton('식비')).toHaveCount(0);
});

test('끝난 달은 결과만 말하고, 예산이 없던 달에는 정하기를 권하지 않는다', async ({
  manage,
  prep,
}) => {
  // 지난달에는 300,000 을 정해 240,000 을 썼다. 그 앞 달에는 예산이 아예 없었다.
  await prep.setBudget(300_000, LAST_MONTH);
  await prep.addExpense({ amount: 240_000, daysAgo: daysAgoForLastMonth() });

  await manage.open();
  await manage.waitReady();
  await manage.goToMonth(formatMonthLabel(LAST_MONTH));

  await expect(manage.closedNotice).toBeVisible();
  await expect(manage.total.amount).toHaveText(formatCurrency(300_000));
  // 끝난 달에 하루 얼마·며칠 남음을 적으면 이제 와서 지킬 수 없는 것을 알려 주는 셈이다.
  await expect(manage.total.caption).toHaveText('80% 사용 · 예산 안에서 끝났어요');

  await manage.goToMonth(formatMonthLabel(TWO_MONTHS_AGO));

  await expect(manage.closedNotice).toBeVisible();
  await expect(manage.total.emptyTitle).toHaveText('이 달엔 예산이 없었어요');
  await expect(manage.total.emptyNote).toHaveText('예산 없이 기록만 해도 괜찮아요');
  // 끝난 달의 예산은 이제 와서 정할 수 없다. 권하는 문구도 버튼도 두지 않는다.
  await expect(manage.total.startButton).toHaveCount(0);
  await expect(manage.categories.addButton).toHaveCount(0);
});
