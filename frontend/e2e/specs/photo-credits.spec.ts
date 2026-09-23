import type { Page } from '@playwright/test';

import { toLedgerDate } from '../../src/shared/lib/format';
import { logsNamed } from '../support/aitMock';
import { CAPTURE_DATA_URI, seedMockImages } from '../support/deviceMock';
import { expect, test } from '../support/fixtures';
import type { HomeScreen } from '../screens/HomeScreen';
import type { RecordSheet } from '../screens/RecordSheet';

/**
 * 사진을 읽는 동안 도는 광고.
 *
 * 사진 한 장은 우리가 돈을 내고 읽는다. 키패드로 적는 길은 공짜라 **값이 드는 유일한
 * 행동**이다. 2026-09-23 에 규칙을 이렇게 바꿨다.
 *
 * | 무엇 | 광고 |
 * | --- | --- |
 * | 오늘 첫 한 장 | 없다 |
 * | 두 장째부터 | 읽는 동안 전면 광고 한 편 |
 * | 한 번에 여러 장 | 읽는 동안 리워드 광고 한 편 |
 *
 * 여기서 재는 것은 셋이다. **막지 않는지**(예전에는 다 쓰면 막았다), **광고 전에 반드시
 * 묻는지**(콘솔 반려 사유였다), 그리고 **광고가 기다림을 새로 만들지 않는지**(읽기 요청이
 * 광고보다 먼저 나간다).
 */

/** 가계부 시간대(KST) 기준으로 센다. 러너가 UTC 면 하루 어긋난다. */
function ledgerToday(): string {
  return toLedgerDate(new Date());
}

/**
 * 읽은 결과에서 「예시 결과」 표시를 떼어 낸다.
 *
 * e2e 백엔드는 스텁이라 늘 `stub_image` 가 붙어 오고, 화면은 그 표시가 붙은 결과에는
 * **장수를 안 깎는다**(지어낸 결과의 값을 사람에게 물리지 않는다). 그래서 이 한 겹이 없으면
 * 차감하는 길을 아무 검사도 못 지난다. 바꾸는 것은 그 표시 하나뿐이고 나머지는 서버가 준 그대로다.
 */
async function answerAsRealModel(page: Page): Promise<void> {
  await page.route('**/api/v1/imports/capture', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.meta.notes = (body.meta?.notes ?? []).filter((note: string) => note !== 'stub_image');
    await route.fulfill({ response, json: body });
  });
}

/** 남은 장수를 정해 두고 연다. 목 SDK 저장소는 접두사를 붙인 localStorage 다. */
async function seedCredits(page: Page, count: number): Promise<void> {
  await page.addInitScript(
    ([day, left]) => {
      try {
        window.localStorage.setItem('__ait_storage:photo-credits', `${day}:${left}`);
      } catch {
        /* 저장소를 못 여는 문서에서는 이 앱이 돌지 않는다. */
      }
    },
    [ledgerToday(), String(count)] as const,
  );
}

/** 기록 시트의 캡처 탭까지 간다. 사진을 고르기 직전 상태다. */
async function openCaptureTab(home: HomeScreen, recordSheet: RecordSheet): Promise<void> {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('캡처').click();
}

test('오늘 첫 한 장은 아무 말도 안 한다. 10초 안에 적으러 온 사람 앞이다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await openCaptureTab(home, recordSheet);

  // 「무료」 도 「광고」 도 꺼내지 않는다. 셈이라는 새 개념을 먼저 세울 이유가 없다.
  await expect(recordSheet.capture.creditLine).toBeHidden();
  await expect(recordSheet.capture.pickButton).toBeVisible();

  await recordSheet.capture.pickButton.click();
  // 확인 창도 안 선다. 광고가 없으니 물을 것도 없다.
  await expect(recordSheet.capture.adConsent).toBeHidden();
  await expect(recordSheet.capture.rows).toHaveCount(6);
});

test('무료분을 쓰고 나면 다음부터 광고가 온다는 것을 미리 적어 둔다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedCredits(page, 0);
  await openCaptureTab(home, recordSheet);

  await expect(recordSheet.capture.creditLine).toBeVisible();
  // 막지 않는다. 버튼은 그대로 있고 말투만 바뀐다.
  await expect(recordSheet.capture.pickButton).toBeVisible();
});

test('두 장째부터는 광고를 묻고, 읽는 동안이라고 말한다', async ({ home, page, recordSheet }) => {
  await seedCredits(page, 0);
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

test('확인 창에서 닫으면 읽지도 않고 광고도 안 뜬다', async ({ home, page, recordSheet }) => {
  await seedCredits(page, 0);
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
  await seedCredits(page, 0);
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

test('사진을 읽어 내면 무료분이 준다. 고르기 전에는 안 준다', async ({
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
  expect(logs.map((log) => [log.params.action, log.params.left])).toEqual([['spent', 0]]);
});

test('지어낸 결과에는 무료분을 안 깎는다. 우리가 못 읽은 값을 물리지 않는다', async ({
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

test('두 탭이 같은 무료분을 나눠 쓴다. 탭마다 세면 하루에 두 장이 된다', async ({
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
    ['spent', undefined],
  ]);
});

test('여러 장은 무료분이 남아 있어도 광고를 묻는다. 읽는 데 오래 걸린다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI, 2)(page);
  await openCaptureTab(home, recordSheet);

  // 오늘 무료분을 안 썼는데도 묻는다. 무료분은 「한 장」 에 대한 것이다.
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

test('사진의 긴 광고는 전면 광고 상한을 건드리지 않는다. 스스로 누른 자리다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI, 2)(page);
  await answerAsRealModel(page);
  await openCaptureTab(home, recordSheet);

  await recordSheet.capture.pick();
  await expect(recordSheet.capture.rows).toHaveCount(12);

  // 상한에 적혔다면 이 로그가 생겼을 것이다.
  expect(await logsNamed(page, 'interstitial_result')).toEqual([]);
});
