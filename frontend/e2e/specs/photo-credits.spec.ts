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

test('처음 쓰는 사람은 세 장을 들고 시작한다', async ({ home, recordSheet }) => {
  await openCaptureTab(home, recordSheet);

  await expect(recordSheet.capture.creditLine).toHaveText(/사진 3장 남음/);
  // 「크레딧」·「이용권」 같은 말을 배우게 하지 않는다. 화면에 있는 것은 사진 장수뿐이다.
  await expect(recordSheet.capture.creditLine).not.toHaveText(/크레딧|이용권|포인트/);
});

test('사진을 읽어 내면 한 장이 준다. 고르기 전에는 안 준다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await openCaptureTab(home, recordSheet);

  await expect(recordSheet.capture.creditLine).toHaveText(/사진 3장 남음/);
  await recordSheet.capture.pick();
  await expect(recordSheet.capture.rows).toHaveCount(6);

  const logs = await logsNamed(page, 'photo_credit');
  expect(logs.map((log) => [log.params.action, log.params.left])).toEqual([['spent', 2]]);
});

test('두 탭이 같은 장수를 나눠 쓴다. 탭마다 세면 하루에 여섯 장이 된다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await openCaptureTab(home, recordSheet);

  await recordSheet.capture.pick();
  await expect(recordSheet.capture.rows).toHaveCount(6);

  await recordSheet.methodTab('영수증').click();
  await expect(recordSheet.receipt.creditLine).toHaveText(/사진 2장 남음/);
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
  expect(logs.map((log) => [log.params.action, log.params.left])).toEqual([['earned', 1]]);
});

test('아직 남은 사람도 미리 모아 둘 수 있다. 상한이 없다', async ({ home, recordSheet }) => {
  await openCaptureTab(home, recordSheet);

  await recordSheet.capture.earnLink.click();
  await expect(recordSheet.capture.creditLine).toHaveText(/사진 4장 남음/);

  await recordSheet.capture.earnLink.click();
  await expect(recordSheet.capture.creditLine).toHaveText(/사진 5장 남음/);
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
