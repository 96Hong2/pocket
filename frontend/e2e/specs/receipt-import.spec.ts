import { formatCurrency } from '../../src/shared/lib/format';
import { pressSystemBack, watchAppClose } from '../support/aitMock';
import {
  CANCELLED_SHOT,
  CAPTURE_DATA_URI,
  cameraPermissionDenied,
  denyCameraPermission,
  denyPhotoPermission,
  mockImagesSeeded,
  seedMockImages,
} from '../support/deviceMock';
import { expect, test } from '../support/fixtures';

/**
 * 영수증 한 장을 찍어 읽고 검토해서 저장하는 한 바퀴와 그 경계.
 *
 * 캡처와 같은 배관을 타므로 검토·수정·저장은 `capture-import.spec.ts` 가 이미 지킨다.
 * 여기서 보는 것은 갈리는 자리다. 카메라를 부르는지, 영수증 지시가 실제로 갔는지,
 * 상호를 못 읽은 줄이 살아남는지, 못 읽었을 때 키패드로 이어지는지.
 *
 * 카메라는 네이티브 기능이라 devtools 목에 사진을 심어 통과시킨다. 브릿지 코드는 실기기와 같다.
 */

const RECEIPT_ANALYZE = '**/api/v1/imports/receipt';

/** 스텁이 영수증에 대해 늘 내는 한 건. 상호를 못 읽은 모양이다. */
const RECEIPT_AMOUNT = 23_500;
/** 상호가 비면 검토 화면이 이 이름으로 그린다. */
const NO_NAME = '이름 없음';
/** 상호가 없으니 달력·홈은 분류 이름으로 줄 제목을 만든다. */
const ROW_TITLE = '식비';

/** 한 건도 못 읽은 묶음. 서버가 주는 모양 그대로다. */
const EMPTY_BATCH = {
  status: 201,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  body: JSON.stringify({
    id: '00000000-0000-4000-8000-000000000002',
    source: 'receipt',
    status: 'ready',
    detected_count: 0,
    selected_count: 0,
    selected_expense_total: '0',
    error_code: null,
    candidates: [],
    meta: { provider: 'stub', is_stub: true, notes: ['stub_image'] },
  }),
};

test('영수증 한 장을 찍어 상호 없는 한 건을 저장한다', async ({
  calendar,
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);

  // 스텁은 바이트를 안 본다. 이 한 겹이 없으면 프론트가 빈 값을 보내도 전 구간이 초록이다.
  // 경로까지 여기서 걸린다. 캡처 경로로 보내면 한 번도 안 걸려 null 로 남는다.
  let sentImage: string | null = null;
  await page.route(RECEIPT_ANALYZE, async (route) => {
    if (route.request().method() === 'POST') {
      sentImage = JSON.parse(route.request().postData() ?? '{}').image ?? null;
    }
    await route.continue();
  });

  await home.open();
  await home.waitReady();
  // 다이얼이 안 걸린 채로 통과하면 목이 만든 기본 그림을 보고 있는 것이다.
  expect(await mockImagesSeeded(page)).toBe(true);

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.methodTab('영수증')).toBeEnabled();
  await recordSheet.methodTab('영수증').click();
  await expect(recordSheet.receipt.guide).toBeVisible();

  await recordSheet.receipt.pick();

  expect(sentImage).toBe(CAPTURE_DATA_URI);
  // 캡처 예시 다섯 건이 뜨면 영수증 지시가 안 간 것이다.
  await expect(recordSheet.receipt.rows).toHaveCount(1);
  await expect(recordSheet.receipt.stubNotice).toBeVisible();

  // 상호를 못 읽어도 총액은 살아남는다. 이 줄을 버리면 다시 찍어야 한다.
  await expect(recordSheet.receipt.amount(NO_NAME)).toHaveText(formatCurrency(RECEIPT_AMOUNT));
  await expect(recordSheet.receipt.checkbox(NO_NAME)).toBeChecked();
  await expect(recordSheet.receipt.saveButton).toHaveText(
    `1건 저장 · ${formatCurrency(RECEIPT_AMOUNT)}`,
  );

  await recordSheet.receipt.save();
  await expect(recordSheet.receipt.savedTitle).toHaveText(
    `1건 저장했어요 · ${formatCurrency(RECEIPT_AMOUNT)}`,
  );

  await recordSheet.receipt.confirmButton.click();
  await recordSheet.waitClosed();

  await expect(home.hero.monthSpent).toHaveText(formatCurrency(RECEIPT_AMOUNT));

  await calendar.open();
  await calendar.waitReady();
  await expect(calendar.totals.expense).toHaveText(formatCurrency(RECEIPT_AMOUNT));
  await expect(calendar.list.row(ROW_TITLE)).toBeVisible();
});

test('사진 접근이 꺼져 있어도 영수증은 그대로 돈다', async ({ home, page, recordSheet }) => {
  // 앨범을 부르면 여기서 권한 화면이 뜬다. 목이 같은 배열을 돌려주는 탓에
  // 브릿지를 잘못 부르고도 사진이 나와 버리는데, 그 어긋남을 잡는 자리가 이 한 곳이다.
  await denyPhotoPermission()(page);
  await seedMockImages(CAPTURE_DATA_URI)(page);

  await home.open();
  await home.waitReady();
  expect(await mockImagesSeeded(page)).toBe(true);

  await home.recordButton.click();
  await recordSheet.methodTab('영수증').click();
  await recordSheet.receipt.pick();

  await expect(recordSheet.receipt.rows).toHaveCount(1);
});

test('촬영을 취소하면 아무 말도 하지 않고 첫 화면 그대로다', async ({
  home,
  page,
  recordSheet,
}) => {
  // 빈 dataUri 를 목이 그대로 돌려주고, 그 값이 실기기와 같은 브릿지 코드를 지나 null 이 된다.
  await seedMockImages(CANCELLED_SHOT)(page);

  await home.open();
  await home.waitReady();
  expect(await mockImagesSeeded(page)).toBe(true);

  await home.recordButton.click();
  await recordSheet.methodTab('영수증').click();
  await recordSheet.receipt.pickButton.click();

  // 사용자가 스스로 그만둔 것이다. 오류로 말하면 잘못한 것처럼 읽힌다.
  await expect(recordSheet.receipt.pickAlert).toHaveCount(0);
  await expect(recordSheet.receipt.guide).toBeVisible();
  await expect(recordSheet.receipt.readLine).toHaveCount(0);
  // 잠금이 풀려야 다시 찍거나 다른 탭으로 갈 수 있다.
  await expect(recordSheet.closeButton).toBeVisible();
  await expect(recordSheet.methodTab('키패드')).toBeEnabled();
});

test('카메라 접근이 꺼져 있으면 사진이 아니라 카메라라고 말한다', async ({
  home,
  page,
  recordSheet,
}) => {
  await denyCameraPermission()(page);

  await home.open();
  await home.waitReady();
  // 다이얼이 안 걸리면 권한 화면이 아니라 정상 경로를 보게 된다.
  expect(await cameraPermissionDenied(page)).toBe(true);

  await home.recordButton.click();
  await recordSheet.methodTab('영수증').click();
  await recordSheet.receipt.pickButton.click();

  await expect(recordSheet.receipt.permissionDenied).toBeVisible();
  // 권한을 못 켜는 사람도 기록은 해야 한다.
  await expect(recordSheet.receipt.keypadFallbackButton).toBeVisible();
});

test('읽는 동안 탭도 닫기도 잠기고, 끝나면 풀린다', async ({ home, page, recordSheet }) => {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(RECEIPT_ANALYZE, async (route) => {
    if (route.request().method() === 'POST') await held;
    await route.continue();
  });

  await seedMockImages(CAPTURE_DATA_URI)(page);
  const appClosed = watchAppClose(page);
  await home.open();
  await home.waitReady();

  await home.recordButton.click();
  await recordSheet.methodTab('영수증').click();
  await recordSheet.receipt.pickButton.click();

  await expect(recordSheet.receipt.analyzing).toBeVisible();
  // 결과가 돌아올 자리를 없애면 하루 상한만 깎고 얻은 것이 사라진다.
  await expect(recordSheet.methodTab('키패드')).toBeDisabled();
  await expect(recordSheet.closeButton).toHaveCount(0);
  await recordSheet.closeByEsc();
  await recordSheet.waitOpen();

  // 시트가 뒤로가기를 삼켜야 한다. 놓으면 미니앱이 통째로 닫혀 읽던 것이 사라진다.
  await pressSystemBack(page);
  await recordSheet.waitOpen();
  expect(appClosed()).toBe(false);

  release();

  await expect(recordSheet.receipt.readLine).toBeVisible();
  await expect(recordSheet.methodTab('키패드')).toBeEnabled();
  await expect(recordSheet.closeButton).toBeVisible();
});

test('영수증 탭을 열어도 Tab 키가 시트 밖으로 새지 않는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('영수증').click();
  await expect(recordSheet.receipt.guide).toBeVisible();

  // 감춘 패널이 하나 더 늘었다. 그것들의 버튼까지 포커스 대상으로 세면 마지막 자리가
  // 안 보이는 요소가 되어 되감기가 안 걸리고 포커스가 시트 밖으로 나간다.
  // 한 번 누를 때마다 본다. 끝에서 한 번만 보면 문서를 한 바퀴 돌아 되돌아온 것을 놓친다.
  for (let press = 1; press <= 12; press += 1) {
    await recordSheet.pressTab(1);
    expect(await recordSheet.focusInside, `${press}번째 Tab 에서 시트 밖으로 나갔다`).toBe(true);
  }
});

test('한 건도 못 읽으면 왜인지 짚어 주고 그 자리에서 키패드로 넘어간다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await page.route(RECEIPT_ANALYZE, (route) =>
    route.request().method() === 'POST' ? route.fulfill(EMPTY_BATCH) : route.continue(),
  );

  await home.open();
  await home.waitReady();

  await home.recordButton.click();
  await recordSheet.methodTab('영수증').click();
  await recordSheet.receipt.pick();

  await expect(recordSheet.receipt.emptyNotice).toBeVisible();
  // 무엇을 고치면 되는지 말해 주지 않으면 같은 사진을 또 찍는다.
  await expect(recordSheet.receipt.emptyReason).toBeVisible();
  await expect(recordSheet.receipt.saveButton).toHaveCount(0);

  // 여기서 막히면 기록을 포기한다. 손으로 찍는 길이 바로 옆에 있어야 한다.
  await recordSheet.receipt.keypadFallbackButton.click();
  await recordSheet.input.enterAmount(23_500);
  await expect(recordSheet.input.amountText).toHaveText('23,500원');
});
