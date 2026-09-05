import { formatCurrency, formatDayLabel, toLedgerDate } from '../../src/shared/lib/format';
import { CAPTURE_DATA_URI, albumPhotosSeeded, seedAlbumPhotos } from '../support/album';
import { expect, test } from '../support/fixtures';

/**
 * 캡처 한 장을 골라 읽고 검토해서 저장하는 한 바퀴.
 *
 * 지금 도는 것은 실제 vision 모델이 아니라 정해 둔 예시를 내는 스텁이다. 어떤 이미지를 넣어도
 * 같은 5건이 온다. 그래서 여기서 재는 것은 "얼마나 잘 읽는가" 가 아니라
 * "읽은 것을 화면이 어떻게 다루는가" 다. 인식 정확도는 실제 모델이 붙은 뒤에 잰다.
 *
 * 앨범은 네이티브 기능이라 devtools 목에 사진을 심어 통과시킨다. 브릿지 코드는 실기기와 같다.
 */

const CAPTURE_ANALYZE = '**/api/v1/imports/capture';

/** 스텁이 내는 5건 중 기본으로 켜지는 것들. 스타벅스를 미리 심으면 그 줄이 중복으로 빠진다. */
const SELECTED_WITHOUT_STARBUCKS = 3_200 + 8_000 + 32_900;
const KAKAO_T = 9_800;

function dayLabel(daysAgo: number): string {
  const now = new Date();
  now.setDate(now.getDate() - daysAgo);
  return formatDayLabel(toLedgerDate(now));
}

test('캡처 한 장에서 다섯 건을 읽어 한 화면에서 검토하고 저장한다', async ({
  calendar,
  home,
  page,
  prep,
  recordSheet,
}) => {
  // 오늘 스타벅스 4,500 을 미리 심어 둔다. 스텁 첫 줄과 지문이 같아져 중복으로 잡혀야 한다.
  await prep.addTransaction({ amount: 4_500, merchant: '스타벅스' });

  await seedAlbumPhotos(CAPTURE_DATA_URI)(page);

  // 스텁은 바이트를 안 본다. 이 한 겹이 없으면 프론트가 빈 값을 보내도 전 구간이 초록이다.
  let sentImage: string | null = null;
  await page.route(CAPTURE_ANALYZE, async (route) => {
    if (route.request().method() === 'POST') {
      sentImage = JSON.parse(route.request().postData() ?? '{}').image ?? null;
    }
    await route.continue();
  });

  await home.open();
  await home.waitReady();
  // 다이얼이 안 걸린 채로 통과하면 목이 만든 기본 그림을 보고 있는 것이다.
  expect(await albumPhotosSeeded(page)).toBe(true);

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.methodTab('캡처')).toBeEnabled();
  await recordSheet.methodTab('캡처').click();
  await expect(recordSheet.capture.guide).toBeVisible();

  await recordSheet.capture.pick();

  expect(sentImage).toBe(CAPTURE_DATA_URI);
  await expect(recordSheet.capture.rows).toHaveCount(5);
  await expect(recordSheet.capture.stubNotice).toBeVisible();

  await expect(recordSheet.capture.amount('GS25')).toHaveText(formatCurrency(3_200));
  await expect(recordSheet.capture.day('GS25')).toHaveText(dayLabel(0));
  await expect(recordSheet.capture.amount('쿠팡')).toHaveText(formatCurrency(32_900));
  await expect(recordSheet.capture.day('쿠팡')).toHaveText(dayLabel(2));

  // 이미 적어 둔 것을 또 넣지 않는다. 켜 주면 같은 거래가 두 번 저장된다.
  await expect(recordSheet.capture.chip('스타벅스', '이미 있어요')).toBeVisible();
  await expect(recordSheet.capture.checkbox('스타벅스')).not.toBeChecked();

  // 확신이 낮은 줄은 서버가 스스로 켜지 않는다. 사람이 켜야 저장된다.
  await expect(recordSheet.capture.chip('카카오T', '확인 필요')).toBeVisible();
  await expect(recordSheet.capture.checkbox('카카오T')).not.toBeChecked();

  await expect(recordSheet.capture.saveButton).toHaveText(
    `3건 저장 · ${formatCurrency(SELECTED_WITHOUT_STARBUCKS)}`,
  );

  await recordSheet.capture.toggle('카카오T', true);
  await expect(recordSheet.capture.saveButton).toHaveText(
    `4건 저장 · ${formatCurrency(SELECTED_WITHOUT_STARBUCKS + KAKAO_T)}`,
  );

  // 켠 것을 되돌리고 기본 상태로 저장한다.
  await recordSheet.capture.toggle('카카오T', false);
  await recordSheet.capture.save();

  await expect(recordSheet.capture.savedTitle).toHaveText(
    `3건 저장했어요 · ${formatCurrency(SELECTED_WITHOUT_STARBUCKS)}`,
  );
  // 스텁이 지어낸 결과라는 사실은 저장한 뒤에도 그대로 보인다.
  await expect(recordSheet.capture.stubNotice).toBeVisible();

  await recordSheet.capture.confirmButton.click();
  await recordSheet.waitClosed();

  // 미리 심어 둔 4,500 이 이번 달 지출에 이미 들어 있다.
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SELECTED_WITHOUT_STARBUCKS + 4_500));

  await calendar.open();
  await calendar.waitReady();
  await expect(calendar.totals.expense).toHaveText(
    formatCurrency(SELECTED_WITHOUT_STARBUCKS + 4_500),
  );
  await expect(calendar.list.row('GS25')).toBeVisible();
});

test('고른 사진을 다시 보여 주지 않고 바로 읽는다', async ({ home, page, recordSheet }) => {
  await seedAlbumPhotos(CAPTURE_DATA_URI)(page);

  await home.open();
  await home.waitReady();
  expect(await albumPhotosSeeded(page)).toBe(true);

  await home.recordButton.click();
  await recordSheet.methodTab('캡처').click();
  await recordSheet.capture.pickButton.click();

  // 미리보기에서 한 번 더 확인받으면 10초가 넘는다. 진짜 확인은 후보 목록에서 한다.
  await expect(recordSheet.capture.readLine).toBeVisible();
  await expect(recordSheet.capture.guide).toHaveCount(0);
});
