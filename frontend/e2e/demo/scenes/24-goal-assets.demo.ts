import { formatCurrency, toLedgerDate } from '../../../src/shared/lib/format';
import { expect, test } from '../support/director';

/**
 * 목표와 자산 두 장면.
 *
 * 둘 다 관리 탭 아래에 있고 '지금 얼마인가' 를 보여준다는 점이 같지만, 목표는 앞으로
 * 모을 돈이고 자산은 이미 있는 돈이다. 목표를 앞에 두어야 뒤의 자산 화면이
 * '그래서 지금 가진 것은 얼마인가' 로 읽힌다.
 *
 * 두 화면 모두 합계를 서버가 센다. 여기서 보이는 것은 계산이 맞는지가 아니라,
 * 적자마자 그 자리에서 숫자가 따라오는 것이다.
 */

/** 기한. 이번 달과 겹치지 않게 다음 해로 둔다. 오늘이 언제든 늘 앞날이다. */
const DEADLINE = `${Number(toLedgerDate(new Date()).slice(0, 4)) + 1}-06-30`;

const GOAL_TITLE = '제주 여행';
const GOAL_AMOUNT = 3_000_000;
const GOAL_INITIAL = 500_000;
const CONTRIBUTION = 300_000;

const CASH = 3_200_000;
const INVEST = 1_500_000;
const DEBT = 2_000_000;

test('50 목표를 정하고 모은 돈을 더한다', async ({ appShell, demo, goal, home }) => {
  await home.open();
  await home.waitReady();
  await demo.open('목표 모으기', '무엇을 위해 얼마를 모을지 정하고 채워 간다');

  await demo.step('관리 탭에서 목표로 들어간다');
  await appShell.goToTab('관리');
  await appShell.followLink('목표');
  await goal.waitReady();
  await demo.beat(2);

  await demo.step('아직 정한 목표가 없다. 여기서 시작한다');
  await expect(goal.emptyTitle).toBeVisible();
  await demo.beat(3);

  await demo.step('무엇을 위해 얼마를, 언제까지 모을지 적는다');
  await goal.startButton.click();
  await goal.form.waitOpen();
  await goal.form.fill({ title: GOAL_TITLE, amount: GOAL_AMOUNT, deadline: DEADLINE });
  await demo.beat(3);

  await demo.step('이미 모아 둔 돈이 있으면 시작 금액으로 적는다');
  await goal.form.fill({ initial: GOAL_INITIAL });
  await goal.form.save();
  await goal.waitReady();
  await demo.beat(2);

  await demo.step('카드가 생기고 지금까지와 남은 금액이 함께 온다');
  await expect(goal.title).toHaveText(GOAL_TITLE);
  await expect(goal.current).toHaveText(formatCurrency(GOAL_INITIAL));
  await expect(goal.remaining).toHaveText(formatCurrency(GOAL_AMOUNT - GOAL_INITIAL));
  await demo.beat(3);

  await demo.step('기한이 있으니 매달 얼마씩 모으면 되는지도 적어 준다');
  await expect(goal.requiredMonthly).toBeVisible();
  await demo.beat(3);

  await demo.step('모은 돈을 더한다');
  await goal.contributeButton.click();
  await goal.contribution.waitOpen();
  await goal.contribution.fill({ amount: CONTRIBUTION });
  await demo.beat(2);

  await demo.step('저장하면 게이지와 숫자가 그 자리에서 따라온다');
  await goal.contribution.save();
  await expect(goal.current).toHaveText(formatCurrency(GOAL_INITIAL + CONTRIBUTION));
  await expect(goal.remaining).toHaveText(
    formatCurrency(GOAL_AMOUNT - GOAL_INITIAL - CONTRIBUTION),
  );
  await demo.beat(3);

  await demo.step('더한 돈은 목록에 한 줄로 남고 언제든 지울 수 있다');
  await expect(goal.logRemoveButtons).toHaveCount(1);
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('51 자산을 적으면 순자산이 나온다', async ({ appShell, assets, demo, home, manage }) => {
  await home.open();
  await home.waitReady();
  await demo.open('자산 적기', '가진 것과 갚을 것을 적으면 순자산이 나온다');

  await demo.step('관리 탭 맨 위가 자산 입구다');
  await appShell.goToTab('관리');
  await manage.waitReady();
  await expect(manage.assetsEntry).toBeVisible();
  await demo.beat(3);

  await demo.step('눌러서 들어가면 아직 아무것도 없다');
  await manage.assetsEntry.click();
  await assets.waitReady();
  await expect(assets.emptyTitle).toBeVisible();
  await demo.beat(2);

  await demo.step('예적금부터 적는다. 이름은 안 적어도 된다');
  await assets.start({ group: '예적금·현금', name: '월급 통장', amount: CASH });
  await expect(assets.netWorth).toHaveText(formatCurrency(CASH));
  await demo.beat(3);

  await demo.step('투자한 것도 그룹을 골라 더한다');
  await assets.add('투자', { name: 'ETF', amount: INVEST });
  await expect(assets.netWorth).toHaveText(formatCurrency(CASH + INVEST));
  await demo.beat(3);

  await demo.step('갚을 돈도 양수로 적는다. 빼는 것은 그룹이 정한다');
  await assets.add('부채', { name: '전세 대출', amount: DEBT });
  await expect(assets.netWorth).toHaveText(formatCurrency(CASH + INVEST - DEBT));
  await demo.beat(3);

  await demo.step('순자산이 어디서 나왔는지 한 줄로 적어 준다');
  await expect(assets.breakdown).toBeVisible();
  await expect(assets.groupTotal('부채')).toHaveText(formatCurrency(DEBT));
  await demo.beat(3);

  await demo.step('관리 탭으로 돌아오면 그 숫자가 입구에 그대로 있다');
  await appShell.pressBack();
  await manage.waitReady();
  await expect(manage.assetsEntry).toContainText(formatCurrency(CASH + INVEST - DEBT));
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
