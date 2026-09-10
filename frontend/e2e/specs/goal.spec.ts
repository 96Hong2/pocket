import { formatCurrency, shiftMonth, toLedgerDate } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';
import { thisMonth } from '../support/api';

/**
 * 목표 화면.
 *
 * 진행 중인 목표는 하나다. 남은 금액·진행률·매달 모을 돈·도달 예상을 서버가 세고
 * 화면이 그대로 그리는지, 없는 값을 0 으로 지어내지 않는지를 화면에서 본다.
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

/** 기한까지 매달 모을 돈. 모자라면 안 되므로 올림이다. */
const REQUIRED = Math.ceil((TARGET - INITIAL) / MONTHS_LEFT);

// 목표 이름은 60자까지다. 그 상한에 가깝게 만든다.
const VERY_LONG = '올해 안에 꼭 다녀오고 싶은 제주도 한 달 살기 여행 경비 모으기 계획';

test('관리 탭에서 목표로 들어가면 빈 상태가 있다', async ({ appShell, goal, manage }) => {
  await manage.open();
  await manage.waitReady();

  // 자산은 순자산을 그 자리에 보여주는 카드라 목록이 아니라 예산 위에 있다.
  // 알림 설정은 여기와 앱 설정 두 곳에 둔다. 켜려는 사람이 어느 쪽을 먼저 뒤질지 갈린다.
  await expect(appShell.subScreenLinks('관리 하위 화면')).toHaveText([
    '목표',
    '카테고리 관리',
    '알림 설정',
    '앱 설정',
  ]);

  await appShell.followLink('목표');
  await appShell.expectScreen('목표', '모으고 싶은 것 하나만 정해요');
  await goal.waitReady();

  await expect(goal.emptyTitle).toBeVisible();
  await expect(goal.startButton).toBeVisible();
  // 목표가 없으면 카드도 게이지도 그리지 않는다. 0원 목표를 펼쳐 두지 않는다.
  await expect(goal.card).toHaveCount(0);
});

test('네 칸을 채우면 남은 금액과 매달 모을 돈이 숫자로 나온다', async ({ goal }) => {
  await goal.open();
  await goal.waitReady();

  await goal.start({ title: TITLE, amount: TARGET, deadline: DEADLINE, initial: INITIAL });

  await expect(goal.title).toHaveText(TITLE);
  await expect(goal.current).toHaveText(formatCurrency(INITIAL));
  await expect(goal.remaining).toHaveText(formatCurrency(TARGET - INITIAL));
  // 남은 금액을 남은 달 수로 나눈 값이다. spec 이 직접 세서 견준다.
  await expect(goal.requiredMonthly).toHaveText(formatCurrency(REQUIRED));
  expect(await goal.gaugePercent()).toBe(20);
});

test('모은 돈이 없으면 도달 예상을 숫자로 지어내지 않는다', async ({ goal, prep }) => {
  await prep.setGoal({ title: TITLE, targetAmount: TARGET, targetDate: DEADLINE });

  await goal.open();
  await goal.waitReady();

  await expect(goal.eta).toHaveText('아직 예상하기 어려워요');
  // 페이스를 모르는데 '0달 뒤' 나 '1달 뒤' 를 적으면 근거 없는 숫자가 화면에 남는다.
  expect(await goal.eta.textContent()).not.toMatch(/\d/);
  await expect(goal.logEmpty).toBeVisible();
});

test('모은 돈을 더하면 게이지와 남은 금액이 함께 움직이고 도달 예상이 생긴다', async ({
  goal,
  prep,
}) => {
  await prep.setGoal({ title: TITLE, targetAmount: TARGET, targetDate: DEADLINE });

  await goal.open();
  await goal.waitReady();
  expect(await goal.gaugePercent()).toBe(0);

  await goal.contribute({ amount: INITIAL });

  await expect(goal.current).toHaveText(formatCurrency(INITIAL));
  await expect(goal.remaining).toHaveText(formatCurrency(TARGET - INITIAL));
  expect(await goal.gaugePercent()).toBe(20);
  // 페이스가 생겼으니 예상도 생긴다. 몇 달인지는 서버가 정하므로 모양만 본다.
  await expect(goal.eta).toHaveText(/^이 속도면 \d+달 뒤$/);
  await expect(goal.logRemoveButtons).toHaveCount(1);
});

test('모은 돈을 지우면 그 자리에서 되돌아온다', async ({ goal, prep }) => {
  const goalId = await prep.setGoal({ title: TITLE, targetAmount: TARGET });
  await prep.addContribution(goalId, { amount: INITIAL });

  await goal.open();
  await goal.waitReady();
  await expect(goal.current).toHaveText(formatCurrency(INITIAL));

  await goal.logRemoveButtons.first().click();

  await expect(goal.logRemoveButtons).toHaveCount(0);
  await expect(goal.current).toHaveText(formatCurrency(0));
  await expect(goal.remaining).toHaveText(formatCurrency(TARGET));
  expect(await goal.gaugePercent()).toBe(0);
});

test('기한이 없는 목표에는 매달 모을 돈 줄이 아예 없다', async ({ goal, prep }) => {
  await prep.setGoal({ title: '노트북', targetAmount: 2_000_000 });

  await goal.open();
  await goal.waitReady();

  // 나눌 달 수가 없으면 만들 수 없는 값이다. 0 으로 적지 않고 줄을 통째로 뺀다.
  await expect(goal.requiredMonthly).toHaveCount(0);
  await expect(goal.remaining).toHaveText(formatCurrency(2_000_000));
});

test('목표액에 닿으면 달성으로 표시하고 예상 줄을 걷는다', async ({ goal, prep }) => {
  const goalId = await prep.setGoal({ title: '에어팟', targetAmount: 300_000 });
  await prep.addContribution(goalId, { amount: 300_000 });

  await goal.open();
  await goal.waitReady();

  await expect(goal.achievedBadge).toBeVisible();
  await expect(goal.remaining).toHaveText(formatCurrency(0));
  expect(await goal.gaugePercent()).toBe(100);
  // 다 모은 사람에게 '이 속도면 0달 뒤' 를 적을 이유가 없다.
  await expect(goal.eta).toHaveCount(0);
});

test('기한이 지난 목표는 탓하지 않고 바꿀 수 있다고만 알린다', async ({ goal, prep }) => {
  const past = `${shiftMonth(thisMonth(), -2)}-15`;
  await prep.setGoal({ title: TITLE, targetAmount: TARGET, targetDate: past });

  await goal.open();
  await goal.waitReady();

  await expect(goal.overdueNote).toBeVisible();
  // 기한이 지났으면 나눌 달이 없다. 지난 기한으로 매달 얼마씩을 만들어내지 않는다.
  await expect(goal.requiredMonthly).toHaveCount(0);
});

test('진행 중인 목표가 있으면 하나 더 만들 수 없다', async ({ goal, prep }) => {
  await prep.setGoal({ title: TITLE, targetAmount: TARGET });

  // 화면에는 만들기 입구가 아예 없어서 두 번째 목표를 화면으로는 만들 수 없다.
  const rejected = await prep.trySetGoal({ title: '또 하나', targetAmount: 1_000_000 });

  expect(rejected.status).toBe(422);
  expect(rejected.code).toBe('GOAL_ALREADY_ACTIVE');

  await goal.open();
  await goal.waitReady();
  await expect(goal.startButton).toHaveCount(0);
});

test('목표 지우기는 한 번 더 묻고, 접으면 목표가 그대로 남는다', async ({ goal, prep }) => {
  await prep.setGoal({ title: TITLE, targetAmount: TARGET });

  await goal.open();
  await goal.waitReady();
  await goal.editButton.click();
  await goal.form.waitOpen();

  // 누르자마자 사라지지 않는다. 목표는 몇 달을 들고 가는 것이라 되돌릴 수 없는 것을 한 번 묻는다.
  await goal.form.deleteButton.click();
  await expect(goal.form.confirmText).toBeVisible();
  await expect(goal.form.dialog).toBeVisible();

  await goal.form.keepButton.click();
  await expect(goal.form.confirmArea).toHaveCount(0);
  await goal.form.saveButton.click();
  await goal.form.waitClosed();

  await expect(goal.title).toHaveText(TITLE);
});

test('목표 시트의 기한 칸은 칸 밖으로 나가지 않는다', async ({ goal, page }) => {
  await goal.open();
  await goal.waitReady();
  await goal.startButton.click();
  await goal.form.waitOpen();

  // 날짜 칸은 기기마다 자기 최소 너비를 우겨 넣어 부모를 밀고 나간 적이 있다.
  const input = await goal.form.deadlineField.boundingBox();
  const field = await page.locator('label').filter({ hasText: '언제까지' }).boundingBox();

  expect(input).not.toBeNull();
  expect(field).not.toBeNull();
  expect(input!.x).toBeGreaterThanOrEqual(field!.x);
  expect(input!.x + input!.width).toBeLessThanOrEqual(field!.x + field!.width);

  // 시트 자체도 가로로 밀리지 않는다.
  const { content, visible } = await goal.widths();
  expect(content).toBeLessThanOrEqual(visible);
});

test('목표를 지우면 빈 상태로 돌아오고 새로 만들 수 있다', async ({ goal, prep }) => {
  await prep.setGoal({ title: TITLE, targetAmount: TARGET });

  await goal.open();
  await goal.waitReady();
  await goal.remove();

  await expect(goal.emptyTitle).toBeVisible();
  await expect(goal.card).toHaveCount(0);

  // 접은 목표가 남아 있어도 새 목표를 막지 않는다. 막으면 목표를 한 번 쓰고 끝나는 기능이 된다.
  await goal.start({ title: '노트북', amount: 2_000_000 });
  await expect(goal.title).toHaveText('노트북');
});

test('홈에는 목표가 있을 때만 카드가 뜨고 눌러서 목표 화면으로 간다', async ({
  appShell,
  goal,
  home,
  prep,
}) => {
  await prep.setGoal({ title: TITLE, targetAmount: TARGET, initialAmount: INITIAL });

  await home.open();
  await home.waitReady();

  await expect(home.goal.link).toBeVisible();
  await expect(home.goal.title(TITLE)).toBeVisible();
  await expect(home.goal.foot).toHaveText(`남은 ${formatCurrency(TARGET - INITIAL)}`);
  expect(await home.goal.gaugePercent()).toBe(20);

  await home.goal.link.click();
  await appShell.expectScreen('목표', '모으고 싶은 것 하나만 정해요');
  await goal.waitReady();
  await expect(goal.title).toHaveText(TITLE);
});

test('목표가 없는 사람 홈에는 그 카드가 없다', async ({ home }) => {
  await home.open();
  await home.waitReady();

  // 아직 안 정한 것을 홈에서 권하지 않는다. 홈은 기록하러 오는 자리다.
  await expect(home.goal.link).toHaveCount(0);
});

test('시스템 뒤로가기로 관리 탭에 돌아오고, 시트가 열려 있으면 시트를 먼저 닫는다', async ({
  appShell,
  goal,
  manage,
}) => {
  await manage.open();
  await manage.waitReady();
  await appShell.followLink('목표');
  await goal.waitReady();

  // 하위 화면이라 탭바가 통째로 빠진다. 화면 안에 뒤로가기를 그리지도 않는다.
  await appShell.expectTabsHidden();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);
  await appShell.expectDocumentTitle('목표');

  await goal.startButton.click();
  await goal.form.waitOpen();
  await appShell.pressBack();

  // 시트가 열린 채 화면만 뒤로 빠지면 목표 화면 밖에 시트가 떠 있게 된다.
  await goal.form.waitClosed();
  await appShell.expectScreen('목표', '모으고 싶은 것 하나만 정해요');

  await appShell.pressBack();
  await appShell.expectScreen('관리', '예산과 분류를 손봐요');
  await appShell.expectTabsVisible();
});

test('진입 즉시 저절로 뜨는 시트가 없다', async ({ goal }) => {
  await goal.open();
  await goal.waitReady();

  // 목표를 묻는 시트가 저절로 열리면, 정할 준비가 안 된 사람이 닫는 것부터 배워야 한다.
  await expect(goal.form.dialog).toHaveCount(0);
  await expect(goal.contribution.dialog).toHaveCount(0);
});

test('긴 이름과 큰 금액에도 화면이 가로로 넘치지 않는다', async ({ goal, prep }) => {
  const goalId = await prep.setGoal({
    title: VERY_LONG,
    targetAmount: 98_765_432_100_000,
    targetDate: DEADLINE,
  });
  await prep.addContribution(goalId, { amount: 12_345_678_900_000, on: toLedgerDate(new Date()) });

  await goal.open();
  await goal.waitReady();
  await expect(goal.title).toHaveText(VERY_LONG);

  // 넘치면 브라우저가 화면을 축소해 탭바가 보이는 영역 밖으로 밀린다. 관리 탭으로 돌아갈 수 없다.
  const box = await goal.widths();
  expect(box.content, `${JSON.stringify(box)} 긴 이름이 화면을 가로로 밀었다`).toBeLessThanOrEqual(
    box.visible + 1,
  );
});
