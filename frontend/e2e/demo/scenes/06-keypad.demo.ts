import { formatCurrency } from '../../../src/shared/lib/format';
import { expect, test } from '../support/director';

/**
 * 기록 시트 안쪽 두 가지를 찍는다.
 *
 * 09 는 금액을 만드는 규칙이다. 키가 무엇무엇 있고, 지우면 어떻게 줄고,
 * 앞자리 0 과 12자리 상한이 어떻게 걸리는지까지 실제로 눌러서 보여준다.
 * 10 은 카테고리 칩이다. 지출 아홉 개만 나오는 것, 금액이 없으면 못 누르는 것,
 * 목록을 불러오는 중과 못 불러왔을 때의 화면을 이어서 보여준다.
 */

/** 저장 없이 금액만 만드는 장면이라 숫자는 눈에 잘 들어오는 값 하나면 된다. */
const AMOUNT = 12_000;

/** 칩 장면에서 쓸 금액. 09 와 다른 값을 써서 두 영상이 헷갈리지 않게 한다. */
const CHIP_AMOUNT = 4_500;

/** 12자리를 채운 금액. 여기서 멈추고 더 눌러도 늘지 않는다. */
const MAX_AMOUNT = 100_000_000_000;

/** 지우기를 한 번씩 누를 때마다 남는 금액. */
const AFTER_BACKSPACE = [1_200, 120, 12, 1, 0] as const;

/** 키패드에 놓인 숫자 키. 순서도 화면에 보이는 그대로다. */
const NUMBER_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'] as const;

/** 기록 방법 네 가지 중 아직 안 열린 것. 이제 영수증 하나만 남았다. */
const LOCKED_TABS = ['영수증'] as const;

/** 지출 카테고리. 서버가 시드한 순서 그대로 3열로 놓인다. */
const EXPENSE_CATEGORIES = [
  '식비',
  '카페·간식',
  '교통',
  '쇼핑',
  '생활',
  '주거·고정비',
  '여가·취미',
  '건강·미용',
  '기타',
] as const;

/** 시트에 올라오지 않는 카테고리. 지출만 걸러 내는지 되짚는 데 쓴다. */
const NOT_ON_SHEET = ['수입', '이체'] as const;

const EMPTY_HINT = '금액을 누르고 카테고리를 고르면 바로 저장돼요';
const READY_HINT = '카테고리를 고르면 저장돼요';

/** 카테고리 조회 하나만 겨냥한다. 다른 요청은 그대로 서버로 간다. */
const CATEGORIES_ROUTE = '**/api/v1/categories';

test('09 키패드로 금액을 찍는 규칙', async ({ home, recordSheet, demo }) => {
  await home.open();
  await home.waitReady();
  await demo.open('키패드로 금액 찍기', '숫자 키 열한 개와 지우기 하나. 앞자리 0 은 먹지 않는다');

  await demo.step('홈에서 10초 기록을 누른다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(0));
  await expect(recordSheet.input.hint).toHaveText(EMPTY_HINT);
  await demo.beat(2);

  await demo.step('기록 방법은 네 가지. 지금 열려 있는 것은 키패드·줄글·캡처다');
  await expect(recordSheet.methodTabs).toHaveCount(4);
  await expect(recordSheet.methodTab('키패드')).toHaveAttribute('aria-checked', 'true');
  await expect(recordSheet.methodTab('줄글')).toBeEnabled();
  await expect(recordSheet.methodTab('캡처')).toBeEnabled();
  for (const label of LOCKED_TABS) {
    // 영수증은 다음 마일스톤 자리다. 눌리지 않게 막아 두고 자리만 보여준다.
    await expect(recordSheet.methodTab(label)).toBeDisabled();
  }
  await demo.beat(3);

  await demo.step('키는 1부터 9까지와 00, 0. 그리고 한 자리 지우기 하나');
  for (const key of NUMBER_KEYS) {
    await expect(recordSheet.input.numberKey(key)).toBeVisible();
  }
  await expect(recordSheet.input.backspaceKey).toBeVisible();
  // 한 번에 다 지우는 키를 두지 않았다. 그래서 아래에서 자릿수만큼 누른다.
  await expect(recordSheet.input.numberKey('C')).toHaveCount(0);
  await expect(recordSheet.input.numberKey('AC')).toHaveCount(0);
  await demo.beat(3);

  await demo.step('1 · 2 · 00 · 0 을 눌러 12,000원을 만든다');
  await expect(recordSheet.input.categoryChip('식비')).toBeDisabled();
  await recordSheet.input.enterAmount(AMOUNT);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(AMOUNT));
  await demo.beat();

  await demo.step('금액이 생기면 힌트가 바뀌고 카테고리 칩이 살아난다');
  await expect(recordSheet.input.hint).toHaveText(READY_HINT);
  await expect(recordSheet.input.categoryChip('식비')).toBeEnabled();
  await demo.beat(3);

  await demo.step('지우기를 누를 때마다 뒷자리가 하나씩 빠진다');
  for (const left of AFTER_BACKSPACE) {
    await recordSheet.input.backspaceKey.click();
    await expect(recordSheet.input.amountText).toHaveText(formatCurrency(left));
    await demo.beat();
  }

  await demo.step('0원으로 돌아오면 칩이 다시 잠긴다');
  await expect(recordSheet.input.hint).toHaveText(EMPTY_HINT);
  await expect(recordSheet.input.categoryChip('식비')).toBeDisabled();
  await demo.beat(2);

  await demo.step('0 만 눌러서는 금액이 만들어지지 않는다');
  await recordSheet.input.numberKey('0').click();
  await recordSheet.input.numberKey('0').click();
  await recordSheet.input.numberKey('00').click();
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(0));
  await expect(recordSheet.input.categoryChip('식비')).toBeDisabled();
  await demo.beat(2);

  await demo.step('1 을 먼저 누르면 그 뒤의 0 은 자릿수가 된다');
  await recordSheet.input.numberKey('1').click();
  await recordSheet.input.numberKey('00').click();
  await recordSheet.input.numberKey('0').click();
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(1_000));
  await demo.beat(2);

  await demo.step('00 을 네 번 더 눌러 자릿수를 끝까지 채운다');
  for (let more = 0; more < 4; more += 1) {
    await recordSheet.input.numberKey('00').click();
  }
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(MAX_AMOUNT));
  await demo.beat();

  await demo.step('여기서 더 눌러도 숫자가 늘지 않는다');
  await recordSheet.input.numberKey('0').click();
  await recordSheet.input.numberKey('9').click();
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(MAX_AMOUNT));
  await demo.beat(2);

  await demo.step('닫으면 아무것도 남지 않는다. 저장은 카테고리를 눌러야 일어난다');
  await recordSheet.closeButton.click();
  await recordSheet.waitClosed();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(0));
  await demo.clearStep();
  await demo.beat(2);
});

test('10 카테고리 칩과 불러오기 실패', async ({
  page,
  home,
  recordSheet,
  demo,
  consoleErrorAllowList,
}) => {
  // 아래에서 카테고리 조회를 일부러 500 으로 막는다. 그때 브라우저가 남기는 네트워크 로그다.
  // 우리 코드가 낸 오류가 아니라 이 장면이 만든 실패라 여기서만 눈감는다.
  consoleErrorAllowList.push(/Failed to load resource.*\b500\b/);

  await home.open();
  await home.waitReady();
  await demo.open(
    '카테고리 칩',
    '지출 아홉 개. 금액이 없으면 못 누르고, 못 불러오면 다시 시도한다',
  );

  await demo.step('기록 시트를 열면 지출 카테고리 아홉 개가 3열로 놓인다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  for (const name of EXPENSE_CATEGORIES) {
    await expect(recordSheet.input.categoryChip(name)).toBeVisible();
  }
  for (const name of NOT_ON_SHEET) {
    // 수입·이체도 기본 카테고리지만 기록 시트는 지출만 올린다.
    await expect(recordSheet.input.categoryChip(name)).toHaveCount(0);
  }
  await demo.beat(3);

  await demo.step('금액이 0원이면 아홉 개 전부 눌리지 않는다');
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(0));
  for (const name of EXPENSE_CATEGORIES) {
    await expect(recordSheet.input.categoryChip(name)).toBeDisabled();
  }
  await demo.beat(2);

  await demo.step('4,500원을 찍으면 아홉 개가 한꺼번에 살아난다');
  await recordSheet.input.enterAmount(CHIP_AMOUNT);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(CHIP_AMOUNT));
  for (const name of EXPENSE_CATEGORIES) {
    await expect(recordSheet.input.categoryChip(name)).toBeEnabled();
  }
  await demo.beat(3);

  await demo.step('이번에는 카테고리 응답을 붙잡아 두고 다시 연다');
  await recordSheet.closeButton.click();
  await recordSheet.waitClosed();

  // 응답을 놓아 줄 때까지 잡아 둔다. 몇 초를 기다리는 대신 시점을 이 테스트가 정한다.
  let releaseCategories: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    releaseCategories = resolve;
  });
  await page.route(CATEGORIES_ROUTE, async (route) => {
    await held;
    await route.continue();
  });

  await home.open();
  await home.waitReady();

  await demo.step('응답을 붙잡아 둔 채 기록 시트를 연다');
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await demo.step('불러오는 동안에는 칩 자리에 스피너가 돈다');
  await expect(recordSheet.input.categoriesLoading).toBeVisible();
  await expect(recordSheet.input.categoryChip('식비')).toHaveCount(0);
  await demo.beat(2);

  await demo.step('기다리는 중에도 금액은 그대로 찍힌다');
  await recordSheet.input.enterAmount(CHIP_AMOUNT);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(CHIP_AMOUNT));
  await expect(recordSheet.input.categoriesLoading).toBeVisible();
  await demo.beat(2);

  await demo.step('응답이 오면 스피너가 걷히고 칩이 채워진다');
  releaseCategories();
  await expect(recordSheet.input.categoriesLoading).toHaveCount(0);
  await expect(recordSheet.input.categoryChip('식비')).toBeEnabled();
  await demo.beat(2);
  await page.unroute(CATEGORIES_ROUTE);

  await demo.step('이번에는 카테고리 조회가 실패하게 만든다');
  await recordSheet.closeButton.click();
  await recordSheet.waitClosed();

  await page.route(CATEGORIES_ROUTE, async (route) => {
    // 프리플라이트까지 가로채면 CORS 오류가 되어 서버 오류 화면이 아니라 다른 것을 보게 된다.
    if (route.request().method() === 'OPTIONS') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 500,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: '' } }),
    });
  });

  await home.open();
  await home.waitReady();

  await demo.step('조회가 막힌 채로 기록 시트를 연다');
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await demo.step('못 불러오면 이유와 다시 시도 버튼이 칩 자리에 뜬다');
  // 서버 오류는 재시도할 만한 실패라 두 번 더 부른 뒤에야 실패로 확정된다. 그만큼 기다려 준다.
  await expect(recordSheet.input.categoriesError).toBeVisible({ timeout: 15_000 });
  await expect(recordSheet.input.categoriesRetryButton).toBeVisible();
  await expect(recordSheet.input.categoryChip('식비')).toHaveCount(0);
  await demo.beat(3);

  await demo.step('연결이 돌아온 뒤 다시 시도를 누르면 칩이 채워진다');
  await page.unroute(CATEGORIES_ROUTE);
  await recordSheet.input.categoriesRetryButton.click();
  await expect(recordSheet.input.categoriesError).toHaveCount(0);
  for (const name of EXPENSE_CATEGORIES) {
    await expect(recordSheet.input.categoryChip(name)).toBeVisible();
  }
  await demo.clearStep();
  await demo.beat(2);
});
