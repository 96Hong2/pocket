import { formatCurrency, formatDayLabel, toLedgerDate } from '../../../src/shared/lib/format';
import {
  CAPTURE_DATA_URI,
  denyPhotoPermission,
  mockImagesSeeded,
  photoPermissionDenied,
  seedMockImages,
} from '../../support/deviceMock';
import { expect, test } from '../support/director';

/**
 * 앨범에서 캡처 한 장을 골라 여러 건을 한 번에 적는 두 장면.
 *
 * 40 은 잘 풀리는 길이다. 한 장이 여러 줄로 갈리고, 이미 적어 둔 것과 확신이 낮은 것은
 * 꺼진 채로 와서, 켜 둔 것만 저장된다. 41 은 막히는 길이다. 한 건도 못 읽었을 때와
 * 사진 접근이 꺼져 있을 때 화면이 무슨 일인지 말하고 키패드로 나갈 자리를 남긴다.
 * 41 을 못 읽는 쪽 → 권한 쪽 순서로 두는 이유는, 권한을 끄면 앨범이 아예 안 열려
 * 되돌릴 수 없기 때문이다.
 *
 * 사진 인식은 아직 실제 모델이 아니라 규칙 기반 스텁이다. 어떤 사진을 넣어도 캡처는 같은
 * 5건을 내고(영수증은 상호를 못 읽은 1건이다), 41 의 '한 건도 못 읽음' 은 스텁으로는
 * 만들 수 없어 응답을 빈 묶음으로 바꿔 넣었다. 그래서 여기서 보이는 것은
 * '얼마나 잘 읽는가' 가 아니라 '읽은 것을 화면이 어떻게 다루는가' 다.
 *
 * 앨범은 네이티브 기능이라 devtools 목에 사진을 미리 심는다. 브릿지 코드는 실기기와 같다.
 */

const CAPTURE_ANALYZE = '**/api/v1/imports/capture';

/** 미리 적어 두는 오늘 지출. 스텁 첫 줄과 지문이 같아져 '이미 있어요' 로 잡힌다. */
const SEEDED = 4_500;

/** 스텁 5건 중 기본으로 켜져 오는 셋. 스타벅스는 중복, 카카오T 는 확신이 낮아 빠진다. */
const SELECTED = [
  { amount: 3_200, daysAgo: 0 }, // GS25
  { amount: 8_000, daysAgo: 1 }, // 김밥천국
  { amount: 32_900, daysAgo: 2 }, // 쿠팡
] as const;
const SELECTED_TOTAL = SELECTED.reduce((sum, row) => sum + row.amount, 0);
const KAKAO_T = 9_800;

/** 한 건도 못 읽고 돌아온 묶음. 서버가 주는 모양 그대로다. */
const EMPTY_BATCH = {
  status: 201,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  body: JSON.stringify({
    id: '00000000-0000-4000-8000-000000000002',
    source: 'screenshot',
    status: 'ready',
    detected_count: 0,
    selected_count: 0,
    selected_expense_total: '0',
    error_code: null,
    candidates: [],
    meta: { provider: 'stub', is_stub: true, notes: ['stub_image'] },
  }),
};

function dayOf(daysAgo: number): Date {
  const at = new Date();
  at.setDate(at.getDate() - daysAgo);
  return at;
}

function dayLabel(daysAgo: number): string {
  return formatDayLabel(toLedgerDate(dayOf(daysAgo)));
}

/**
 * 저장한 뒤 이번 달에 잡히는 몫.
 *
 * 스텁 날짜는 오늘 기준 상대라 달 초에 돌리면 어제·그저께가 지난달로 넘어간다.
 * 홈과 달력은 달력 월만 세므로, 저장 합계를 그대로 쓰면 매달 1·2일에만 영상이 깨진다.
 */
function thisMonthTotal(): number {
  const month = toLedgerDate(new Date()).slice(0, 7);
  const inThisMonth = SELECTED.filter(
    ({ daysAgo }) => toLedgerDate(dayOf(daysAgo)).slice(0, 7) === month,
  );
  return SEEDED + inThisMonth.reduce((sum, row) => sum + row.amount, 0);
}

test('40 캡처 한 장에서 고른 것만 저장한다', async ({
  calendar,
  demo,
  home,
  page,
  prep,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);

  await home.open();
  await home.waitReady();
  // 다이얼이 안 걸렸으면 목이 만든 기본 그림을 보고 있는 것이다.
  expect(await mockImagesSeeded(page), '목에 사진이 안 심겼다').toBe(true);
  await demo.open('캡처로 한 번에 적기', '한 장에서 갈려 나온 것을 골라서 저장한다');

  await demo.step('오늘 스타벅스 4,500원은 이미 적어 두었다');
  await prep.addTransaction({ amount: SEEDED, merchant: '스타벅스' });
  await page.reload();
  await home.waitReady();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SEEDED));
  await demo.beat(2);

  await demo.step('기록하기를 눌러 캡처 탭으로 옮긴다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('캡처').click();
  await expect(recordSheet.capture.guide).toBeVisible();
  await demo.beat(2);

  await demo.step('앨범에서 거래내역 캡처 한 장을 고른다');
  await recordSheet.capture.pick();
  await expect(recordSheet.capture.rows).toHaveCount(5);
  await demo.beat(3);

  await demo.step('줄마다 금액과 날짜가 따로 붙는다');
  await expect(recordSheet.capture.amount('쿠팡')).toHaveText(formatCurrency(32_900));
  await expect(recordSheet.capture.day('쿠팡')).toHaveText(dayLabel(2));
  await demo.beat(3);

  await demo.step('이미 적어 둔 스타벅스는 꺼진 채로 온다');
  await expect(recordSheet.capture.chip('스타벅스', '이미 있어요')).toBeVisible();
  await expect(recordSheet.capture.checkbox('스타벅스')).not.toBeChecked();
  await demo.beat(3);

  await demo.step('확인이 필요한 카카오T 를 켜면 버튼 숫자가 함께 오른다');
  await recordSheet.capture.toggle('카카오T', true);
  await expect(recordSheet.capture.saveButton).toHaveText(
    `4건 저장 · ${formatCurrency(SELECTED_TOTAL + KAKAO_T)}`,
  );
  await demo.beat(3);

  await demo.step('다시 끄고 고른 세 건만 저장한다');
  await recordSheet.capture.toggle('카카오T', false);
  await recordSheet.capture.save();
  await expect(recordSheet.capture.savedTitle).toHaveText(
    `3건 저장했어요 · ${formatCurrency(SELECTED_TOTAL)}`,
  );
  await demo.beat(3);

  await demo.step('홈의 이번 달 쓴 돈이 그만큼 올라간다');
  await recordSheet.capture.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(thisMonthTotal()));
  await demo.beat(3);

  await demo.step('달력에도 저장한 것만 줄로 들어와 있다');
  await calendar.open();
  await calendar.waitReady();
  await expect(calendar.list.row('GS25')).toBeVisible();
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('41 못 읽거나 사진이 막혀도 키패드로 빠져나간다', async ({
  demo,
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);
  // 스텁은 늘 5건을 낸다. 한 건도 못 읽은 화면은 응답을 빈 묶음으로 바꿔 만든다.
  await page.route(CAPTURE_ANALYZE, (route) =>
    route.request().method() === 'POST' ? route.fulfill(EMPTY_BATCH) : route.continue(),
  );

  await home.open();
  await home.waitReady();
  expect(await mockImagesSeeded(page), '목에 사진이 안 심겼다').toBe(true);
  await demo.open('안 될 때의 캡처', '무슨 일인지 말하고 다른 길을 남긴다');

  await demo.step('기록하기를 눌러 캡처 탭으로 옮긴다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('캡처').click();
  await expect(recordSheet.capture.guide).toBeVisible();
  await demo.beat(2);

  await demo.step('한 장을 골랐는데 거래를 하나도 못 찾았다');
  await recordSheet.capture.pick();
  await expect(recordSheet.capture.emptyNotice).toBeVisible();
  await demo.beat(3);

  await demo.step('저장할 것이 없으니 저장 버튼도 내놓지 않는다');
  await expect(recordSheet.capture.saveButton).toHaveCount(0);
  await demo.beat(3);

  await demo.step('다시 고르기를 누르면 처음 화면으로 돌아온다');
  await recordSheet.capture.restartButton.click();
  await expect(recordSheet.capture.guide).toBeVisible();
  await demo.beat(2);

  await demo.step('이번에는 사진 접근이 꺼진 채로 앱을 다시 연다');
  await recordSheet.closeButton.click();
  await recordSheet.waitClosed();
  await denyPhotoPermission()(page);
  await page.reload();
  await home.waitReady();
  expect(await photoPermissionDenied(page), '사진 권한이 안 꺼졌다').toBe(true);
  await demo.beat(2);

  await demo.step('캡처 고르기를 눌러도 앨범이 열리지 않는다');
  await home.recordButton.click();
  await recordSheet.methodTab('캡처').click();
  await recordSheet.capture.pickButton.click();
  await expect(recordSheet.capture.permissionDenied).toBeVisible();
  await demo.beat(3);

  await demo.step('설정에서 켜고 돌아와 다시 시도할 길이 남아 있다. 아직 꺼져 있으면 같은 화면이다');
  await recordSheet.capture.pickButton.click();
  await expect(recordSheet.capture.permissionDenied).toBeVisible();
  await demo.beat(3);

  await demo.step('사진이 막혀도 키패드로는 그대로 적는다');
  await recordSheet.methodTab('키패드').click();
  await recordSheet.input.enterAmount(5_000);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(5_000));
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
