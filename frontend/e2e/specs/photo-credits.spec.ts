import type { Page } from '@playwright/test';

import { logsNamed } from '../support/aitMock';
import { CAPTURE_DATA_URI, seedMockImages } from '../support/deviceMock';
import { expect, test } from '../support/fixtures';
import type { HomeScreen } from '../screens/HomeScreen';
import type { RecordSheet } from '../screens/RecordSheet';

/**
 * 사진을 읽는 동안 도는 광고.
 *
 * 사진 한 장은 우리가 돈을 내고 읽는다. 키패드로 적는 길은 공짜라 **값이 드는 유일한
 * 행동**이다. 2026-09-25 에 규칙을 이렇게 바꿨다.
 *
 * | 무엇 | 광고 |
 * | --- | --- |
 * | 이 앱에서 읽는 **첫 한 장** | 없다 |
 * | 그다음부터 (한 장씩) | 읽는 동안 전면 광고 한 편 |
 * | 한 번에 여러 장 | 읽는 동안 리워드 광고 한 편 |
 *
 * 그전에는 「하루 첫 한 장」 이 무료였다. 한 사람이 하루에 넣는 사진이 0.4~0.7장이라
 * 대부분의 날이 무료분 안에서 끝났고, 세션 상한까지 겹쳐 광고가 거의 안 떴다.
 *
 * 여기서 재는 것은 넷이다. **막지 않는지**(예전에는 다 쓰면 막았다), **광고 전에 반드시
 * 묻는지**(콘솔 반려 사유였다), **광고가 기다림을 새로 만들지 않는지**(읽기 요청이
 * 광고보다 먼저 나간다), 그리고 **둘째 장부터 실제로 광고가 도는지**(상한 밖이라야 한다).
 */

/**
 * 읽은 결과에서 「예시 결과」 표시를 떼어 낸다.
 *
 * e2e 백엔드는 스텁이라 늘 `stub_image` 가 붙어 오고, 화면은 그 표시가 붙은 결과에는
 * **체험을 안 쓴다**(지어낸 결과의 값을 사람에게 물리지 않는다). 그래서 이 한 겹이 없으면
 * 체험을 쓰는 길을 아무 검사도 못 지난다. 바꾸는 것은 그 표시 하나뿐이고 나머지는 서버가 준 그대로다.
 */
async function answerAsRealModel(page: Page): Promise<void> {
  await page.route('**/api/v1/imports/capture', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.meta.notes = (body.meta?.notes ?? []).filter((note: string) => note !== 'stub_image');
    await route.fulfill({ response, json: body });
  });
}

/** 체험 한 장을 이미 쓴 사람으로 연다. 목 SDK 저장소는 접두사를 붙인 localStorage 다. */
async function seedTrialUsed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('__ait_storage:photo-trial', 'used');
    } catch {
      /* 저장소를 못 여는 문서에서는 이 앱이 돌지 않는다. */
    }
  });
}

/**
 * 하루 한 장 시절의 칸만 남은 사람으로 연다.
 *
 * **여기가 돈이 걸린 자리다.** 옛 칸을 안 보면 쓰던 사람 전부가 새 칸 기준으로 처음 쓰는
 * 사람이 되어, 우리가 원가를 내고 한 장씩 더 읽어 준다.
 */
async function seedLegacyCredits(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('__ait_storage:photo-credits', '2026-09-24:0');
    } catch {
      /* 저장소를 못 여는 문서에서는 이 앱이 돌지 않는다. */
    }
  });
}

/** 기록 시트의 캡처 탭까지 간다. 사진을 고르기 직전 상태다. */
async function openCaptureTab(home: HomeScreen, recordSheet: RecordSheet): Promise<void> {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('캡처').click();
}

test('처음 써 보는 사람의 첫 한 장은 아무 말도 안 한다. 10초 안에 적으러 온 사람 앞이다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await openCaptureTab(home, recordSheet);

  // 「무료」 도 「광고」 도 꺼내지 않는다. 광고라는 개념을 먼저 세울 이유가 없다.
  await expect(recordSheet.capture.creditLine).toBeHidden();
  await expect(recordSheet.capture.pickButton).toBeVisible();

  await recordSheet.capture.pickButton.click();
  // 확인 창도 안 선다. 광고가 없으니 물을 것도 없다.
  await expect(recordSheet.capture.adConsent).toBeHidden();
  await expect(recordSheet.capture.rows).toHaveCount(6);
});

test('체험 한 장을 쓰고 나면 광고가 온다는 것을 버튼 아래 한 줄로 미리 적는다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedTrialUsed(page);
  await openCaptureTab(home, recordSheet);

  await expect(recordSheet.capture.creditLine).toBeVisible();
  // 막지 않는다. 버튼은 그대로 있고 아래 한 줄만 는다.
  await expect(recordSheet.capture.pickButton).toBeVisible();
});

test('체험을 쓴 뒤에는 누를 때마다 광고를 묻고, 읽는 동안이라고 말한다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedTrialUsed(page);
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await openCaptureTab(home, recordSheet);

  await recordSheet.capture.pickButton.click();

  // 콘솔 반려 사유가 「예상하기 어려운 시점에 광고가 노출돼요」 였다. 누른 뒤 광고 앞에서 묻는다.
  await expect(recordSheet.capture.adConsent).toBeVisible();
  // 「광고를 보면 읽어 드려요」 가 아니라 「읽는 데 걸려요, 그동안 광고가 나와요」 다.
  await expect(recordSheet.capture.adConsent).toContainText('읽는 데');
  await expect(recordSheet.capture.adConsent).toContainText('그동안 광고가 한 번 나와요');
  // 초를 적지 않는다. 실제 기다림은 읽기와 광고 중 긴 쪽이라 지킬 수 없는 약속이 된다.
  await expect(recordSheet.capture.adConsent).not.toContainText(/\d+초/);
  await expect(recordSheet.capture.adConsentConfirm).toBeVisible();
});

test('하루 한 장 시절에 사진을 읽어 본 사람은 체험을 새로 안 받는다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedLegacyCredits(page);
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await openCaptureTab(home, recordSheet);

  // 옛 칸만 보고도 「이미 써 본 사람」 으로 읽어야 한다. 안 그러면 쓰던 사람 전부가 공짜 한 장이다.
  await expect(recordSheet.capture.creditLine).toBeVisible();
  await recordSheet.capture.pickButton.click();
  await expect(recordSheet.capture.adConsent).toBeVisible();
});

test('확인 창에서 닫으면 읽지도 않고 광고도 안 뜬다', async ({ home, page, recordSheet }) => {
  await seedTrialUsed(page);
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await openCaptureTab(home, recordSheet);

  await recordSheet.capture.pickButton.click();
  await recordSheet.capture.adConsentCancel.click();

  await expect(recordSheet.capture.adConsent).toBeHidden();
  await expect(recordSheet.capture.pickButton).toBeVisible();
  await expect(recordSheet.capture.rows).toHaveCount(0);

  // 마다한 사람이 안 보이면 이 자리가 맞는지 알 수 없다.
  const logs = await logsNamed(page, 'photo_credit');
  expect(logs.map((log) => [log.params.action, log.params.plan])).toEqual([
    ['declined', 'interstitial'],
  ]);
});

test('광고는 읽기를 기다리게 하지 않는다. 요청이 먼저 나간다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedTrialUsed(page);
  await seedMockImages(CAPTURE_DATA_URI)(page);

  /*
    읽기 요청이 언제 나갔는지 적어 둔다. 광고가 끝난 뒤에 보내면 사람이 광고 시간과
    읽는 시간을 **더해서** 기다린다. 광고는 이미 있는 기다림을 채우는 것이지 새
    기다림을 만드는 것이 아니다.
  */
  const sentAt: number[] = [];
  await page.route('**/api/v1/imports/capture', async (route) => {
    sentAt.push(Date.now());
    await route.continue();
  });

  await openCaptureTab(home, recordSheet);
  await recordSheet.capture.pickButton.click();
  const confirmedAt = Date.now();
  await recordSheet.capture.adConsentConfirm.click();
  await expect(recordSheet.capture.rows).toHaveCount(6);

  expect(sentAt).toHaveLength(1);
  // 목 광고가 닫히는 데 걸리는 시간보다 훨씬 앞이어야 한다.
  expect(sentAt[0] - confirmedAt).toBeLessThan(2_000);
});

test('사진을 읽어 내면 체험이 끝난다. 고르기 전에는 안 끝난다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await answerAsRealModel(page);
  await openCaptureTab(home, recordSheet);

  await recordSheet.capture.pick();
  await expect(recordSheet.capture.rows).toHaveCount(6);

  const logs = await logsNamed(page, 'photo_credit');
  expect(logs.map((log) => log.params.action)).toEqual(['spent']);
});

/**
 * 이 판의 핵심이다.
 *
 * 예전에는 세션 상한(`SESSION_CAP` 한 편)이 사진 자리까지 눌렀다. 그래서 둘째 장에
 * 광고를 붙여도 앱을 한 번 연 동안에는 한 편밖에 안 떴고, 관리 탭에서 이미 한 편 본
 * 사람에게는 아예 안 떴다. 지금은 상한 밖이라 **누를 때마다 뜬다.**
 */
test('한 번 열어 둔 동안 둘째 장, 셋째 장에도 광고가 그대로 돈다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedTrialUsed(page);
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await answerAsRealModel(page);
  await openCaptureTab(home, recordSheet);

  // 첫 번째
  await recordSheet.capture.pickButton.click();
  await expect(recordSheet.capture.adConsent).toBeVisible();
  await recordSheet.capture.adConsentConfirm.click();
  await expect(recordSheet.capture.rows).toHaveCount(6);

  // 같은 세션에서 다시. 상한에 묶여 있었다면 여기서 확인 창이 안 떴다.
  await recordSheet.capture.cancelButton.click();
  await recordSheet.waitClosed();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('캡처').click();
  await recordSheet.capture.pickButton.click();
  await expect(recordSheet.capture.adConsent).toBeVisible();
  await recordSheet.capture.adConsentConfirm.click();
  await expect(recordSheet.capture.rows).toHaveCount(6);

  // 두 번 다 실제로 광고를 지나왔다. `capped` 로 미끄러진 것이 아니다.
  const watched = (await logsNamed(page, 'photo_credit')).filter(
    (log) => log.params.action === 'watched',
  );
  expect(watched.map((log) => [log.params.plan, log.params.ad])).toEqual([
    ['interstitial', 'watched'],
    ['interstitial', 'watched'],
  ]);
});

test('사진 광고는 관리 탭 상한을 갉아먹지 않는다. 스스로 누른 자리다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedTrialUsed(page);
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await answerAsRealModel(page);
  await openCaptureTab(home, recordSheet);

  await recordSheet.capture.pickButton.click();
  await recordSheet.capture.adConsentConfirm.click();
  await expect(recordSheet.capture.rows).toHaveCount(6);

  // 사진 쪽 로그는 자리 이름으로 남되, 세는 칸(하루 상한)에는 안 적힌다.
  const day = await page.evaluate(() =>
    window.localStorage.getItem('__ait_storage:ad-fullscreen-day'),
  );
  expect(day).toBeNull();
});

test('지어낸 결과에는 체험을 안 쓴다. 우리가 못 읽은 값을 물리지 않는다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);
  // 이번에는 표시를 떼지 않는다. e2e 백엔드가 주는 그대로 「예시 결과」 다.
  await openCaptureTab(home, recordSheet);

  await recordSheet.capture.pick();
  await expect(recordSheet.capture.rows).toHaveCount(6);
  await expect(recordSheet.capture.stubNotice).toBeVisible();

  expect(await logsNamed(page, 'photo_credit')).toEqual([]);
});

test('두 탭이 같은 체험을 나눠 쓴다. 탭마다 세면 공짜가 두 장이 된다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await answerAsRealModel(page);
  await openCaptureTab(home, recordSheet);

  await recordSheet.capture.pick();
  await expect(recordSheet.capture.rows).toHaveCount(6);

  await recordSheet.methodTab('영수증').click();
  await expect(recordSheet.receipt.creditLine).toBeVisible();
});

test('여러 장을 고르면 한 묶음으로 읽고 긴 광고를 판다', async ({ home, page, recordSheet }) => {
  // 목 앨범에 세 장을 심는다. 한 장만 심으면 여러 장 고르기를 잴 수 없다.
  await seedMockImages(CAPTURE_DATA_URI, 3)(page);
  await answerAsRealModel(page);

  const bodies: unknown[] = [];
  await page.route('**/api/v1/imports/capture', async (route) => {
    bodies.push(route.request().postDataJSON());
    // `continue()` 면 그물로 바로 나가서 위에 건 `answerAsRealModel` 을 건너뛴다.
    // `fallback()` 이라야 먼저 건 핸들러로 넘어간다.
    await route.fallback();
  });

  await openCaptureTab(home, recordSheet);
  await recordSheet.capture.pickButton.click();

  // 장수를 말해 준다. 「몇 장을 읽는 데 얼마나」 가 맞아야 예고가 예고다.
  await expect(recordSheet.capture.adConsent).toContainText('사진 3장 읽기');
  await expect(recordSheet.capture.adConsent).toContainText('읽는 데 시간이 조금 걸려요');
  await recordSheet.capture.adConsentConfirm.click();
  // 스텁이 사진 한 장에 여섯 건을 낸다. 세 장이 **한 화면에** 열여덟 줄로 모인 것이
  // 곧 배치가 하나라는 뜻이다. 세 번 불렀으면 여섯 줄짜리 화면을 세 번 지나야 한다.
  await expect(recordSheet.capture.rows).toHaveCount(18);

  // 세 번이 아니라 한 번이다. 세 번이면 검토 화면을 세 번 지나야 한다.
  expect(bodies).toHaveLength(1);
  expect((bodies[0] as { images?: string[] }).images).toHaveLength(3);

  const logs = await logsNamed(page, 'photo_credit');
  expect(logs.map((log) => [log.params.action, log.params.plan])).toEqual([
    ['watched', 'rewarded'],
    ['spent', 'rewarded'],
  ]);
});

/**
 * 200 으로 돌아왔는데 한 건도 없는 경우.
 *
 * 던져서 끝난 쪽(503)은 치른 광고를 갚아 주고 있었는데, 빈손으로 돌아온 쪽은 아무것도
 * 안 했다. 사람 입장에서는 둘 다 「광고를 봤는데 아무것도 안 나왔다」 로 같다.
 * 어두운 영수증을 세 번 찍으면 결과 없이 광고만 세 편이 돌았다.
 */
test('한 건도 못 찾아도 치른 광고는 갚아 준다. 다시 찍을 때 또 안 튼다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedTrialUsed(page);
  await seedMockImages(CAPTURE_DATA_URI)(page);
  // 200 인데 후보가 비었다. 서버가 읽기는 했는데 건질 것이 없던 사진이다.
  let seen = 0;
  await page.route('**/api/v1/imports/capture', async (route) => {
    seen += 1;
    if (seen > 1) {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const body = await response.json();
    body.candidates = [];
    await route.fulfill({ response, json: body });
  });

  await openCaptureTab(home, recordSheet);
  await recordSheet.capture.pickButton.click();
  await recordSheet.capture.adConsentConfirm.click();
  // 한 건도 못 찾으면 검토 화면이 「거래를 찾지 못했어요」 로 서고 「다시 고르기」 만 남는다.
  await expect(recordSheet.capture.rows).toHaveCount(0);
  await expect(recordSheet.capture.adFreeNextNotice).toBeVisible();

  // 다음 한 번은 광고 없이 간다. 묻지도 않는다.
  await recordSheet.capture.restartButton.click();
  await recordSheet.capture.pickButton.click();
  await expect(recordSheet.capture.adConsent).toBeHidden();
  await expect(recordSheet.capture.rows).toHaveCount(6);

  const logs = await logsNamed(page, 'photo_credit');
  expect(logs.filter((log) => log.params.action === 'watched')).toHaveLength(1);
  expect(logs.filter((log) => log.params.action === 'wasted')).toHaveLength(1);
});

/**
 * 처음 여는 사람이 **첫 행동으로** 여러 장을 고른 경우.
 *
 * 여러 장은 체험과 무관하게 긴 광고를 태운다. 거기서 체험까지 소진하면
 * 「맨 처음 한 장은 광고 없이」 라고 해 놓고 한 번도 안 주는 셈이 된다.
 */
test('여러 장을 먼저 읽어도 체험 한 장은 남는다. 광고를 치른 읽기로는 안 쓴다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI, 2)(page);
  await answerAsRealModel(page);
  await openCaptureTab(home, recordSheet);

  // 첫 행동이 여러 장이다. 긴 광고를 보고 읽는다.
  await recordSheet.capture.pickButton.click();
  await recordSheet.capture.adConsentConfirm.click();
  await expect(recordSheet.capture.rows).toHaveCount(12);

  /*
    체험은 그대로다. 버튼 아래 한 줄이 안 뜨는 것이 그 증거다. 이 줄은 한 장 기준으로
    광고가 붙는 사람에게만 서서(`planFor(1)`), 체험이 남아 있으면 안 그려진다.
  */
  await recordSheet.capture.cancelButton.click();
  await recordSheet.waitClosed();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('캡처').click();
  await expect(recordSheet.capture.creditLine).toBeHidden();
});

test('여러 장은 체험이 남아 있어도 광고를 묻는다. 읽는 데 오래 걸린다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI, 2)(page);
  await openCaptureTab(home, recordSheet);

  // 체험을 안 썼는데도 묻는다. 체험은 「한 장」 에 대한 것이다.
  await expect(recordSheet.capture.creditLine).toBeHidden();
  await recordSheet.capture.pickButton.click();

  await expect(recordSheet.capture.adConsent).toBeVisible();
});

test('영수증은 한 장씩이다. 카메라로는 여러 장을 못 찍는다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI, 3)(page);

  const bodies: unknown[] = [];
  await page.route('**/api/v1/imports/receipt', async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fallback();
  });

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('영수증').click();
  await recordSheet.receipt.pick();
  await expect(recordSheet.receipt.rows).toHaveCount(1);

  // 앨범에 세 장이 있어도 카메라는 한 장이다. 한 장이면 `images` 가 아니라 `image` 로 간다.
  expect((bodies[0] as { image?: string }).image).toBeTruthy();
});

/**
 * 광고를 끝까지 봤는데 읽기가 실패했을 때.
 *
 * 광고는 읽기 요청과 **겹쳐** 돌아서, 서버가 실패해도 사용자는 이미 다 봤다. 그 상태에서
 * 다시 누를 때 또 틀면 우리 쪽 사정으로 값을 두 번 받는 셈이 된다. 2026-09-23 밤에
 * 서버가 사진을 통째로 못 읽는 동안 사용자가 겪은 자리가 여기다.
 */
async function answerWithFailure(page: Page, failFirst: number): Promise<void> {
  let seen = 0;
  await page.route('**/api/v1/imports/capture', async (route) => {
    seen += 1;
    if (seen > failFirst) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'PARSE_UNAVAILABLE', message: '지금은 캡처를 읽지 못했어요.' },
      }),
    });
  });
}

test.describe('광고는 봤는데 못 읽었을 때', () => {
  // 일부러 503 을 돌려주는 검사라 그 콘솔 오류는 눈감는다. 다른 오류는 그대로 잡힌다.
  test.use({ consoleErrorAllowList: [/Failed to load resource[\s\S]*503/] });

  test('다시 시도할 때 광고를 또 틀지 않고, 읽어 내면 다시 묻는다', async ({
    home,
    page,
    recordSheet,
  }) => {
    await seedTrialUsed(page);
    await seedMockImages(CAPTURE_DATA_URI)(page);
    /*
      **순서가 뜻을 가진다.** 나중에 건 것이 먼저 잡는다. 실패를 나중에 걸어야 그것이
      먼저 받고, 넘길 차례가 되면 `fallback()` 이 아래의 스텁 손질로 내려간다.
      반대로 걸면 스텁 쪽 `fetch()` 가 실패 손질을 건너뛴다.
    */
    await answerAsRealModel(page);
    await answerWithFailure(page, 1);
    await openCaptureTab(home, recordSheet);

    await recordSheet.capture.pickButton.click();
    await recordSheet.capture.adConsentConfirm.click();
    await expect(recordSheet.capture.pickAlert).toBeVisible();
    // 치른 값을 말해 준다. 이 줄이 없으면 다시 누르기가 망설여진다.
    await expect(recordSheet.capture.adFreeNextNotice).toBeVisible();
    // 「읽는 동안 광고가 지나가요」 는 지운다. 두 줄이 서로 다른 말을 하면 안 된다.
    await expect(recordSheet.capture.creditLine).toBeHidden();

    await recordSheet.capture.pickButton.click();
    // 묻지도 않고 광고도 안 뜬다. 이미 한 편 봤다.
    await expect(recordSheet.capture.adConsent).toBeHidden();
    await expect(recordSheet.capture.rows).toHaveCount(6);

    const logs = await logsNamed(page, 'photo_credit');
    expect(logs.filter((log) => log.params.action === 'watched')).toHaveLength(1);
    expect(logs.filter((log) => log.params.action === 'wasted')).toHaveLength(1);

    // 읽어 냈으니 치른 값을 받은 셈이다. 그다음부터는 평소대로 묻는다. 공짜가 이어지지 않는다.
    await recordSheet.capture.cancelButton.click();
    await recordSheet.waitClosed();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.methodTab('캡처').click();
    await recordSheet.capture.pickButton.click();
    await expect(recordSheet.capture.adConsent).toBeVisible();
  });
});
