import { formatCurrency, formatNumber, shiftMonth } from '../../src/shared/lib/format';
import { lastMonth, thisMonth, type PrepApi } from '../support/api';
import { fullScreenAdFailureForced, logsNamed, setFullScreenAdFailure } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 생활비 계산기.
 *
 * 예산 시트에서 「계산해서 정하기」 를 누르면 광고 한 편을 지나 계산기가 열린다.
 * 손에 쥐는 돈 → 꼭 나가는 돈 → 모을 돈을 적으면 생활비가 나오고, 누르기 전에는
 * 아무것도 저장되지 않는지를 화면에서 본다.
 *
 * 제안액을 spec 이 만들지 않는다. 화면에 그려진 값을 읽어 식을 되짚는다.
 * 기대값을 서버 응답에서 베끼면 서버가 틀려도 초록이 된다.
 */

/** 기한. 이번 달에서 세 달 뒤로 잡는다. 그러면 이번 달을 포함해 남은 달이 늘 넷이다. */
const DEADLINE = `${shiftMonth(thisMonth(), 3)}-28`;

const GOAL = { title: '제주도 여행', targetAmount: 5_000_000, targetDate: DEADLINE };

/** 지난달에 심는 수입과 '주거·고정비' 지출. 실수령·고정비 어림값이 여기서 나온다. */
const INCOME = 3_000_000;
const FIXED = 900_000;

/** 지난달 한가운데. 달마다 있는 날이라 어느 달에 돌려도 그 달에 들어간다. */
const LAST_MONTH_DAY = `${lastMonth()}-15`;

async function seedLastMonth(prep: PrepApi): Promise<void> {
  const housing = await prep.categoryIdByName('주거·고정비');
  const food = await prep.categoryIdByName('식비');
  await prep.addTransaction({ amount: INCOME, type: 'income', on: LAST_MONTH_DAY });
  await prep.addTransaction({ amount: FIXED, on: LAST_MONTH_DAY, categoryId: housing });
  // 고정비 어림이 그 달 지출 전체를 세고 있으면 이 한 건 때문에 식이 어긋난다.
  await prep.addTransaction({ amount: 500_000, on: LAST_MONTH_DAY, categoryId: food });
}

test('예산 시트의 「계산해서 정하기」 는 광고 한 편을 지나 계산기를 연다', async ({
  manage,
  page,
  prep,
}) => {
  await seedLastMonth(prep);

  await manage.open();
  await manage.waitReady();
  await manage.total.startButton.click();
  await manage.total.sheet.waitOpen();

  // 광고를 봐야 열린다는 것이 버튼 곁에 적혀 있다. 눌러 보고 알면 속은 기분이 든다.
  await expect(manage.total.sheet.calcNote).toBeVisible();
  await manage.total.sheet.calcButton.click();

  // 목 SDK 의 전면 광고는 1.5초 뒤에 닫힌다. 그 뒤에 예산 시트가 계산기로 바뀐다.
  await manage.calc.waitOpen();
  await manage.total.sheet.waitClosed();

  // 광고를 본 갈래로 열렸다고 남는다. 이 값이 광고 자리가 값어치가 있는지 말해 준다.
  const opened = await logsNamed(page, 'budget_calc_opened');
  expect(opened.map((log) => log.params.ad)).toEqual(['watched']);
});

test('광고를 못 불러와도 계산기는 열린다. 광고 서버 사정으로 예산을 막지 않는다', async ({
  manage,
  page,
  prep,
}) => {
  await seedLastMonth(prep);

  await manage.open();
  await manage.waitReady();
  await setFullScreenAdFailure(page, 'FAILED_TO_GET_LOADED_AD');
  expect(await fullScreenAdFailureForced(page, 'FAILED_TO_GET_LOADED_AD')).toBe(true);

  await manage.total.startButton.click();
  await manage.total.sheet.waitOpen();
  await manage.total.sheet.calcButton.click();

  await manage.calc.waitOpen();

  const opened = await logsNamed(page, 'budget_calc_opened');
  expect(opened.map((log) => [log.params.ad, log.params.reason])).toEqual([['skipped', 'failed']]);
});

test('지난달에서 어림한 값이 채워져 있고 제안액이 그 식과 맞는다', async ({ manage, prep }) => {
  await seedLastMonth(prep);
  await prep.setGoal(GOAL);

  await manage.open();
  await manage.waitReady();
  await manage.total.startButton.click();
  await manage.total.sheet.calcButton.click();
  await manage.calc.waitOpen();

  await expect(manage.calc.takeHomeField).toHaveValue(formatNumber(INCOME));
  await expect(manage.calc.fixedSum).toHaveText(formatCurrency(FIXED));
  // 실수령·고정비 둘 다 어림값이다. 어디서 온 숫자인지 화면이 밝힌다.
  await expect(manage.calc.basisNotes).toHaveCount(2);
  // 목표 저축은 목표에서 옮겨 온 몫이다. 어느 목표의 몫인지 적혀 있다.
  await expect(manage.calc.savingNote).toContainText('제주도 여행');

  const saving = Number((await manage.calc.savingField.inputValue()).replace(/[^0-9]/g, ''));
  expect(saving).toBeGreaterThan(0);
  await expect(manage.calc.amount).toHaveText(formatCurrency(INCOME - saving - FIXED));

  // 시트가 떠도 화면이 가로로 밀리지 않는다.
  const widths = await manage.widths();
  expect(widths.content).toBeLessThanOrEqual(widths.visible);
});

test('계산기를 열어 보기만 해도 예산이 생기지는 않는다', async ({ manage, prep }) => {
  await seedLastMonth(prep);
  await prep.setGoal(GOAL);

  await manage.open();
  await manage.waitReady();
  await manage.total.startButton.click();
  await manage.total.sheet.calcButton.click();
  await manage.calc.waitOpen();
  await manage.calc.sheet.getByRole('button', { name: '닫기' }).click();
  await manage.calc.waitClosed();

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
  await manage.total.startButton.click();
  await manage.total.sheet.calcButton.click();
  await manage.calc.waitOpen();

  const suggested = await manage.calc.suggestedWon();
  await manage.calc.apply();

  await expect(manage.total.amount).toHaveText(formatCurrency(suggested));

  await home.open();
  await home.waitReady();
  // 이번 달에는 아직 쓴 것이 없다. 남은 예산이 방금 정한 금액 그대로여야 한다.
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(suggested));
});

test('고정비 항목을 적으면 합계가 어림값을 대신하고 제안액이 그만큼 줄어든다', async ({
  manage,
  prep,
}) => {
  await seedLastMonth(prep);
  await prep.setGoal(GOAL);

  await manage.open();
  await manage.waitReady();
  await manage.total.startButton.click();
  await manage.total.sheet.calcButton.click();
  await manage.calc.waitOpen();
  const before = await manage.calc.suggestedWon();

  // 항목 둘을 적는다. 그 둘의 합이 어림한 고정비를 통째로 대신한다.
  await manage.calc.fixedField('월세·관리비').fill('600000');
  await manage.calc.fixedField('통신·공과금').fill('100000');

  await expect(manage.calc.fixedSum).toHaveText(formatCurrency(700_000));
  await expect(manage.calc.amount).toHaveText(formatCurrency(before + FIXED - 700_000));
  // 고친 칸에는 어림값 표시가 없다. 실수령만 어림값으로 남는다.
  await expect(manage.calc.basisNotes).toHaveCount(1);
});

test('목표가 없어도 모을 돈을 직접 적어 생활비를 낼 수 있다', async ({ manage, prep }) => {
  await seedLastMonth(prep);

  await manage.open();
  await manage.waitReady();
  await manage.total.startButton.click();
  await manage.total.sheet.calcButton.click();
  await manage.calc.waitOpen();

  // 목표가 없으면 0 으로 두고 그렇게 말한다. 목표부터 만들라고 하지 않는다.
  await expect(manage.calc.savingNote).toHaveText('목표가 없으면 0으로 두어도 돼요');
  await expect(manage.calc.amount).toHaveText(formatCurrency(INCOME - FIXED));

  await manage.calc.setSaving(500_000);
  await expect(manage.calc.savingNote).toHaveText('직접 적은 값이에요');
  await expect(manage.calc.amount).toHaveText(formatCurrency(INCOME - 500_000 - FIXED));
});

test('이미 정해 둔 예산을 고칠 때는 계산기 입구가 없다', async ({ manage, prep }) => {
  await seedLastMonth(prep);
  await prep.setBudget(600_000);

  await manage.open();
  await manage.waitReady();
  await manage.total.openEdit();

  // 얼마로 할지 아는 사람이다. 광고를 지나는 길을 또 보여 줄 이유가 없다.
  await expect(manage.total.sheet.calcButton).toHaveCount(0);
});
