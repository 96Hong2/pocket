import { formatCurrency, formatNumber, shiftMonth } from '../../src/shared/lib/format';
import { lastMonth, thisMonth, type PrepApi } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * 목표 기반 생활비 제안.
 *
 * 목표에 넣을 돈을 먼저 떼고 남는 만큼을 이번 달 생활비로 제안한다. 그 식이 화면에
 * 그대로 보이고, 누르지 않으면 아무것도 저장되지 않는지를 화면에서 본다.
 *
 * 제안액을 spec 이 만들지 않는다. 화면에 그려진 목표저축을 읽어 식을 되짚는다.
 * 기대값을 서버 응답에서 베끼면 서버가 틀려도 초록이 된다.
 */

/** 기한. 이번 달에서 세 달 뒤로 잡는다. 그러면 이번 달을 포함해 남은 달이 늘 넷이다. */
const DEADLINE = `${shiftMonth(thisMonth(), 3)}-28`;

const GOAL = { title: '제주도 여행', targetAmount: 5_000_000, targetDate: DEADLINE };

/** 지난달에 심는 수입과 '주거·고정비' 지출. 실수령·고정비 추정값이 여기서 나온다. */
const INCOME = 3_000_000;
const FIXED = 900_000;

/** 지난달 한가운데. 달마다 있는 날이라 어느 달에 돌려도 그 달에 들어간다. */
const LAST_MONTH_DAY = `${lastMonth()}-15`;

/** 지난달 수입과 고정비, 그리고 고정비가 아닌 지출 한 건. */
async function seedLastMonth(prep: PrepApi): Promise<void> {
  const housing = await prep.categoryIdByName('주거·고정비');
  const food = await prep.categoryIdByName('식비');
  await prep.addTransaction({ amount: INCOME, type: 'income', on: LAST_MONTH_DAY });
  await prep.addTransaction({ amount: FIXED, on: LAST_MONTH_DAY, categoryId: housing });
  // 고정비 추정이 그 달 지출 전체를 세고 있으면 이 한 건 때문에 식이 어긋난다.
  await prep.addTransaction({ amount: 500_000, on: LAST_MONTH_DAY, categoryId: food });
}

test('지난달에서 어림한 식이 그대로 보이고 제안액이 그 식과 맞는다', async ({ manage, prep }) => {
  await seedLastMonth(prep);
  await prep.setGoal(GOAL);

  await manage.open();
  await manage.waitReady();
  await manage.suggest.waitVisible();

  await expect(manage.suggest.takeHomeField).toHaveValue(formatNumber(INCOME));
  await expect(manage.suggest.fixedCostsField).toHaveValue(formatNumber(FIXED));
  // 실수령·고정비 둘 다 아직 어림값이다. 어디서 온 숫자인지 화면이 밝힌다.
  await expect(manage.suggest.basisNotes).toHaveCount(2);

  const saving = await manage.suggest.savingWon();
  expect(saving).toBeGreaterThan(0);
  await expect(manage.suggest.amount).toHaveText(formatCurrency(INCOME - saving - FIXED));

  // 제안일 뿐이라고 적어 둔다. 강요하지 않는다.
  await expect(manage.suggest.foot).toBeVisible();
  // 카드가 떠도 화면이 가로로 밀리지 않는다.
  const widths = await manage.widths();
  expect(widths.content).toBeLessThanOrEqual(widths.visible);
});

test('제안 카드를 보기만 해도 예산이 생기지는 않는다', async ({ manage, prep }) => {
  await seedLastMonth(prep);
  await prep.setGoal(GOAL);

  await manage.open();
  await manage.waitReady();
  await manage.suggest.waitVisible();

  // 화면을 열어 본 것만으로 예산이 정해지면 사용자가 정하지 않은 숫자가 굳는다.
  await expect(manage.total.emptyTitle).toBeVisible();
  await expect(manage.total.amount).toHaveCount(0);
});

test('버튼을 누르면 그 금액이 이번 달 예산이 되고 홈 남은 예산도 같아진다', async ({
  home,
  manage,
  prep,
}) => {
  await seedLastMonth(prep);
  await prep.setGoal(GOAL);

  await manage.open();
  await manage.waitReady();
  await manage.suggest.waitVisible();

  const suggested = await manage.suggest.suggestedWon();
  await manage.suggest.apply();

  // 예산이 생기면 제안 카드는 자리를 비운다. 지금 예산이 무엇인지 화면에 하나여야 한다.
  await expect(manage.total.amount).toHaveText(formatCurrency(suggested));
  await expect(manage.suggest.card).toHaveCount(0);

  await home.open();
  await home.waitReady();
  // 이번 달에는 아직 쓴 것이 없다. 남은 예산이 방금 정한 금액 그대로여야 한다.
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(suggested));
});

test('실수령을 고치면 그만큼 제안액이 늘고 그 칸은 추정값이 아니게 된다', async ({
  manage,
  prep,
}) => {
  await seedLastMonth(prep);
  await prep.setGoal(GOAL);

  await manage.open();
  await manage.waitReady();
  await manage.suggest.waitVisible();
  const before = await manage.suggest.suggestedWon();

  await manage.suggest.setTakeHome(INCOME + 500_000);

  await expect(manage.suggest.amount).toHaveText(formatCurrency(before + 500_000));
  // 고친 칸은 사용자가 준 값이고, 안 고친 고정비만 어림값으로 남는다.
  await expect(manage.suggest.basisNotes).toHaveCount(1);
});

test('목표가 없으면 제안 카드가 아예 없다', async ({ manage, prep }) => {
  await seedLastMonth(prep);

  await manage.open();
  await manage.waitReady();

  await expect(manage.total.startButton).toBeVisible();
  await expect(manage.suggest.card).toHaveCount(0);
});

test('기한이 없는 목표면 한 달 몫을 나눌 수 없어 제안하지 않는다', async ({ manage, prep }) => {
  await seedLastMonth(prep);
  await prep.setGoal({ title: '노트북', targetAmount: 2_000_000 });

  await manage.open();
  await manage.waitReady();

  await expect(manage.suggest.card).toHaveCount(0);
});

test('이미 정해 둔 예산이 있으면 제안 카드가 없다', async ({ manage, prep }) => {
  await seedLastMonth(prep);
  await prep.setGoal(GOAL);
  await prep.setBudget(600_000);

  await manage.open();
  await manage.waitReady();

  await expect(manage.total.amount).toHaveText(formatCurrency(600_000));
  await expect(manage.suggest.card).toHaveCount(0);
});
