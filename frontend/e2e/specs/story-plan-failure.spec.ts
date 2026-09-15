import { formatCurrency, formatNumber } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * 예산·목표를 **저장하거나 지우다 막혔을 때.**
 *
 * 여기 있는 것은 전부 사용자가 자기 손으로 적은 값이다. 실패한 자리가 아무 말도 안 하면
 * 사람은 「눌렀는데 아무 일도 안 일어났다」로 읽고, 시트가 닫혀 있으면 저장된 줄 알고 나간다.
 * 그래서 매번 셋을 본다. **적어 둔 값이 남아 있나 · 왜 안 됐는지 적혀 있나 · 풀면 되나.**
 *
 * 실패는 `page.route` 로 그 요청 하나만 막아 만든다. 되돌아오는 것까지 봐야 하므로
 * 막은 것은 그 자리에서 풀고 다시 눌러 본다.
 */

const BUDGETS = '**/api/v1/budgets*';
const CATEGORY_BUDGETS = '**/api/v1/budgets/categories/*';
const GOAL_FINISH = '**/api/v1/goals/*/finish';
const GOAL_CONTRIBUTIONS = '**/api/v1/goals/*/contributions';

/**
 * 서버가 자기 사정으로 넘어진 응답.
 *
 * 앱과 API 는 출처가 달라 브라우저가 응답에 CORS 헤더를 요구한다. 없으면 앱이 500 이 아니라
 * 네트워크 실패로 읽어 다른 문구가 뜬다.
 */
const FAIL_500 = {
  status: 500,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: '' } }),
};

/** 서버가 문구를 안 줬을 때 그 code 로 앱이 고르는 말(`shared/api` 의 문구 표). */
const SERVER_DOWN = '문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.';

const BUDGET = 600_000;
const FOOD_CAP = 200_000;

const TITLE = '제주도 여행';
const TARGET = 3_000_000;
const SAVED_SO_FAR = 500_000;
const ADDING = 200_000;

test.use({
  // 우리가 일부러 내려보낸 500 이다. 브라우저가 그 응답을 적는 것이고 앱이 낸 오류가 아니다.
  consoleErrorAllowList: [/Failed to load resource[\s\S]*500/],
});

test('예산 금액이 저장되지 않으면 시트가 닫히지 않고 적은 금액이 남는다', async ({
  manage,
  page,
}) => {
  await manage.open();
  await manage.waitReady();
  await expect(manage.total.emptyTitle).toBeVisible();

  await page.route(BUDGETS, (route) =>
    route.request().method() === 'PUT' ? route.fulfill(FAIL_500) : route.continue(),
  );

  await manage.total.startButton.click();
  await manage.total.sheet.waitOpen();
  await manage.total.sheet.amountField.fill(String(BUDGET));
  await manage.total.sheet.saveButton.click();

  await expect(manage.total.sheet.failureNotice).toHaveText(SERVER_DOWN);
  // 시트가 닫히면 저장된 줄 알고 나가거나, 금액을 처음부터 다시 쳐야 한다.
  await expect(manage.total.sheet.amountField).toHaveValue(formatNumber(BUDGET));
  await expect(manage.total.emptyTitle).toBeVisible();

  await page.unroute(BUDGETS);
  await manage.total.sheet.saveButton.click();
  await manage.total.sheet.waitClosed();

  // 적어 둔 값 그대로 저장된다. 한 번 더 치게 하지 않는다.
  await expect(manage.total.amount).toHaveText(formatCurrency(BUDGET));
});

test('예산이 지워지지 않으면 금액과 카테고리 한도가 그대로 남는다', async ({
  manage,
  page,
  prep,
}) => {
  const food = await prep.categoryIdByName('식비');
  await prep.setBudget(BUDGET);
  await prep.setCategoryBudget(food, FOOD_CAP);

  await manage.open();
  await manage.waitReady();
  await expect(manage.total.amount).toHaveText(formatCurrency(BUDGET));

  await page.route(BUDGETS, (route) =>
    route.request().method() === 'DELETE' ? route.fulfill(FAIL_500) : route.continue(),
  );

  await manage.total.deleteButton.click();
  await expect(manage.total.deleteConfirm).toBeVisible();
  await manage.total.confirmDeleteButton.click();

  await expect(manage.total.deleteFailure).toHaveText(SERVER_DOWN);
  /*
    지워진 것처럼 보이면 사람은 예산을 다시 정하러 간다. 그 사이 서버에는 옛 예산이 남아 있어
    카테고리 한도까지 어긋난 채로 다음 달을 맞는다.
  */
  await expect(manage.total.amount).toHaveText(formatCurrency(BUDGET));
  await expect(manage.categories.cap('식비')).toHaveText(formatCurrency(FOOD_CAP));

  await page.unroute(BUDGETS);
  await manage.total.remove();

  await expect(manage.total.emptyTitle).toBeVisible();
  // 지워졌으면 아까 못 지웠다는 말도 함께 걷힌다.
  await expect(manage.total.deleteFailure).toHaveCount(0);
});

test('카테고리 한도가 저장되지 않으면 고른 분류와 적은 한도가 시트에 남는다', async ({
  manage,
  page,
  prep,
}) => {
  await prep.setBudget(BUDGET);

  await manage.open();
  await manage.waitReady();
  await expect(manage.categories.rows).toHaveCount(0);

  await page.route(CATEGORY_BUDGETS, (route) =>
    route.request().method() === 'PUT' ? route.fulfill(FAIL_500) : route.continue(),
  );

  await manage.categories.addButton.click();
  await manage.categories.sheet.waitOpen();
  await manage.categories.sheet.pick('식비');
  await manage.categories.sheet.amountField.fill(String(FOOD_CAP));
  await manage.categories.sheet.saveButton.click();

  await expect(manage.categories.sheet.failureNotice).toHaveText(SERVER_DOWN);
  await expect(manage.categories.sheet.amountField).toHaveValue(formatNumber(FOOD_CAP));
  // 고른 분류까지 풀리면 칩부터 다시 눌러야 한다. 한 번 더 누르는 것으로 끝나야 한다.
  await expect(manage.categories.sheet.categoryChip('식비')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(manage.categories.rows).toHaveCount(0);

  await page.unroute(CATEGORY_BUDGETS);
  await manage.categories.sheet.saveButton.click();
  await manage.categories.sheet.waitClosed();

  await expect(manage.categories.cap('식비')).toHaveText(formatCurrency(FOOD_CAP));
  await expect(manage.categories.rows).toHaveCount(1);
});

test('목표가 마쳐지지 않으면 버튼이 돌아오고 지난 목표로 넘어가지 않는다', async ({
  goal,
  page,
  prep,
}) => {
  const goalId = await prep.setGoal({ title: TITLE, targetAmount: TARGET });
  await prep.addContribution(goalId, { amount: TARGET });

  await goal.open();
  await goal.waitReady();
  await expect(goal.done).toBeVisible();

  // 응답을 붙들어 둔다. 그래야 누른 뒤와 돌아온 뒤를 눈으로 갈라 볼 수 있다.
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(GOAL_FINISH, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await held;
    await route.fulfill(FAIL_500);
  });

  await goal.finishButton.click();
  // 누른 것이 먹었다는 표시. 이게 없으면 같은 버튼을 계속 누르게 된다.
  await expect(goal.finishAction).toHaveText('마치는 중이에요');
  release();

  await expect(goal.finishFailure).toHaveText(SERVER_DOWN);
  // 「마치는 중이에요」에 멈춰 있으면 다시 누를 수도, 포기할 수도 없다.
  await expect(goal.finishAction).toHaveText('이 목표 마치기');
  await expect(goal.finishAction).toBeEnabled();
  // 마치지 못했으니 지난 목표로 옮겨 가지 않는다.
  await expect(goal.past).toHaveCount(0);

  await page.unroute(GOAL_FINISH);
  await goal.finishButton.click();

  // 마치면 진행 중인 목표가 없어져 새 목표를 정하는 시트가 스스로 열린다.
  await goal.form.waitOpen();
  await goal.form.dismiss();
  await expect(goal.emptyTitle).toBeVisible();
  await expect(goal.pastRow(TITLE)).toBeVisible();
});

test('모은 돈이 더해지지 않으면 시트가 닫히지 않고 적은 금액이 남는다', async ({
  goal,
  page,
  prep,
}) => {
  await prep.setGoal({ title: TITLE, targetAmount: TARGET, initialAmount: SAVED_SO_FAR });

  await goal.open();
  await goal.waitReady();
  await expect(goal.current).toHaveText(formatCurrency(SAVED_SO_FAR));

  await page.route(GOAL_CONTRIBUTIONS, (route) =>
    route.request().method() === 'POST' ? route.fulfill(FAIL_500) : route.continue(),
  );

  await goal.contributeButton.click();
  await goal.contribution.waitOpen();
  await goal.contribution.amountField.fill(String(ADDING));
  await goal.contribution.saveButton.click();

  await expect(goal.contribution.failureNotice).toHaveText(SERVER_DOWN);
  await expect(goal.contribution.amountField).toHaveValue(formatNumber(ADDING));
  // 화면에 더해진 것처럼 보이면 같은 돈을 두 번 적는다.
  await expect(goal.current).toHaveText(formatCurrency(SAVED_SO_FAR));

  await page.unroute(GOAL_CONTRIBUTIONS);
  await goal.contribution.saveButton.click();
  await goal.contribution.waitClosed();

  await expect(goal.current).toHaveText(formatCurrency(SAVED_SO_FAR + ADDING));
  await expect(goal.remaining).toHaveText(formatCurrency(TARGET - SAVED_SO_FAR - ADDING));
  // 한 번만 더해진다. 실패한 첫 번째가 뒤늦게 따라 들어오지 않는다.
  await expect(goal.logRemoveButtons).toHaveCount(1);
});

test('예산을 못 불러오면 이유와 다시 시도를 주고, 누르면 금액이 돌아온다', async ({
  manage,
  page,
  prep,
}) => {
  await prep.setBudget(BUDGET);

  await page.route(BUDGETS, (route) =>
    route.request().method() === 'GET' ? route.fulfill(FAIL_500) : route.continue(),
  );

  await manage.open();

  // 500 은 앱이 두 번 더 불러 본다(1초·2초 뒤). 그 백오프를 지나야 이 줄이 선다.
  await expect(manage.loadFailure).toBeVisible({ timeout: 15_000 });
  await expect(manage.retryButton).toBeVisible();
  /*
    빈 칸으로 두면 예산을 안 정한 것과 구분이 안 된다. 적어 둔 예산이 사라진 줄 알고
    다시 정하면, 서버에 있던 값이 그때 덮인다.
  */
  await expect(manage.total.amount).toHaveCount(0);
  await expect(manage.total.emptyTitle).toHaveCount(0);

  await page.unroute(BUDGETS);
  await manage.retryButton.click();

  await manage.waitReady();
  await expect(manage.total.amount).toHaveText(formatCurrency(BUDGET));
  await expect(manage.loadFailure).toHaveCount(0);
});
