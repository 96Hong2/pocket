import { formatCurrency, formatMonthLabel } from '../../../src/shared/lib/format';
import { lastMonth } from '../../support/api';
import { expect, test } from '../support/director';

/**
 * 관리 탭 안 예산을 찍는다. 정하기·쪼개기·넘기기·이어쓰기·끝난 달 다섯 장면이다.
 *
 * 장면마다 화면을 먼저 열어 제목 카드를 띄우고, 그 뒤에 배경을 심고 다시 연다.
 * 심어 두고 열면 영상 앞머리가 흰 화면으로 남는다.
 *
 * 이어쓰기는 오늘이 속한 기간을 조회할 때만 일어난다. 달을 넘겨보며 확인할 수 없어서
 * 지난달에 예산을 심고 이번 달을 다시 여는 방식으로 보여준다.
 */

const LAST_MONTH = lastMonth();

test('30 전체 예산을 정하면 남은 돈이 보인다', async ({ appShell, demo, home, manage, prep }) => {
  await manage.open();
  await manage.waitReady();
  await demo.open('전체 예산 정하기', '한 달 쓸 돈을 정하면 남은 돈이 따라온다');

  await demo.step('아직 이번 달 예산이 없다');
  await expect(manage.total.startButton).toBeVisible();
  await expect(manage.total.gauge).toHaveCount(0);
  await demo.beat(2);

  await demo.step('이번 달에 이미 12만원을 썼다');
  await prep.addExpense({ amount: 120_000, daysAgo: 0 });
  await manage.open();
  await manage.waitReady();
  await expect(manage.total.emptyTitle).toBeVisible();
  await demo.beat(2);

  await demo.step('예산 정하기를 누르면 금액 시트가 열린다');
  await manage.total.startButton.click();
  await manage.total.sheet.waitOpen();
  await demo.beat(2);

  await demo.step('60만원으로 정한다');
  await manage.total.sheet.save(600_000);
  await expect(manage.total.amount).toHaveText(formatCurrency(600_000));
  await demo.beat(2);

  await demo.step('그 자리에서 게이지와 남은 돈이 생긴다');
  await expect(manage.total.used).toHaveText(formatCurrency(120_000));
  await expect(manage.total.left).toHaveText(formatCurrency(480_000));
  expect(await manage.total.gaugePercent()).toBe(20);
  await demo.beat(3);

  await demo.step('하루에 얼마까지 쓸 수 있는지도 함께 말한다');
  await expect(manage.total.caption).toContainText('20% 사용 · 하루');
  await demo.beat(3);

  await demo.step('홈도 같은 값을 본다');
  await appShell.goToTab('홈');
  await home.waitReady();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(480_000));
  expect(await home.hero.gaugePercent()).toBe(20);
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('31 카테고리 예산으로 쪼갠다', async ({ demo, manage, prep }) => {
  await manage.open();
  await manage.waitReady();
  await demo.open('카테고리 예산', '전체 예산을 쓰임새대로 쪼갠다');

  await demo.step('전체 예산 30만원부터 정해 둔다');
  await prep.setBudget(300_000);
  await manage.open();
  await manage.waitReady();
  await expect(manage.total.amount).toHaveText(formatCurrency(300_000));
  await demo.beat(2);

  await demo.step('아직 쪼갠 것이 없다');
  await expect(manage.categories.rows).toHaveCount(0);
  await expect(manage.categories.countBadge).toHaveText('0개');
  await demo.beat(2);

  await demo.step('식비부터 고른다');
  await manage.categories.addButton.click();
  await manage.categories.sheet.waitOpen();
  await manage.categories.sheet.pick('식비');
  await demo.beat(2);

  await demo.step('한도 20만원으로 저장한다');
  await manage.categories.sheet.save(200_000);
  await expect(manage.categories.cap('식비')).toHaveText(formatCurrency(200_000));
  await demo.beat(2);

  await demo.step('정한 것만 목록에 남는다. 나머지는 0원으로 채우지 않는다');
  await expect(manage.categories.rows).toHaveCount(1);
  await expect(manage.categories.row('쇼핑')).toHaveCount(0);
  await demo.beat(3);

  await demo.step('교통도 15만원으로 더한다');
  await expect(manage.categories.sumNotice).toHaveCount(0);
  await manage.categories.add('교통', 150_000);
  await expect(manage.categories.countBadge).toHaveText('2개');
  await demo.beat(2);

  await demo.step('합이 전체 예산을 넘으면 한 줄로 알려 준다. 저장은 막지 않는다');
  await expect(manage.categories.sumNotice).toHaveText(
    `카테고리 예산 합(${formatCurrency(350_000)})이 전체 예산(${formatCurrency(300_000)})보다 커요`,
  );
  await expect(manage.categories.cap('교통')).toHaveText(formatCurrency(150_000));
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('32 카테고리 예산을 넘기면 그 카테고리를 짚어 말한다', async ({
  appShell,
  demo,
  home,
  manage,
  prep,
  recordSheet,
}) => {
  await manage.open();
  await manage.waitReady();
  await demo.open('카테고리 초과', '넘긴 자리를 이름으로 짚어 준다');

  await demo.step('전체 60만원, 식비만 5만원으로 좁게 잡아 둔다');
  const food = await prep.categoryIdByName('식비');
  await prep.setBudget(600_000);
  await prep.setCategoryBudget(food, 50_000);
  await prep.addExpense({ amount: 30_000, daysAgo: 0, categoryId: food });
  await manage.open();
  await manage.waitReady();
  await expect(manage.categories.used('식비')).toHaveText(formatCurrency(30_000));
  await demo.beat(2);

  await demo.step('아직 한도 안이라 주의 표시가 없다');
  await expect(manage.categories.caution('식비')).toHaveCount(0);
  await demo.beat(2);

  await demo.step('홈에서 식비로 4만원을 더 쓴다');
  await appShell.goToTab('홈');
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(40_000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await demo.beat(2);

  await demo.step('전체 예산은 남았지만 식비가 넘었다고 말한다');
  await expect(recordSheet.feedback.headline).toHaveText(
    `식비에서 예산을 ${formatCurrency(20_000)} 넘었어요.`,
  );
  await demo.beat(3);

  await demo.step('관리 탭으로 돌아오면 그 줄에 주의가 붙어 있다');
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await appShell.goToTab('관리');
  await manage.waitReady();
  await expect(manage.categories.used('식비')).toHaveText(formatCurrency(70_000));
  await expect(manage.categories.caution('식비')).toBeVisible();
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('33 지난달 예산이 이번 달로 이어진다', async ({ demo, manage, prep }) => {
  await manage.open();
  await manage.waitReady();
  await demo.open('예산 이어쓰기', '지난달에 정한 것을 다시 정하지 않아도 된다');

  await demo.step('이번 달에는 아직 아무것도 없다');
  await expect(manage.total.emptyTitle).toBeVisible();
  await expect(manage.banner.card).toHaveCount(0);
  await demo.beat(2);

  await demo.step('지난달에 40만원과 식비 15만원을 정해 뒀다고 하자');
  const food = await prep.categoryIdByName('식비');
  await prep.setBudget(400_000, LAST_MONTH);
  await prep.setCategoryBudget(food, 150_000, LAST_MONTH);
  await demo.beat(2);

  await demo.step('이번 달을 다시 열면 그대로 넘어와 있다');
  await manage.open();
  await manage.waitReady();
  await expect(manage.banner.text).toBeVisible();
  await expect(manage.total.amount).toHaveText(formatCurrency(400_000));
  await demo.beat(3);

  await demo.step('금액만이 아니라 카테고리 한도까지 함께 온다');
  await expect(manage.categories.rows).toHaveCount(1);
  await expect(manage.categories.cap('식비')).toHaveText(formatCurrency(150_000));
  await demo.beat(3);

  await demo.step('띠 안의 수정으로 이번 달 금액을 바꾼다');
  await manage.banner.editButton.click();
  await manage.total.sheet.save(700_000);
  await expect(manage.total.amount).toHaveText(formatCurrency(700_000));
  await demo.beat(2);

  await demo.step('한 번 손댄 예산이라 띠가 사라진다. 닫기 버튼은 따로 없다');
  await expect(manage.banner.card).toHaveCount(0);
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('34 끝난 달은 보기만 한다', async ({ demo, manage, prep }) => {
  await manage.open();
  await manage.waitReady();
  await demo.open('끝난 달', '지난 기록은 고치지 않고 돌아본다');

  await demo.step('이번 달과 지난달에 각각 예산을 잡아 둔다');
  const food = await prep.categoryIdByName('식비');
  await prep.setBudget(600_000);
  await prep.setCategoryBudget(food, 200_000);
  await prep.setBudget(300_000, LAST_MONTH);
  await prep.setCategoryBudget(food, 100_000, LAST_MONTH);
  await manage.open();
  await manage.waitReady();
  await expect(manage.total.amount).toHaveText(formatCurrency(600_000));
  await demo.beat(2);

  await demo.step('이번 달에는 고칠 입구가 다 있다');
  await expect(manage.total.editButton).toBeVisible();
  await expect(manage.total.deleteButton).toBeVisible();
  await expect(manage.categories.addButton).toBeVisible();
  await demo.beat(3);

  await demo.step('‹ 를 눌러 지난달로 옮긴다');
  await manage.goToMonth(formatMonthLabel(LAST_MONTH));
  await expect(manage.closedNotice).toBeVisible();
  await demo.beat(3);

  await demo.step('그 달에 정했던 금액은 그대로 읽힌다');
  await expect(manage.total.amount).toHaveText(formatCurrency(300_000));
  await expect(manage.categories.cap('식비')).toHaveText(formatCurrency(100_000));
  await demo.beat(3);

  await demo.step('수정·지우기·추가가 하나도 없다');
  await expect(manage.total.editButton).toHaveCount(0);
  await expect(manage.total.deleteButton).toHaveCount(0);
  await expect(manage.categories.addButton).toHaveCount(0);
  await expect(manage.categories.editButton('식비')).toHaveCount(0);
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
