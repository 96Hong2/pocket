import { formatCurrency, formatNumber } from '../../../src/shared/lib/format';
import { expect, test } from '../support/director';

/**
 * 홈이 잘 안 될 때 무엇을 말하는지 찍는다.
 *
 * 06 은 통째로 못 불러온 경우다. 스피너에서 오류 화면으로, 다시 시도로 돌아오는 데까지 잇는다.
 * 07 은 일부만 실패한 경우다. 오늘 목록과 예산 저장이 각각 실패해도 나머지 화면은 그대로 남고,
 * 실패한 자리만 실패했다고 말한다. 실패를 '비어 있어요' 로 덮지 않는 것이 요점이다.
 * 실패는 전부 page.route 로 만든다. PrepApi 로는 조회 실패를 심을 수 없다.
 */

/** 홈이 여는 조회 두 갈래. 겨냥할 요청만 정확히 집는다. */
const BUDGETS = '**/api/v1/budgets*';
const TRANSACTIONS = '**/api/v1/transactions*';

/**
 * 실패 응답 한 벌.
 *
 * 422 는 다시 불러도 결과가 같은 실패라 앱이 재시도하지 않는다. 그래서 오류 화면이 바로 뜬다.
 * 500 으로 만들면 2초·4초 백오프가 지난 뒤에야 떠 영상이 6초 동안 스피너만 찍는다.
 * 앱과 API 는 출처가 달라 브라우저가 응답에 Access-Control-Allow-Origin 을 요구한다.
 * 이 헤더가 없으면 앱이 422 가 아니라 네트워크 실패로 읽어 다른 문구가 뜬다.
 */
const FAIL_422 = {
  status: 422,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
  },
  body: JSON.stringify({ error: { code: 'INVALID_REQUEST', message: '' } }),
};

/**
 * 예산 조회를 늦추는 시간.
 *
 * 스피너가 영상에 남을 만큼은 붙잡아야 하고, 그보다 길면 빈 화면이 흐르는 것과 다르지 않다.
 */
const SLOW_MS = 2_500;

/** code 가 INVALID_REQUEST 일 때 앱이 고르는 문구. 서버가 보낸 message 보다 이쪽이 이긴다. */
const SAVE_FAILED_TEXT = '입력한 내용을 다시 확인해 주세요.';

const SPENT = 12_000;
const BUDGET = 300_000;
const CATEGORY = '식비';

test.use({
  consoleErrorAllowList: [
    // 이 파일은 실패 화면을 찍으려고 일부러 422 를 만든다.
    // 브라우저가 그 응답을 콘솔에 적는 것이고 앱이 낸 오류가 아니다.
    /Failed to load resource.*422/,
  ],
});

test('06 불러오는 중과 못 불러온 홈, 그리고 다시 시도', async ({ page, demo, home, prep }) => {
  await prep.addExpense({ amount: SPENT, daysAgo: 0 });

  await home.open();
  await demo.open('잘 안 될 때 홈이 하는 말', '불러오는 중, 못 불러왔을 때, 다시 시도까지');
  await home.waitReady();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SPENT));
  await demo.beat();

  await demo.step('예산 조회를 4초 늦춰 두고 홈을 다시 연다');
  await page.route(BUDGETS, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, SLOW_MS);
    });
    await route.continue();
  });
  await home.open();

  await demo.step('불러오는 동안에는 스피너만 돈다');
  await expect(home.loadingState).toBeVisible();
  await expect(home.recordButton).toHaveCount(0);
  await demo.beat(2);

  // 늦어도 오기만 하면 원래 화면이 돌아온다. 여기까지는 실패가 아니다.
  await home.waitReady();
  await page.unroute(BUDGETS);
  await demo.beat();

  await demo.step('이번에는 예산 조회를 실패시킨다');
  await page.route(BUDGETS, (route) =>
    route.request().method() === 'GET' ? route.fulfill(FAIL_422) : route.continue(),
  );
  await home.open();

  await demo.step('본문이 통째로 사라지고 이유와 다시 시도만 남는다');
  await expect(home.loadError).toBeVisible();
  await expect(home.retryButton).toBeVisible();
  // 숫자를 0 으로 그려 놓고 아무 일 없는 척하지 않는다. 히어로와 버튼이 아예 없다.
  await expect(home.hero.monthSpent).toHaveCount(0);
  await expect(home.recordButton).toHaveCount(0);
  await demo.clearStep();
  await demo.beat(3);

  await demo.step('연결이 돌아온 뒤 다시 시도를 누른다');
  await page.unroute(BUDGETS);
  await home.retryButton.click();

  await home.waitReady();
  await expect(home.loadError).toHaveCount(0);
  // 새로고침 없이 원래 숫자가 그대로 돌아온다.
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SPENT));
  await demo.clearStep();
  await demo.beat(3);
});

test('07 일부만 실패하면 그 자리만 실패했다고 말한다', async ({ page, demo, home, prep }) => {
  const categoryId = await prep.categoryIdByName(CATEGORY);
  await prep.addExpense({ amount: SPENT, daysAgo: 0, categoryId });

  await home.open();
  await demo.open('일부만 안 될 때', '못 불러온 자리만 그렇게 말하고 나머지는 그대로 둔다');
  await home.waitReady();
  await expect(home.today.row(CATEGORY)).toBeVisible();
  await demo.beat();

  await demo.step('오늘 목록 조회만 실패하게 만들고 홈을 다시 연다');
  await page.route(TRANSACTIONS, (route) =>
    route.request().method() === 'GET' ? route.fulfill(FAIL_422) : route.continue(),
  );
  await home.open();
  await home.waitReady();

  await demo.step('히어로와 기록 버튼은 그대로다');
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SPENT));
  await expect(home.recordButton).toBeVisible();
  await demo.beat();

  await demo.step('오늘 카드만 못 불러왔다고 말한다');
  // 이 카드는 하단 탭바에 가려지는 자리에 있다. 올려놓지 않으면 다시 시도 버튼이 영상에서 잘린다.
  await home.today.reveal();
  await expect(home.today.loadError).toBeInViewport();
  await expect(home.today.loadHint).toBeVisible();
  await expect(home.today.retryButton).toBeInViewport();
  // 이 한 줄이 이 장면의 요점이다. 못 불러온 것을 '오늘은 아직 비어 있어요' 로 덮지 않는다.
  await expect(home.today.empty).toHaveCount(0);
  await demo.clearStep();
  await demo.beat(3);

  await demo.step('이번에는 예산 저장만 실패하게 만든다');
  // 예산 카드는 화면 위쪽이다. 목록을 보려고 내려온 것을 되돌린다.
  await home.scrollToTop();
  await page.route(BUDGETS, (route) =>
    route.request().method() === 'PUT' ? route.fulfill(FAIL_422) : route.continue(),
  );

  await demo.step(`이번 달 예산으로 ${formatCurrency(BUDGET)}을 넣는다`);
  await home.budget.input.fill(String(BUDGET));
  await expect(home.budget.input).toHaveValue(formatNumber(BUDGET));

  await demo.step('예산 정하기를 누른다');
  await home.budget.saveButton.click();

  await demo.step('카드 안에 안 된 이유가 한 줄로 붙는다');
  await expect(home.budget.saveNotice).toHaveText(SAVE_FAILED_TEXT);
  // 넣은 값이 지워지지 않고 카드도 그 자리에 남는다. 다시 누르기만 하면 된다.
  await expect(home.budget.input).toHaveValue(formatNumber(BUDGET));
  await expect(home.budget.saveButton).toBeVisible();
  await expect(home.hero.remainingBudget).toHaveCount(0);
  await demo.clearStep();
  await demo.beat(3);
});
