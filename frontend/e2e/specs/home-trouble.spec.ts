import { formatCurrency } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * 홈이 잘 안 될 때 무엇을 말하는지.
 *
 * 이 단언들은 데모 녹화에만 있었다. CI 는 `specs/` 만 돌리므로, 다음 회차가 이 동작을
 * 깨뜨려도 머지가 통과했다. 녹화는 연출용으로 그대로 두고 증명은 여기로 옮긴다.
 *
 * 실패는 `page.route` 로 만든다. PrepApi 로는 조회 실패를 심을 수 없다.
 */

const BUDGETS = '**/api/v1/budgets*';
const TRANSACTIONS = '**/api/v1/transactions*';

/**
 * 422 는 다시 불러도 같은 실패라 앱이 재시도하지 않는다. 500 으로 만들면 백오프를 기다려야 한다.
 * 앱과 API 는 출처가 달라 브라우저가 응답에 CORS 헤더를 요구한다. 없으면 앱이
 * 422 가 아니라 네트워크 실패로 읽어 다른 문구가 뜬다.
 */
const FAIL_422 = {
  status: 422,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  body: JSON.stringify({ error: { code: 'INVALID_REQUEST', message: '' } }),
};

const SPENT = 12_000;
const CATEGORY = '식비';

test.use({
  consoleErrorAllowList: [
    // 일부러 만든 422 다. 브라우저가 그 응답을 콘솔에 적는 것이고 앱이 낸 오류가 아니다.
    /Failed to load resource.*422/,
  ],
});

test('예산 조회가 실패해도 기록 버튼은 남는다', async ({ page, home, prep }) => {
  await prep.addExpense({ amount: SPENT, daysAgo: 0 });

  await home.open();
  await home.waitReady();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SPENT));

  await page.route(BUDGETS, (route) =>
    route.request().method() === 'GET' ? route.fulfill(FAIL_422) : route.continue(),
  );
  await home.open();

  await expect(home.loadError).toBeVisible();
  await expect(home.hero.monthSpent).toHaveCount(0);
  // 이 앱의 목적은 기록이다. 읽기 실패가 쓰기 진입점을 지우면 앱이 통째로 멈춘 것과 같다.
  await expect(home.recordButton).toBeVisible();

  await page.unroute(BUDGETS);
  await home.retryButton.click();
  await home.waitReady();
  await expect(home.loadError).toHaveCount(0);
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SPENT));
});

test('오늘 목록만 실패하면 그 자리만 실패했다고 말한다', async ({ page, home, prep }) => {
  const categoryId = await prep.categoryIdByName(CATEGORY);
  await prep.addExpense({ amount: SPENT, daysAgo: 0, categoryId });

  await home.open();
  await home.waitReady();
  await expect(home.today.row(CATEGORY)).toBeVisible();

  await page.route(TRANSACTIONS, (route) =>
    route.request().method() === 'GET' ? route.fulfill(FAIL_422) : route.continue(),
  );
  await home.open();
  await home.waitReady();

  // 나머지 화면은 그대로다.
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SPENT));
  await expect(home.recordButton).toBeVisible();

  // 요점은 이 한 줄이다. 못 불러온 것을 '오늘은 아직 비어 있어요' 로 덮지 않는다.
  await expect(home.today.loadError).toBeVisible();
  await expect(home.today.empty).toHaveCount(0);

  await page.unroute(TRANSACTIONS);
  await home.today.retryButton.click();
  await expect(home.today.row(CATEGORY)).toBeVisible();
  await expect(home.today.loadError).toHaveCount(0);
});

test('오늘 목록이 종류와 예산 제외를 라벨로 갈라 그린다', async ({ home, prep }) => {
  const cafe = await prep.categoryIdByName('카페·간식');
  const etc = await prep.categoryIdByName('기타');

  await prep.addTransaction({ amount: 4_500, minutesAgo: 1, categoryId: cafe, merchant: '스타벅스' });
  await prep.addTransaction({ amount: 300_000, minutesAgo: 2, type: 'transfer', merchant: '카카오뱅크' });
  await prep.addTransaction({ amount: 2_000_000, minutesAgo: 3, type: 'income', merchant: '월급' });
  await prep.addTransaction({
    amount: 40_000,
    minutesAgo: 4,
    categoryId: etc,
    excludedFromBudget: true,
  });

  await home.open();
  await home.waitReady();

  // 가맹점을 알면 제목이 가맹점, 카테고리는 아래 한 줄로 내려간다.
  await expect(home.today.row('스타벅스')).toBeVisible();
  await expect(home.today.subtitle('카페·간식')).toBeVisible();

  await expect(home.today.chip('이체')).toBeVisible();
  await expect(home.today.chip('수입')).toBeVisible();
  await expect(home.today.chip('예산 제외')).toBeVisible();
});
