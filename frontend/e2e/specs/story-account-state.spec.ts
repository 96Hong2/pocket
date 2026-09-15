import { ROUTES } from '../../src/app/router/routes';
import type { MeOut } from '../../src/shared/api/types';
import { formatCurrency } from '../../src/shared/lib/format';
import { logsNamed, watchAppClose } from '../support/aitMock';
import { E2E_API_URL } from '../support/env';
import { expect, test } from '../support/fixtures';

/**
 * 「내 계정」 이 아직 준비가 안 됐거나 실패했을 때.
 *
 * **출시 시점에 실사용자가 보는 것은 「준비 중」 쪽이다.** 서버에 메일 보낼 수단(SMTP)이
 * 붙어 있어야 이메일 연결이 열리는데, e2e 백엔드는 `local` 이라 그 값이 늘 참이다.
 * 그래서 다른 spec 은 전부 잘 되는 갈래만 밟고, 정작 먼저 나갈 화면은 한 번도 안 밟힌다.
 * 그 갈래를 응답을 갈아 끼워 여기서 본다.
 *
 * 실패도 같이 둔다. 계정 조회·코드 보내기·전부 지우기가 막혔을 때 **화면이 무엇을 말하고
 * 무엇을 다시 할 수 있게 두는지** 가 이 화면의 값어치다. 실패를 조용히 삼키면 사용자는
 * 눌리지 않는 버튼 앞에서 앱이 고장 난 줄 안다.
 *
 * 실패는 `page.route` 로 그 요청만 막고, 끝나면 풀어 회복까지 본다.
 */

const ME = `${E2E_API_URL}/api/v1/account/me`;
const EMAIL_START = `${E2E_API_URL}/api/v1/account/email/start`;
const RESET = `${E2E_API_URL}/api/v1/account/reset`;

/**
 * 앱과 API 는 출처가 달라 브라우저가 응답에 CORS 헤더를 요구한다.
 * 없으면 앱이 상태 코드를 못 보고 네트워크 실패로 읽어 다른 문구가 뜬다.
 */
const JSON_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
};

/** 서버가 처리하지 못한 오류에 주는 봉투 그대로다(`backend/app/api/errors.py`). */
const INTERNAL_ERROR = {
  status: 500,
  headers: JSON_HEADERS,
  body: JSON.stringify({
    error: { code: 'INTERNAL_ERROR', message: '잠시 후 다시 시도해 주세요.' },
  }),
};

/**
 * 메일 보낼 수단이 없는 서버가 코드 보내기에 주는 봉투 그대로다
 * (`backend/app/modules/account/login.py`). 코드를 만들어 두고 못 보내면
 * 사람이 오지 않을 메일함만 들여다보게 되므로 서버가 아예 막는다.
 */
const EMAIL_LOGIN_UNAVAILABLE = {
  status: 503,
  headers: JSON_HEADERS,
  body: JSON.stringify({
    error: {
      code: 'EMAIL_LOGIN_UNAVAILABLE',
      message: '지금은 이메일 연결을 쓸 수 없어요. 잠시 뒤에 다시 해 주세요.',
    },
  }),
};

/**
 * 계정 조회에서 **이메일 연결 가능 여부만** 뒤집는다.
 *
 * 나머지 값은 서버가 준 것을 그대로 쓴다. 응답을 통째로 지어내면 화면이 실제와 다른
 * 모양을 보게 되고, 서버가 필드를 늘려도 여기서 조용히 어긋난다.
 */
async function serveWithoutEmailLogin(page: import('@playwright/test').Page): Promise<void> {
  await page.route(ME, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const me = (await response.json()) as MeOut;
    await route.fulfill({ response, json: { ...me, email_login_available: false } });
  });
}

/** 이 기기에서 앱을 몇 번 열었는지 심는다. 목 SDK 의 저장소는 접두사 붙은 localStorage 다. */
async function seedOpens(page: import('@playwright/test').Page, count: number): Promise<void> {
  const day = 24 * 60 * 60 * 1000;
  await page.addInitScript(
    ([opens, ms]) => {
      try {
        const now = Date.now();
        window.localStorage.setItem(
          '__ait_storage:visit-log',
          JSON.stringify({ first: now - 7 * ms, last: now - ms, count: opens }),
        );
      } catch {
        /* 저장소를 못 여는 문서에서는 이 앱이 돌지 않는다. */
      }
    },
    [count, day] as const,
  );
}

test.describe('메일을 보낼 수단이 없는 서버', () => {
  test('버튼 대신 「준비 중」 한 줄이 서고, 수단이 붙으면 버튼이 돌아온다', async ({
    account,
    page,
  }) => {
    await serveWithoutEmailLogin(page);

    await account.open();
    await account.waitReady();

    // 제목과 「안 해도 된다」 는 그대로다. 없어지는 것은 누를 자리뿐이다.
    await expect(account.notLinkedTitle).toBeVisible();
    await expect(account.optionalNote).toBeVisible();

    // 눌러 보고 503 으로 막히면 고장으로 읽힌다. 누르기 전에 먼저 말한다.
    await expect(account.preparingNote).toBeVisible();
    await expect(account.linkButton).toHaveCount(0);
    // 열 입구가 없으니 시트도 떠 있지 않다.
    await expect(account.anyDialog).toHaveCount(0);

    await page.unroute(ME);
    await account.open();
    await account.waitReady();

    // 수단이 붙는 날 화면은 저절로 열려야 한다. 배포로 바꿔 끼우는 자리가 아니다.
    await expect(account.linkButton).toBeVisible();
    await expect(account.preparingNote).toHaveCount(0);
  });

  test('관리 탭의 「기록을 지켜 두세요」 줄도 함께 사라진다', async ({ manage, page }) => {
    // 세 번 넘게 연 사람에게만 뜨는 줄이다. 그 조건부터 맞춰 두고 본다.
    // (홈에는 이 줄이 아예 없다. 홈은 적는 자리다.)
    await seedOpens(page, 5);

    await manage.open();
    await manage.waitReady();
    await expect(manage.keepDataNote).toBeVisible();
    await expect(manage.keepDataLink).toBeVisible();

    await serveWithoutEmailLogin(page);
    await manage.open();
    await manage.waitReady();

    // 눌러도 「준비 중」 인 화면으로 보내는 셈이다. 그럴 바엔 말을 꺼내지 않는다.
    await expect(manage.keepDataNote).toHaveCount(0);
    await expect(manage.keepDataLink).toHaveCount(0);
  });
});

test.describe('계정을 못 불러올 때', () => {
  test.use({
    // 우리가 일부러 500 을 내려보낸다. 브라우저가 그 응답을 콘솔에 적는 것뿐이다.
    consoleErrorAllowList: [/Failed to load resource[\s\S]*500/],
  });

  test('카드 자리에서 못 불러왔다고 말하고, 다시 시도로 카드가 돌아온다', async ({
    account,
    page,
  }) => {
    await page.route(ME, (route) =>
      route.request().method() === 'GET' ? route.fulfill(INTERNAL_ERROR) : route.continue(),
    );

    await account.open();

    // 500 은 앱이 두 번 더 불러 본다(백오프 1초·2초). 그때까지는 아직 불러오는 중이다.
    await expect(account.loadFailure).toBeVisible({ timeout: 15_000 });
    await expect(account.retryButton).toBeVisible();

    /*
      붙었는지 아닌지 모르는 상태다. 여기서 「이메일로 지켜 두기」 를 세우면,
      이미 붙여 둔 사람에게 안 붙었다고 말하는 화면이 된다.
    */
    await expect(account.notLinkedTitle).toHaveCount(0);
    await expect(account.linkButton).toHaveCount(0);
    await expect(account.linkedTitle).toHaveCount(0);

    await page.unroute(ME);
    await account.retryButton.click();

    await account.waitReady();
    await expect(account.notLinkedTitle).toBeVisible();
    await expect(account.linkButton).toBeVisible();
    await expect(account.loadFailure).toHaveCount(0);
  });
});

test.describe('코드를 못 보낼 때', () => {
  test.use({
    // 우리가 일부러 503 을 내려보낸다. 브라우저가 그 응답을 콘솔에 적는 것뿐이다.
    consoleErrorAllowList: [/Failed to load resource[\s\S]*503/],
  });

  test('시트 안에서 이유를 말하고, 버튼이 다시 눌린다', async ({ account, page, prep }) => {
    const address = `e2e-send-fail-${Date.now()}@example.com`;

    await page.route(EMAIL_START, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(EMAIL_LOGIN_UNAVAILABLE)
        : route.continue(),
    );

    await account.open();
    await account.waitReady();
    await account.linkButton.click();
    await expect(account.linkSheet).toBeVisible();
    await account.emailField.fill(address);
    await account.sendButton.click();

    // 서버가 말한 이유를 그대로 옮긴다. 「잠시 뒤 다시」 로 뭉개면 무엇이 막혔는지 모른다.
    await expect(account.linkNotice).toHaveText(
      '지금은 이메일 연결을 쓸 수 없어요. 잠시 뒤에 다시 해 주세요.',
    );
    // 코드 칸으로 넘어가면 오지 않을 메일을 기다리게 된다.
    await expect(account.codeField).toHaveCount(0);
    // 적어 둔 주소는 그대로 두고 버튼만 다시 눌리는 상태로 돌아온다.
    await expect(account.emailField).toHaveValue(address);
    await expect(account.sendButton).toBeEnabled();
    // 시트도 그대로다. 닫혀 버리면 방금 적은 것을 처음부터 다시 적는다.
    await expect(account.linkSheet).toBeVisible();

    await page.unroute(EMAIL_START);
    await account.sendButton.click();

    await expect(account.codeField).toBeVisible();
    // 지나간 실패를 코드 단계까지 들고 가지 않는다.
    await expect(account.linkNotice).toHaveCount(0);

    await account.submitCode(await prep.peekLoginCode(address));
    await expect(account.linkedTitle).toBeVisible();
    await expect(account.email(address)).toBeVisible();

    /*
      실패도 성공과 같은 이름으로 남아야 어디서 끊기는지 센다.
      판마다 같은 일을 두 번 적기도 해서 줄 수가 아니라 값만 본다.
    */
    const results = (await logsNamed(page, 'account_link_result')).map((log) => log.params.result);
    expect([...new Set(results)].sort()).toEqual(['linked', 'send_failed', 'sent']);
    // 주소는 어느 로그에도 실리지 않는다.
    expect(JSON.stringify(results)).not.toContain(address);
  });
});

test('메일이 안 왔으면 코드 단계에서 주소 단계로 돌아온다', async ({ account, prep }) => {
  const address = `e2e-resend-${Date.now()}@example.com`;

  await account.open();
  await account.waitReady();
  await account.requestCode(address);

  // 어디로 보냈는지 적혀 있어야 오타를 알아챈다.
  await expect(account.sentTo(address)).toBeVisible();
  // 다시 보내기 전에 스팸함부터 보게 한다. 안 왔다는 신고의 첫 번째 원인이다.
  await expect(account.spamHint).toBeVisible();

  await account.resendButton.click();

  // 처음으로 돌아가지 않는다. 적어 둔 주소가 그대로 있어야 한 번 더 적지 않는다.
  await expect(account.emailField).toHaveValue(address);
  await expect(account.codeField).toHaveCount(0);
  await expect(account.sendButton).toBeEnabled();

  await account.sendButton.click();
  await expect(account.codeField).toBeVisible();

  // 새로 받은 코드로 끝까지 간다. 앞 코드는 서버가 죽였으므로 마지막 것을 읽는다.
  await account.submitCode(await prep.peekLoginCode(address));
  await expect(account.linkedTitle).toBeVisible();
  await expect(account.email(address)).toBeVisible();
});

test.describe('지우기가 실패할 때', () => {
  test.use({
    // 우리가 일부러 500 을 내려보낸다. 브라우저가 그 응답을 콘솔에 적는 것뿐이다.
    consoleErrorAllowList: [/Failed to load resource[\s\S]*500/],
  });

  test('시트가 남아 이유를 말하고, 기록도 그대로 있다', async ({
    appShell,
    home,
    page,
    prep,
    settings,
  }) => {
    const spent = 12_000;
    await prep.addTransaction({ amount: spent, merchant: '김밥천국' });

    await page.route(RESET, (route) =>
      route.request().method() === 'POST' ? route.fulfill(INTERNAL_ERROR) : route.continue(),
    );

    await settings.open();
    await settings.waitReady();
    await settings.dataReset.openButton.click();
    await settings.dataReset.agree.check();
    await settings.dataReset.confirmButton.click();

    // 시트가 닫히면 지워진 것으로 읽는다. 실패는 누른 그 자리에서 말해야 한다.
    await expect(settings.dataReset.sheet).toBeVisible();
    await expect(settings.dataReset.notice).toHaveText('잠시 후 다시 시도해 주세요.');
    // 「지우는 중이에요」 에서 멈추면 다시 누를 수 없다.
    await expect(settings.dataReset.confirmButton).toBeEnabled();

    const results = (await logsNamed(page, 'data_reset_result')).map((log) => log.params.result);
    expect([...new Set(results)]).toEqual(['failed']);

    // 지워지지 않았다. 지워진 척하면 사람은 없어진 줄 알고 처음부터 다시 적는다.
    await home.open();
    await home.waitReady();
    await expect(home.today.amount(formatCurrency(spent))).toBeVisible();

    await page.unroute(RESET);
    await settings.open();
    await settings.waitReady();
    await settings.dataReset.run();

    // 지운 사람은 처음 쓰는 사람과 같은 자리에 선다. 앱이 스스로 홈부터 다시 연다.
    await expect.poll(() => appShell.pathname, { timeout: 15_000 }).toBe(ROUTES.home);
  });
});

test('이메일 시트를 시스템 뒤로가기로 닫으면 미니앱이 아니라 시트만 닫힌다', async ({
  account,
  appShell,
  page,
}) => {
  const closed = watchAppClose(page);

  await account.open();
  await account.waitReady();
  await account.linkButton.click();
  await expect(account.linkSheet).toBeVisible();

  await appShell.pressBack();

  // 시트가 뒤로가기를 삼킨다. 놓으면 미니앱이 통째로 닫혀 적던 주소가 사라진다.
  await expect(account.linkSheet).toHaveCount(0);
  await expect(account.notLinkedTitle).toBeVisible();
  expect(closed(), '시트를 닫는 뒤로가기가 미니앱을 닫았다').toBe(false);
  expect(appShell.pathname, '시트만 닫혀야 하는데 화면이 바뀌었다').toBe(ROUTES.account);

  // 삼키는 것은 한 번뿐이다. 그다음은 들어온 자리인 앱 설정으로 나간다.
  await appShell.pressBack();
  await expect.poll(() => appShell.pathname).toBe(ROUTES.settings);
  expect(closed(), '하위 화면에서 뒤로가기가 미니앱을 닫았다').toBe(false);
});
