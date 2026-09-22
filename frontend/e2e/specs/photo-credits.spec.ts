import type { Page } from '@playwright/test';

import { toLedgerDate } from '../../src/shared/lib/format';
import { logsNamed } from '../support/aitMock';
import { CAPTURE_DATA_URI, seedMockImages } from '../support/deviceMock';
import { expect, test } from '../support/fixtures';
import type { HomeScreen } from '../screens/HomeScreen';
import type { RecordSheet } from '../screens/RecordSheet';

/**
 * 사진으로 적을 수 있는 장수.
 *
 * 사진 한 장은 우리가 돈을 내고 읽는다. 키패드로 적는 길은 공짜라 **값이 드는 유일한
 * 행동**인데 지금까지 이 길만 상한이 없었다. 여기서 재는 것은 그 상한이 실제로 서는지,
 * 그리고 **막다른 길이 되지 않는지** 둘이다.
 *
 * 세는 단위를 새로 만들지 않았다. 화면이 적는 것은 「사진 몇 장」 이고 그게 곧 할 수 있는
 * 일의 개수다. 「크레딧」 이라는 말이 화면에 한 번도 안 나오는지도 여기서 본다.
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

test('넉넉하면 셈을 아예 안 보여 준다. 10초 안에 적으러 온 사람 앞이다', async ({
  home,
  recordSheet,
}) => {
  await openCaptureTab(home, recordSheet);

  await expect(recordSheet.capture.pickButton).toBeEnabled();
  // 세 장 남은 사람에게 「장수」 라는 새 개념과 광고 권유를 먼저 세우지 않는다.
  await expect(recordSheet.capture.creditLine).toBeHidden();
  await expect(recordSheet.capture.earnLink).toBeHidden();
});

test('마지막 한 장이 되면 그때 알려 준다', async ({ home, page, recordSheet }) => {
  await seedCredits(page, 1);
  await openCaptureTab(home, recordSheet);

  await expect(recordSheet.capture.creditLine).toHaveText(/사진 1장 남음/);
  // 「크레딧」·「이용권」 같은 말을 배우게 하지 않는다. 화면에 있는 것은 사진 장수뿐이다.
  await expect(recordSheet.capture.creditLine).not.toHaveText(/크레딧|이용권|포인트/);
  // 누르면 광고가 뜬다는 것을 누르기 전에 말한다.
  await expect(recordSheet.capture.earnLink).toHaveText(/광고/);
});

test('마지막 한 장을 쓰면 그 자리가 받는 자리로 바뀐다', async ({ home, page, recordSheet }) => {
  await seedCredits(page, 1);
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await answerAsRealModel(page);
  await openCaptureTab(home, recordSheet);

  await recordSheet.capture.pick();
  await expect(recordSheet.capture.rows).toHaveCount(6);

  // 옆 탭은 같은 장수를 나눠 쓴다. 검토 화면을 벗어나지 않고도 0 장이 된 것을 그쪽에서 본다.
  await recordSheet.methodTab('영수증').click();
  await expect(recordSheet.receipt.creditGate).toBeVisible();
  await expect(recordSheet.receipt.pickButton).toBeHidden();

  const logs = await logsNamed(page, 'photo_credit');
  // 캡처에서 막히고 영수증으로 옮긴 한 사람이다. 둘로 세면 안 된다.
  expect(logs.map((log) => [log.params.action, log.params.left])).toEqual([
    ['spent', 0],
    ['blocked', 0],
  ]);
});

test('사진을 읽어 내면 한 장이 준다. 고르기 전에는 안 준다', async ({
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
  expect(logs.map((log) => [log.params.action, log.params.left])).toEqual([['spent', 2]]);
});

test('지어낸 결과에는 장수를 안 깎는다. 우리가 못 읽은 값을 물리지 않는다', async ({
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

test('두 탭이 같은 장수를 나눠 쓴다. 탭마다 세면 하루에 여섯 장이 된다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedCredits(page, 2);
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await answerAsRealModel(page);
  await openCaptureTab(home, recordSheet);

  await recordSheet.capture.pick();
  await expect(recordSheet.capture.rows).toHaveCount(6);

  await recordSheet.methodTab('영수증').click();
  await expect(recordSheet.receipt.creditLine).toHaveText(/사진 1장 남음/);
});

test('다 쓴 사람에게는 고르는 버튼 대신 받는 자리가 선다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedCredits(page, 0);
  await openCaptureTab(home, recordSheet);

  await expect(recordSheet.capture.creditGate).toBeVisible();
  await expect(recordSheet.capture.pickButton).toBeHidden();
  await expect(recordSheet.capture.earnButton).toBeVisible();
  // 막다른 길을 만들지 않는다. 광고를 안 보겠다는 사람에게도 적을 길이 그 자리에 있다.
  await expect(recordSheet.capture.creditGate.getByRole('button', { name: /키패드/ })).toBeVisible();

  // 막혀서 되돌아간 사람이 어디에도 안 남으면 3장이 맞는 선인지 알 수 없다.
  const logs = await logsNamed(page, 'photo_credit');
  expect(logs.map((log) => log.params.action)).toEqual(['blocked']);
});

test('광고를 한 편 보면 한 장이 들어오고 곧바로 고를 수 있다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedCredits(page, 0);
  await openCaptureTab(home, recordSheet);

  await recordSheet.capture.earnButton.click();

  await expect(recordSheet.capture.pickButton).toBeVisible();
  await expect(recordSheet.capture.creditLine).toHaveText(/사진 1장 남음/);

  const logs = await logsNamed(page, 'photo_credit');
  expect(logs.map((log) => [log.params.action, log.params.left])).toEqual([
    ['blocked', 0],
    ['earned', 1],
  ]);
});

test('아직 남은 사람도 미리 모아 둘 수 있다. 상한이 없다', async ({ home, page, recordSheet }) => {
  await seedCredits(page, 1);
  await openCaptureTab(home, recordSheet);

  await recordSheet.capture.earnLink.click();

  // 두 장이 되면 줄이 사라진다. 넉넉한 사람에게는 셈을 안 보여 준다.
  await expect(recordSheet.capture.creditLine).toBeHidden();

  const logs = await logsNamed(page, 'photo_credit');
  expect(logs.map((log) => [log.params.action, log.params.left])).toEqual([['earned', 2]]);
});

test('사진 광고는 전면 광고 상한을 건드리지 않는다. 스스로 누른 자리다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedCredits(page, 0);
  await openCaptureTab(home, recordSheet);

  await recordSheet.capture.earnButton.click();
  await expect(recordSheet.capture.pickButton).toBeVisible();

  // 상한에 적혔다면 이 로그가 생겼을 것이다.
  expect(await logsNamed(page, 'interstitial_result')).toEqual([]);
});
