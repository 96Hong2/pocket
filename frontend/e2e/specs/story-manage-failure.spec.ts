import { formatCurrency, formatNumber } from '../../src/shared/lib/format';
import { E2E_API_URL } from '../support/env';
import { expect, test } from '../support/fixtures';

/**
 * 관리 탭 아래 화면들이 **서버와 말이 안 통할 때.**
 *
 * 여기 모인 화면(자산·카테고리·알림)은 읽기가 실패하면 통째로 빈다. 빈 화면과 못 받은
 * 화면은 눈으로 구별되지 않아서, 아무 말도 안 하면 "아직 안 적었나 보다" 로 읽힌다.
 * 자산은 거기서 더 나간다. 저장이 목록을 통째로 보내는 PUT 하나뿐이라, 못 받은 상태에서
 * 한 줄을 더하면 **있던 자산이 그 줄만 남기고 사라진다.**
 *
 * 그래서 이 파일이 보는 것은 셋이다. 못 받았다고 말하는가, 다시 받을 길을 주는가,
 * 그리고 못 받은 동안 **위험한 입구를 닫아 두는가.**
 */

/*
  여기 있는 테스트는 전부 우리가 일부러 500 을 내려보낸다.
  브라우저가 그 응답을 콘솔에 적는 것뿐이라 그 줄만 눈감는다.
*/
test.use({ consoleErrorAllowList: [/Failed to load resource[\s\S]*500/] });

const ASSETS = `${E2E_API_URL}/api/v1/assets`;
const CATEGORIES = `${E2E_API_URL}/api/v1/categories`;
const RULES = `${E2E_API_URL}/api/v1/merchant-rules`;
const NOTIFICATIONS = `${E2E_API_URL}/api/v1/notifications/settings`;

/** 규칙 한 줄을 지우는 주소. 뒤에 id 가 붙어 나가므로 앞부분으로 잡는다. */
const ONE_RULE = new RegExp(`^${E2E_API_URL}/api/v1/merchant-rules/`);

/**
 * 봉투가 아닌 500 에 앱이 붙이는 문구.
 *
 * 서버가 `{"error":{"code","message"}}` 를 못 주고 쓰러졌을 때 쓰는 값이고,
 * 정본은 `src/shared/api/errors.ts` 의 `HTTP_ERROR` 다.
 */
const SERVER_DOWN = '요청을 처리하지 못했어요.';

const SAVINGS = '토스뱅크';
const STOCK = '주식';
const CASH = 1_200_000;
const INVEST = 800_000;

const ETC = '기타';
const VET = '동물병원';

/** 시각을 안 고르고 켜면 서버가 넣어 주는 값. */
const DEFAULT_TIME = '21:30';
const LATE = '23:30';

test('자산을 못 불러오면 적는 입구를 모두 닫고 먼저 다시 받게 한다', async ({
  assets,
  page,
  prep,
}) => {
  await prep.putAssets([{ group: 'cash', label: SAVINGS, amount: CASH }]);

  await page.route(ASSETS, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 500, body: '{}' });
      return;
    }
    await route.continue();
  });

  await assets.open();

  await expect(assets.loadFailure).toBeVisible();
  await expect(assets.loadFailureHint).toBeVisible();
  await expect(assets.retryButton).toBeVisible();

  /*
    이 화면에서 제일 위험한 자리다. 저장이 목록을 통째로 보내는 PUT 하나라, 목록을
    못 받은 채로 한 줄을 더하면 그 한 줄짜리 목록이 정본이 되어 나머지가 지워진다.
    입구가 하나라도 열려 있으면 안 된다.
  */
  await expect(assets.addEntries).toHaveCount(0);
  await expect(assets.netWorth).toHaveCount(0);
  // 못 받은 것을 '아직 안 적었다' 로 그리면 그 빈 상태의 버튼이 곧 그 입구가 된다.
  await expect(assets.emptyTitle).toHaveCount(0);

  await page.unroute(ASSETS);
  await assets.retryButton.click();

  await assets.waitReady();
  await expect(assets.netWorth).toHaveText(formatCurrency(CASH));
  await expect(assets.row(SAVINGS)).toHaveCount(1);
});

test('자산을 저장하지 못하면 시트가 열린 채 적은 값과 이유가 남는다', async ({
  assets,
  page,
  prep,
}) => {
  await prep.putAssets([{ group: 'cash', label: SAVINGS, amount: CASH }]);

  await assets.open();
  await assets.waitReady();

  await page.route(ASSETS, async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 500, body: '{}' });
      return;
    }
    await route.continue();
  });

  await assets.addButton('투자').click();
  await assets.sheet.waitOpen();
  await assets.sheet.fill({ name: STOCK, amount: INVEST });
  await assets.sheet.saveButton.click();

  // 닫히면 실패를 그릴 자리도, 방금 적은 금액도 함께 사라져 처음부터 다시 적어야 한다.
  await expect(assets.sheet.addDialog).toBeVisible();
  await expect(assets.sheet.errorText).toHaveText(SERVER_DOWN);
  await expect(assets.sheet.nameField).toHaveValue(STOCK);
  await expect(assets.sheet.amountField).toHaveValue(formatNumber(INVEST));

  await page.unroute(ASSETS);
  await assets.sheet.save();

  await expect(assets.netWorth).toHaveText(formatCurrency(CASH + INVEST));
  await expect(assets.row(STOCK)).toHaveCount(1);
  // 막혔던 저장이 있던 줄을 건드리지 않았다. 통째로 보내는 저장이라 여기가 늘 위험하다.
  await expect(assets.row(SAVINGS)).toHaveCount(1);
});

test('카테고리를 못 불러오면 오류와 다시 시도만 두고, 풀고 누르면 목록이 찬다', async ({
  categories,
  page,
}) => {
  let blocked = true;
  await page.route(CATEGORIES, async (route) => {
    if (blocked && route.request().method() === 'GET') {
      await route.fulfill({ status: 500, body: '{}' });
      return;
    }
    await route.continue();
  });

  await categories.open();

  await expect(categories.loadFailure).toBeVisible();
  await expect(categories.loadFailureHint).toBeVisible();
  await expect(categories.retryButton).toBeVisible();
  /*
    목록을 못 받은 채로 만들기를 열면 이미 있는 이름인지 모르는 채로 적고, 저장에서야
    겹친다고 막힌다. 다 적은 뒤에 막는 것보다 먼저 다시 받는 쪽이 낫다.
  */
  await expect(categories.addButton).toHaveCount(0);
  // 못 받은 것을 '아직 만든 게 없다' 로 읽히게 두지 않는다.
  await expect(categories.emptyNotice).toHaveCount(0);

  blocked = false;
  await categories.retryButton.click();

  await categories.waitReady();
  await expect(categories.loadFailure).toHaveCount(0);
  await expect(categories.row('식비')).toHaveCount(1);
});

test('기억한 분류만 못 불러오면 그 구획에만 오류가 서고 위 목록은 멀쩡하다', async ({
  categories,
  page,
  prep,
}) => {
  const etcId = await prep.categoryIdByName(ETC);
  await prep.addMerchantRule(VET, etcId);

  let blocked = true;
  await page.route(RULES, async (route) => {
    if (blocked && route.request().method() === 'GET') {
      await route.fulfill({ status: 500, body: '{}' });
      return;
    }
    await route.continue();
  });

  await categories.open();
  await categories.waitReady();

  await expect(categories.rules.loadFailure).toBeVisible();
  await expect(categories.rules.retryButton).toBeVisible();
  /*
    한 화면에 조회 둘이 있다. 하나가 쓰러졌다고 화면 전체가 회색이 되면, 분류를 만들러
    온 사람이 상호 목록 때문에 아무것도 못 하게 된다.
  */
  await expect(categories.loadFailure).toHaveCount(0);
  await expect(categories.addButton).toBeVisible();
  await expect(categories.row('식비')).toHaveCount(1);
  // 못 받은 것을 '아직 없다' 로 읽으면 이미 걸어 둔 상호를 또 걸게 된다.
  await expect(categories.rules.emptyTitle).toHaveCount(0);

  blocked = false;
  await categories.rules.retryButton.click();

  await expect(categories.rules.row(VET)).toHaveCount(1);
  await expect(categories.rules.row(VET)).toContainText(ETC);
});

test('기억을 지우지 못하면 그 줄이 그대로 남고 이유를 적는다', async ({
  categories,
  page,
  prep,
}) => {
  const etcId = await prep.categoryIdByName(ETC);
  await prep.addMerchantRule(VET, etcId);

  await categories.open();
  await categories.waitReady();
  await expect(categories.rules.row(VET)).toHaveCount(1);

  await page.route(ONE_RULE, async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 500, body: '{}' });
      return;
    }
    await route.continue();
  });

  await categories.rules.deleteButton(VET).click();

  await expect(categories.rules.failureNotice).toHaveText(SERVER_DOWN);
  /*
    줄이 먼저 사라지면 지운 줄 알고 화면을 떠난다. 그 상호는 다음 저장에서 또 그 분류로
    붙고, 사람은 자기가 지운 것이 왜 살아 있는지 알 길이 없다.
  */
  await expect(categories.rules.row(VET)).toHaveCount(1);
  await expect(categories.rules.row(VET)).toContainText(ETC);

  await page.unroute(ONE_RULE);
  await categories.rules.deleteButton(VET).click();

  await expect(categories.rules.row(VET)).toHaveCount(0);
  await expect(categories.rules.emptyTitle).toBeVisible();
  // 지워진 뒤에도 못 지웠다는 말이 남아 있으면 무엇이 참인지 알 수 없다.
  await expect(categories.rules.failureNotice).toHaveCount(0);
});

test('알림 설정을 못 불러오면 오류 한 줄과 다시 시도를 준다', async ({ notifications, page }) => {
  let blocked = true;
  await page.route(NOTIFICATIONS, async (route) => {
    if (blocked && route.request().method() === 'GET') {
      await route.fulfill({ status: 500, body: '{}' });
      return;
    }
    await route.continue();
  });

  await notifications.open();

  // 조회는 2회 재시도 + 지수 백오프(1초·2초)를 지나서야 실패로 굳는다(QueryProvider).
  // 기본 5초로는 안내가 서기 전에 먼저 끊긴다.
  await expect(notifications.loadFailure).toBeVisible({ timeout: 15_000 });
  await expect(notifications.retryButton).toBeVisible();
  // 기본값으로 토글을 그려 두면 꺼져 있는 것을 켜져 있다고 말하게 된다.
  await expect(notifications.toggle).toHaveCount(0);
  await expect(notifications.timeInput).toHaveCount(0);

  blocked = false;
  await notifications.retryButton.click();

  await notifications.waitReady();
  await expect(notifications.loadFailure).toHaveCount(0);
  await expect(notifications.toggle).toHaveAttribute('aria-checked', 'false');
  await expect(notifications.timeInput).toBeDisabled();
});

test('알림을 켜다 저장이 막히면 토글이 꺼진 자리로 돌아오고 이유를 적는다', async ({
  notifications,
  page,
}) => {
  await notifications.open();
  await notifications.waitReady();
  await expect(notifications.toggle).toHaveAttribute('aria-checked', 'false');

  await page.route(NOTIFICATIONS, async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 500, body: '{}' });
      return;
    }
    await route.continue();
  });

  await notifications.toggle.click();

  await expect(notifications.notice).toHaveText(SERVER_DOWN);
  // 서버는 아무것도 바꾸지 않았다. 켜진 척하고 있으면 오지 않는 알림을 기다리게 된다.
  await expect(notifications.toggle).toHaveAttribute('aria-checked', 'false');
  await expect(notifications.timeInput).toBeDisabled();
  // 동의는 받았고 저장만 막혔다. 거절과 달리 다시 눌러 볼 수 있어야 한다.
  await expect(notifications.toggle).toBeEnabled();

  await page.unroute(NOTIFICATIONS);
  await notifications.turnOn();

  // 켜진 토글 아래에 못 켰다는 말이 남으면, 오는 알림을 안 온다고 읽게 된다.
  await expect(notifications.notice).toHaveCount(0);
  await expect(notifications.timeInput).toBeEnabled();
  await expect(notifications.timeInput).toHaveValue(DEFAULT_TIME);
});

test('알림 시각을 저장하지 못하면 이유를 적고, 다시 열면 원래 시각이 돌아온다', async ({
  notifications,
  page,
}) => {
  await notifications.open();
  await notifications.waitReady();
  await notifications.turnOn();
  await expect(notifications.timeInput).toHaveValue(DEFAULT_TIME);

  await page.route(NOTIFICATIONS, async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 500, body: '{}' });
      return;
    }
    await route.continue();
  });

  // 고른 값은 칸에 그대로 남는다(`setTime` 이 그것까지 확인한다). 저장만 막힌 상태다.
  await notifications.setTime(LATE);

  await expect(notifications.notice).toHaveText(SERVER_DOWN);
  // 막힌 것은 시각 하나다. 여기서 알림까지 꺼지면 한 적 없는 변화가 화면에 남는다.
  await expect(notifications.toggle).toHaveAttribute('aria-checked', 'true');

  await page.unroute(NOTIFICATIONS);
  await notifications.open();
  await notifications.waitReady();

  /*
    칸에 남아 있던 23:30 은 서버에 없다. 말해 주지 않으면 이 되돌림을 아무도 예상하지
    못한다. 위에서 이유를 적는 한 줄이 필요한 이유가 이것이다.
  */
  await expect(notifications.timeInput).toHaveValue(DEFAULT_TIME);
  await expect(notifications.toggle).toHaveAttribute('aria-checked', 'true');
});
