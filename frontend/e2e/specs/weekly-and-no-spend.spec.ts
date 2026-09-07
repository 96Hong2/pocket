import { formatCurrency, toLedgerDate } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * 이번 주에 쓸 수 있는 돈, 그리고 안 쓴 날 남기기.
 *
 * 두 기능이 한 파일에 있는 이유는 둘 다 홈 한 화면에서 만나기 때문이다.
 * 주간 값은 히어로가, 안 쓴 날은 그 아래 오늘 목록이 맡는다.
 *
 * 기대값을 서버 응답에서 베끼지 않는다. 이번 주에 며칠 남았는지는 이 spec 이 달력으로
 * 직접 센다. 화면이 적어 둔 값을 읽어다 견주면 서버가 하루 적게 줘도 앞뒤가 맞아 통과한다.
 */

const BUDGET = 500_000;

/**
 * 오늘 포함 이번 주(월~일)에 남은 날 중 **이번 달 안에 있는** 날 수.
 *
 * 달을 넘는 날까지 세면 달 마지막 주에 주간 값이 남은 예산보다 커진다(ADR-0011).
 * 오늘은 기기 시간대가 아니라 가계부 시간대로 얻는다. UTC 로 도는 CI 에서 하루 어긋난다.
 */
function weekDaysLeftThisMonth(): number {
  const [year, month, day] = toLedgerDate(new Date()).split('-').map(Number);
  // getDay() 는 일요일이 0 이다. 월요일 시작으로 옮긴다.
  const fromMonday = (new Date(year, month - 1, day).getDay() + 6) % 7;
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  return Math.min(day + (6 - fromMonday), lastDayOfMonth) - day + 1;
}

// ── 이번 주 가용액 ──────────────────────────────────────

test('예산을 정하면 홈이 하루치와 함께 이번 주에 쓸 수 있는 돈을 알려준다', async ({
  home,
  prep,
}) => {
  await prep.setBudget(BUDGET);

  await home.open();
  await home.waitReady();

  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET));

  // 하루치는 서버가 남은 일수로 나눠 준다. 화면이 함께 그리는 그 일수로 되짚는다.
  const remainingDays = await home.hero.remainingDays();
  expect(remainingDays, '남은 일수가 화면에 없다').not.toBeNull();
  const perDay = Math.floor(BUDGET / Math.max(1, remainingDays ?? 0));
  await expect(home.hero.dailyAllowance).toHaveText(formatCurrency(perDay));

  // 주간 값은 하루치 × 이번 주에 남은 날이다. 남은 날 수는 이 spec 이 직접 셌다.
  await expect(home.hero.weeklyLabel).toBeVisible();
  await expect(home.hero.weeklyAllowance).toHaveText(
    formatCurrency(perDay * weekDaysLeftThisMonth()),
  );
});

test('예산이 없으면 이번 주 줄을 아예 그리지 않는다', async ({ home, prep }) => {
  // 기록은 있고 예산만 없는 상태다. 숫자를 낼 근거가 없으면 0 으로 적지 않고 뺀다.
  await prep.addExpense({ amount: 30_000, daysAgo: 1 });

  await home.open();
  await home.waitReady();

  await expect(home.hero.monthSpent).toHaveText(formatCurrency(30_000));
  await expect(home.hero.weeklyAllowance).toHaveCount(0);
  await expect(home.hero.weeklyLabel).toHaveCount(0);
});

test('주간 값이 남은 예산을 넘지 않는다', async ({ home, prep }) => {
  await prep.setBudget(BUDGET);

  await home.open();
  await home.waitReady();

  const weekly = await home.hero.weeklyAllowance.textContent();
  expect(weekly, '이번 주 값이 화면에 없다').not.toBeNull();
  const remaining = await home.hero.remainingBudget.textContent();

  // 두 숫자가 한 화면에 있다. 주간 값이 더 크면 사용자는 어느 쪽을 믿어야 할지 모른다.
  expect(wonOf(weekly ?? ''), '이번 주 값이 남은 예산보다 크다').toBeLessThanOrEqual(
    wonOf(remaining ?? ''),
  );
});

/** `470,000원` → 470000. 화면에 찍힌 글자를 그대로 견주려고 숫자로 되돌린다. */
function wonOf(text: string): number {
  return Number(text.replace(/[^\d-]/g, ''));
}

// ── 안 쓴 날 ────────────────────────────────────────────

test('오늘 아무것도 안 적은 날, 안 썼다고 남기고 되돌린다', async ({ calendar, home, prep }) => {
  // 예산은 없다. 히어로가 '쓴 돈' 을 크게 그리는 화면에서 그 숫자가 안 변하는지 본다.
  await prep.addExpense({ amount: 30_000, daysAgo: 1 });

  await home.open();
  await home.waitReady();

  await expect(home.today.empty).toBeVisible();
  await expect(home.today.noSpendButton).toBeVisible();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(30_000));

  await home.today.noSpendButton.click();

  // 줄이 생기고, 되돌릴 길이 그 줄 안에 있다.
  await expect(home.today.noSpendRow).toContainText('오늘은 안 썼어요');
  await expect(home.today.noSpendCancelButton).toBeVisible();
  await expect(home.today.empty).toHaveCount(0);
  await expect(home.today.noSpendButton).toHaveCount(0);

  // 0원 기록이라 이번 달 쓴 돈은 그대로여야 한다. 예산도 없던 대로 없다.
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(30_000));
  await expect(home.hero.gauge).toHaveCount(0);

  await test.step('달력은 안 쓴 날과 안 적은 날을 가려 말한다', async () => {
    const today = toLedgerDate(new Date());
    await calendar.open();
    await calendar.waitReady();
    // 둘 다 0원이다. 여기서 안 가르면 안 썼다고 적어 둔 것이 화면에서 사라진다.
    await expect(
      calendar.grid.cell(calendar.grid.cellName(today, { isNoSpend: true })),
    ).toBeVisible();
  });

  await test.step('취소하면 빈 상태로 돌아온다', async () => {
    await home.open();
    await home.waitReady();

    await home.today.noSpendCancelButton.click();

    await expect(home.today.empty).toBeVisible();
    await expect(home.today.noSpendCancelButton).toHaveCount(0);
    // 되돌린 뒤에는 다시 남길 수 있어야 한다.
    await expect(home.today.noSpendButton).toBeVisible();
  });
});

test('안 썼다고 남겨도 남은 예산과 하루 가용액은 그대로다', async ({ home, prep }) => {
  await prep.setBudget(BUDGET);
  await prep.addExpense({ amount: 30_000, daysAgo: 1 });

  await home.open();
  await home.waitReady();

  const remaining = formatCurrency(BUDGET - 30_000);
  await expect(home.hero.remainingBudget).toHaveText(remaining);
  const beforeDaily = await home.hero.dailyAllowance.textContent();
  const beforeWeekly = await home.hero.weeklyAllowance.textContent();
  const beforePercent = await home.hero.gaugePercent();

  await home.today.noSpendButton.click();
  await expect(home.today.noSpendCancelButton).toBeVisible();

  // 안 쓴 날을 적는 것은 돈이 움직이는 일이 아니다. 네 숫자가 다 그대로여야 한다.
  await expect(home.hero.remainingBudget).toHaveText(remaining);
  await expect(home.hero.dailyAllowance).toHaveText(beforeDaily ?? '');
  await expect(home.hero.weeklyAllowance).toHaveText(beforeWeekly ?? '');
  expect(await home.hero.gaugePercent(), '예산 게이지가 움직였다').toBe(beforePercent);
});

test('오늘 지출이 하나라도 있으면 안 썼다는 버튼을 권하지 않는다', async ({ home, prep }) => {
  await prep.addTransaction({ amount: 12_000, merchant: '김밥천국' });

  await home.open();
  await home.waitReady();

  await expect(home.today.row('김밥천국')).toBeVisible();
  await expect(home.today.noSpendButton).toHaveCount(0);
  await expect(home.today.empty).toHaveCount(0);
});

test('같은 날 안 썼다고 두 번 적으려 하면 서버가 막는다', async ({ home, prep }) => {
  await home.open();
  await home.waitReady();

  await home.today.noSpendButton.click();
  await expect(home.today.noSpendCancelButton).toBeVisible();

  // 화면에는 버튼이 이미 사라져 있어 이 길은 API 로만 만들 수 있다.
  const again = await prep.saveNoSpend();
  expect(again.status, '같은 날 두 번째 무지출 표시가 통과했다').toBe(422);
  expect(again.code).toBe('NO_SPEND_EXISTS');
});
