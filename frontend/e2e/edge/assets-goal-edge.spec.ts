import { formatCurrency } from '../../src/shared/lib/format';
import { thisMonth } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * 자산과 목표의 바깥값.
 *
 * 둘 다 사용자가 숫자를 직접 적는 화면이다. 기본 스위트는 흐름이 도는지를 보고,
 * 여기서는 사람이 잘 안 넣지만 넣으면 화면이 이상해지는 값만 본다.
 * 0 원, 부채만, 목표를 넘겨 모은 경우, 한 달 남은 기한이 그런 자리다.
 */

test('부채만 적으면 순자산이 음수로 나온다', async ({ assets, prep }) => {
  await prep.putAssets([{ group: 'debt', amount: 5_000_000, label: '학자금' }]);

  await assets.open();
  await assets.waitReady();

  // 0 으로 자르면 빚만 있는 사람에게 「순자산 0원」이라는 거짓말을 한다.
  await expect(assets.netWorth).toHaveText(formatCurrency(-5_000_000));
  await expect(assets.breakdown).toHaveText(
    `자산 ${formatCurrency(0)} − 부채 ${formatCurrency(5_000_000)}`,
  );
});

test('0원짜리 항목도 줄로 남고 소계를 흔들지 않는다', async ({ assets, prep }) => {
  await prep.putAssets([
    { group: 'cash', amount: 1_000_000, label: '월급 통장' },
    { group: 'cash', amount: 0, label: '비상금 통장' },
  ]);

  await assets.open();
  await assets.waitReady();

  // 0 원을 지워 버리면 「아직 안 적었다」와 「적었는데 비었다」를 구분할 수 없다.
  await expect(assets.row('비상금 통장')).toHaveCount(1);
  await expect(assets.groupTotal('예적금·현금')).toHaveText(formatCurrency(1_000_000));
  await expect(assets.netWorth).toHaveText(formatCurrency(1_000_000));
});

test('마지막 한 줄을 지우면 빈 상태로 돌아온다', async ({ assets, prep }) => {
  await prep.putAssets([{ group: 'cash', amount: 300_000, label: '지갑' }]);

  await assets.open();
  await assets.waitReady();
  await assets.remove('지갑');

  // 줄이 다 사라졌는데 순자산 0원 카드만 남으면 다시 적을 입구가 없다.
  await expect(assets.emptyTitle).toBeVisible();
  await expect(assets.startButton).toBeVisible();
  await expect(assets.netWorth).toHaveCount(0);
});

test('네 갈래에 걸쳐 적어도 순자산이 자산 합에서 부채 합을 뺀 값이다', async ({ assets, prep }) => {
  await prep.putAssets([
    { group: 'cash', amount: 1_200_000, label: '월급 통장' },
    { group: 'investment', amount: 3_400_000, label: 'ISA' },
    { group: 'deposit', amount: 20_000_000, label: '전세 보증금' },
    { group: 'debt', amount: 9_600_000, label: '전세 대출' },
  ]);

  await assets.open();
  await assets.waitReady();

  await expect(assets.groupTotal('예적금·현금')).toHaveText(formatCurrency(1_200_000));
  await expect(assets.groupTotal('투자')).toHaveText(formatCurrency(3_400_000));
  await expect(assets.groupTotal('보증금·기타')).toHaveText(formatCurrency(20_000_000));
  await expect(assets.groupTotal('부채')).toHaveText(formatCurrency(9_600_000));
  // 부채를 자산 쪽에 더해 버리면 이 값이 43,800,000원이 된다.
  await expect(assets.netWorth).toHaveText(formatCurrency(15_000_000));
});

test('목표보다 많이 모아도 남은 금액이 음수로 내려가지 않는다', async ({ goal, prep }) => {
  const id = await prep.setGoal({ title: '노트북', targetAmount: 1_000_000 });
  await prep.addContribution(id, { amount: 1_500_000 });

  await goal.open();
  await goal.waitReady();

  await expect(goal.current).toHaveText(formatCurrency(1_500_000));
  // 넘긴 만큼을 음수로 적으면 「−500,000원 남았어요」가 된다.
  await expect(goal.remaining).toHaveText(formatCurrency(0));
  await expect(goal.achievedBadge).toBeVisible();
  expect(await goal.gaugePercent()).toBe(100);
});

test('기한이 이번 달이면 매달 모을 돈이 남은 금액 그대로다', async ({ goal, prep }) => {
  // 이번 달 말일이 며칠인지 세지 않으려고 28일로 잡는다. 어느 달에 돌려도 그 달 안이다.
  await prep.setGoal({
    title: '이달 안에',
    targetAmount: 800_000,
    targetDate: `${thisMonth()}-28`,
    initialAmount: 300_000,
  });

  await goal.open();
  await goal.waitReady();

  await expect(goal.remaining).toHaveText(formatCurrency(500_000));
  // 남은 달이 이번 달 하나뿐인데 둘로 세면 절반인 250,000원이 나온다.
  await expect(goal.requiredMonthly).toHaveText(formatCurrency(500_000));
});

test('1원짜리 목표에 1원을 모으면 게이지가 100에서 멈춘다', async ({ goal, prep }) => {
  const id = await prep.setGoal({ title: '동전 하나', targetAmount: 1 });
  await prep.addContribution(id, { amount: 1 });

  await goal.open();
  await goal.waitReady();

  expect(await goal.gaugePercent()).toBe(100);
  await expect(goal.remaining).toHaveText(formatCurrency(0));
  // 닿은 목표에는 매달 모을 돈 줄이 남아 있으면 안 된다. 더 모으라는 말이 된다.
  await expect(goal.requiredMonthly).toHaveCount(0);
});

test('실수령보다 목표저축과 고정비가 크면 제안액을 0원으로 두고 이유를 말한다', async ({
  manage,
  prep,
}) => {
  // 이번 달을 포함해 두 달 안에 1,000만원. 한 달 몫이 실수령보다 크다.
  const [year, month] = thisMonth().split('-').map(Number);
  const nextMonth =
    month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  await prep.setGoal({
    title: '무리한 목표',
    targetAmount: 10_000_000,
    targetDate: `${nextMonth}-28`,
  });

  await manage.open();
  await manage.waitReady();
  await manage.suggest.waitVisible();

  await manage.suggest.setTakeHome(2_000_000);
  await manage.suggest.setFixedCosts(1_000_000);

  // 음수로 그리면 「−3,000,000원으로 사세요」가 된다. 0 으로 자르고 왜인지는 식이 말한다.
  await expect(manage.suggest.amount).toHaveText(formatCurrency(0));
  expect(await manage.suggest.savingWon()).toBeGreaterThan(2_000_000);

  // 0 원이어도 그 값으로 예산을 정하게 두면 남은 예산이 처음부터 0 이 된다.
  await expect(manage.suggest.applyButton).toBeDisabled();
});
