import { formatCurrency, formatNumber, shiftMonth } from '../../src/shared/lib/format';
import { lastMonth, thisMonth, type PrepApi } from '../support/api';
import { E2E_API_URL } from '../support/env';
import { expect, test } from '../support/fixtures';

/**
 * 목표를 세워 두고 **살다 보면 달라지는 것들.**
 *
 * 한 번 정한 목표가 그대로 가는 사람은 드물다. 기한이 부담스러워지면 비우고, 목표액이
 * 달라지면 올린다. 그 고침이 서버까지 가서 카드가 다시 그려지는지를 화면에서 본다.
 *
 * 뒤쪽 셋은 목표를 **못 읽거나 목표에서 몫을 못 낼 때**다. 그때 화면이 아무 말도 안 하면
 * 사람은 자기가 무엇을 잘못했는지 모르는 채로 그 자리에서 멈춘다.
 */

const TITLE = '제주도 여행';
const TARGET = 5_000_000;
const INITIAL = 1_000_000;

/**
 * 기한. 이번 달에서 세 달 뒤로 잡는다. 그러면 이번 달을 포함해 남은 달이 늘 넷이다.
 *
 * 28일에 두는 이유는 달 길이 때문이다. 31일로 두면 30일까지인 달에서 날짜가 밀린다.
 */
const DEADLINE = `${shiftMonth(thisMonth(), 3)}-28`;

/** 이번 달을 포함해 기한까지 남은 달 수. 위에서 세 달 뒤로 잡았으므로 넷이다. */
const MONTHS_LEFT = 4;

/** 지난달에 심는 수입과 '주거·고정비' 지출. 계산기의 실수령·고정비 어림값이 여기서 나온다. */
const INCOME = 3_000_000;
const FIXED = 900_000;

/** 지난달 한가운데. 달마다 있는 날이라 어느 달에 돌려도 그 달에 들어간다. */
const LAST_MONTH_DAY = `${lastMonth()}-15`;

async function seedLastMonth(prep: PrepApi): Promise<void> {
  const housing = await prep.categoryIdByName('주거·고정비');
  await prep.addTransaction({ amount: INCOME, type: 'income', on: LAST_MONTH_DAY });
  await prep.addTransaction({ amount: FIXED, on: LAST_MONTH_DAY, categoryId: housing });
}

test('기한을 비워 저장하면 매달 모을 돈 줄이 사라진다', async ({ goal, prep }) => {
  await prep.setGoal({
    title: TITLE,
    targetAmount: TARGET,
    targetDate: DEADLINE,
    initialAmount: INITIAL,
  });

  await goal.open();
  await goal.waitReady();
  await expect(goal.requiredMonthly).toHaveText(
    formatCurrency(Math.ceil((TARGET - INITIAL) / MONTHS_LEFT)),
  );

  await goal.edit({ deadline: '' });

  // 기한이 없으면 나눌 달 수가 없다. 0원이라고 적지 않고 그 줄을 통째로 뺀다.
  await expect(goal.requiredMonthly).toHaveCount(0);
  // 비운 것은 기한 하나다. 모은 돈도 목표액도 안 건드렸으니 남은 금액과 게이지는 그대로다.
  await expect(goal.remaining).toHaveText(formatCurrency(TARGET - INITIAL));
  expect(await goal.gaugePercent()).toBe(20);

  // 화면에서만 걷힌 것이 아니다. 다시 열어도 없어야 서버까지 간 것이다.
  await goal.open();
  await goal.waitReady();
  await expect(goal.requiredMonthly).toHaveCount(0);
  await expect(goal.title).toHaveText(TITLE);
});

test('이름과 목표 금액을 고쳐 저장하면 카드가 새 값으로 다시 그려진다', async ({ goal, prep }) => {
  await prep.setGoal({
    title: TITLE,
    targetAmount: TARGET,
    targetDate: DEADLINE,
    initialAmount: INITIAL,
  });

  await goal.open();
  await goal.waitReady();
  expect(await goal.gaugePercent()).toBe(20);

  const RENAMED = '제주도 한 달 살기';
  const RAISED = 10_000_000;
  await goal.edit({ title: RENAMED, amount: RAISED });

  await expect(goal.title).toHaveText(RENAMED);
  // 목표만 올렸다. 이미 모아 둔 돈은 그대로다.
  await expect(goal.current).toHaveText(formatCurrency(INITIAL));
  await expect(goal.remaining).toHaveText(formatCurrency(RAISED - INITIAL));
  // 기한은 안 건드렸으니 남은 달 수도 그대로다. 더 큰 목표를 같은 달 수로 나눈다.
  await expect(goal.requiredMonthly).toHaveText(
    formatCurrency(Math.ceil((RAISED - INITIAL) / MONTHS_LEFT)),
  );
  expect(await goal.gaugePercent()).toBe(10);
});

test.describe('목표를 못 불러왔을 때', () => {
  test.use({
    // 우리가 일부러 500 을 내려보낸다. 브라우저가 그 응답을 콘솔에 적는 것뿐이다.
    consoleErrorAllowList: [/Failed to load resource[\s\S]*500/],
  });

  test('만들기 대신 다시 시도를 주고, 누르면 원래 목표가 돌아온다', async ({
    goal,
    page,
    prep,
  }) => {
    await prep.setGoal({ title: TITLE, targetAmount: TARGET, targetDate: DEADLINE });

    let blocked = true;
    await page.route(`${E2E_API_URL}/api/v1/goals`, async (route) => {
      if (blocked && route.request().method() === 'GET') {
        await route.fulfill({ status: 500, body: '{}' });
        return;
      }
      await route.continue();
    });

    await goal.open();

    await expect(goal.loadFailure).toBeVisible();
    /*
      목표가 있는지 없는지 모르는 상태다. 여기서 만들기를 열어 주면 다 적고 누른 뒤에야
      '진행 중인 목표가 이미 있어요' 로 막힌다. 그 전에 다시 받는 쪽이 낫다.
    */
    await expect(goal.startButton).toHaveCount(0);
    await expect(goal.card).toHaveCount(0);

    blocked = false;
    await goal.retryButton.click();

    await goal.waitReady();
    await expect(goal.title).toHaveText(TITLE);
  });
});

test('기한 없는 목표로 계산기를 열면 목표 저축이 왜 0인지 말해 준다', async ({ manage, prep }) => {
  await seedLastMonth(prep);
  await prep.setGoal({ title: '노트북', targetAmount: 2_000_000 });

  await manage.open();
  await manage.waitReady();
  await manage.total.startButton.click();
  await manage.total.sheet.calcButton.click();
  await manage.calc.waitOpen();

  // 기한이 없으면 한 달 몫을 나눌 수가 없다. 0 으로 두되 왜 0 인지 그 자리에서 적는다.
  await expect(manage.calc.savingNote).toHaveText(
    '목표 「노트북」 는 기한이 없어요. 모을 만큼 적어 주세요',
  );
  await expect(manage.calc.savingField).toHaveValue(formatNumber(0));
  // 뗄 몫이 없으니 제안액은 실수령에서 고정비만 뺀 값이다.
  await expect(manage.calc.amount).toHaveText(formatCurrency(INCOME - FIXED));
});

test('기한이 지난 목표로 계산기를 열면 이번 달 몫이 없다고 말해 준다', async ({ manage, prep }) => {
  await seedLastMonth(prep);
  await prep.setGoal({
    title: '노트북',
    targetAmount: 2_000_000,
    targetDate: `${lastMonth()}-10`,
  });

  await manage.open();
  await manage.waitReady();
  await manage.total.startButton.click();
  await manage.total.sheet.calcButton.click();
  await manage.calc.waitOpen();

  // 기한은 있는데 이미 지났다. 기한 없음과 할 말이 다르다. 더 모을 만큼 적으라고 한다.
  await expect(manage.calc.savingNote).toHaveText(
    '목표 「노트북」 는 이번 달 몫이 없어요. 더 모을 만큼 적어 주세요',
  );
  await expect(manage.calc.savingField).toHaveValue(formatNumber(0));
  await expect(manage.calc.amount).toHaveText(formatCurrency(INCOME - FIXED));
});

test.describe('계산기가 제안을 못 받았을 때', () => {
  test.use({ consoleErrorAllowList: [/Failed to load resource[\s\S]*500/] });

  test('무엇이 안 됐는지 말하고 다시 받을 길을 준다', async ({ manage, page, prep }) => {
    await seedLastMonth(prep);

    await manage.open();
    await manage.waitReady();

    // 질의에 달·금액이 붙어 나가므로 주소 앞부분으로 잡는다. 포트는 env 에서 온다.
    await page.route(new RegExp(`^${E2E_API_URL}/api/v1/budgets/suggestion`), async (route) => {
      await route.fulfill({ status: 500, body: '{}' });
    });

    await manage.total.startButton.click();
    await manage.total.sheet.calcButton.click();
    await manage.calc.waitSheetOpen();

    /*
      광고 한 편을 참고 연 화면이다. 여기서 아무 말도 안 하면 「계산 중」만 남고
      저장 버튼은 죽어 있어, 닫는 것 말고 할 수 있는 일이 없다.
      같은 화면의 예산 카드·목표 카드는 둘 다 오류 한 줄과 다시 시도를 둔다.
    */
    await expect(manage.calc.failureNotice).toBeVisible();
    await expect(manage.calc.retryButton).toBeVisible();
    await expect(manage.calc.pending).toHaveCount(0);
  });
});
