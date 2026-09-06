import { formatCurrency, formatSignedCurrency, toLedgerDate } from '../../../src/shared/lib/format';
import { expect, test } from '../support/director';

/**
 * 홈 맨 위에 무엇을 크게 볼지 고르는 한 장면.
 *
 * 홈을 먼저 열어 지금 얼굴을 보여준 뒤 설정으로 들어간다. 설정 화면만 찍으면 갈래 세 개가
 * 무엇을 바꾸는 것인지 영상에서 알 수 없다. 고를 때마다 아래 한 줄이 결과를 먼저 말하고,
 * 홈으로 돌아와 그 말이 맞는지 눈으로 확인하는 순서다.
 *
 * 여기서 보이는 것은 설정 화면의 생김새가 아니라, 고른 값이 새로고침 없이 홈까지
 * 이어지는 것이다. 번 돈·쓴 돈·예산은 배경으로 미리 심어 두고 이 장면에서 만들지 않는다.
 */

/** 히어로 라벨 앞에 붙는 달. 기기 시간대가 아니라 가계부 시간대로 얻는다. */
const MONTH_NUMBER = Number(toLedgerDate(new Date()).slice(5, 7));

const INCOME = 2_000_000;
const EXPENSE = 500_000;
const BUDGET = 1_000_000;

test('48 홈 맨 위에 무엇을 보여줄지 고른다', async ({
  appShell,
  demo,
  home,
  manage,
  prep,
  settings,
}) => {
  // 세 갈래가 서로 다른 숫자를 보여주려면 번 돈·쓴 돈·예산이 다 있어야 한다.
  await prep.addTransaction({ amount: INCOME, daysAgo: 0, type: 'income' });
  await prep.addExpense({ amount: EXPENSE, daysAgo: 0 });
  await prep.setBudget(BUDGET);

  await home.open();
  await home.waitReady();
  await demo.open('홈 얼굴 고르기', '맨 위에 무엇을 크게 볼지 내가 정한다');

  await demo.step('지금 홈은 남은 예산을 가장 크게 보여준다');
  await expect(settings.heroResult.label).toHaveText(`${MONTH_NUMBER}월 · 남은 예산`);
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - EXPENSE));
  await demo.beat(3);

  await demo.step('관리 탭을 거쳐 앱 설정으로 들어간다');
  await appShell.goToTab('관리');
  await manage.waitReady();
  await appShell.followLink('앱 설정');
  await settings.waitReady();
  await demo.beat(2);

  await demo.step('갈래 아래 한 줄이 지금 홈 모습을 되짚어 준다');
  await expect(settings.preview).toHaveText('홈 맨 위에 남은 예산이 먼저 보여요.');
  await demo.beat(3);

  await demo.step('수입·지출로 옮기면 그 한 줄이 먼저 바뀐다');
  await settings.chooseHero('수입·지출');
  await expect(settings.preview).toHaveText('홈 맨 위에 이번 달 차액이 먼저 보여요.');
  await demo.beat(3);

  await demo.step('홈으로 돌아오면 새로고침 없이 차액이 크게 온다');
  await appShell.pressBack();
  await appShell.goToTab('홈');
  await home.waitReady();
  await expect(settings.heroResult.delta).toHaveText(formatSignedCurrency(INCOME - EXPENSE));
  await demo.beat(3);

  await demo.step('설정으로 다시 가서 수입·예산을 고른다');
  await appShell.goToTab('관리');
  await manage.waitReady();
  await appShell.followLink('앱 설정');
  await settings.waitReady();
  await settings.chooseHero('수입·예산');
  await expect(settings.preview).toHaveText('홈 맨 위에 번 돈과 남은 예산이 함께 보여요.');
  await demo.beat(3);

  await demo.step('이번에는 번 돈과 남은 예산이 함께 뜬다');
  await appShell.pressBack();
  await appShell.goToTab('홈');
  await home.waitReady();
  await expect(settings.heroResult.label).toHaveText(`${MONTH_NUMBER}월 · 번 돈과 남은 예산`);
  await expect(settings.heroResult.income).toHaveText(formatSignedCurrency(INCOME));
  await demo.beat(3);

  await demo.step('예산이 걸린 갈래라 게이지도 함께 온다');
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - EXPENSE));
  await expect(home.hero.gauge).toBeVisible();
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
