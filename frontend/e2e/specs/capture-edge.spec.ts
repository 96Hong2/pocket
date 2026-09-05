import {
  CAPTURE_DATA_URI,
  albumPhotosSeeded,
  denyPhotoPermission,
  photoPermissionDenied,
  seedAlbumPhotos,
} from '../support/album';
import { pressSystemBack, watchAppClose } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 캡처 입력의 경계.
 *
 * 한 바퀴가 도는 것은 `capture-import.spec.ts` 가 지킨다. 여기서 보는 것은 그 바퀴가
 * 어긋나는 자리다. 사진 접근이 꺼져 있을 때, 한 건도 못 읽었을 때, 서버가 막거나 죽었을 때,
 * 그리고 읽는 동안의 잠금.
 */

const CAPTURE_ANALYZE = '**/api/v1/imports/capture';

/**
 * 실패 응답 한 벌.
 *
 * 앱과 API 는 출처가 달라 브라우저가 응답에 CORS 헤더를 요구한다. 없으면 앱이
 * 상태 코드가 아니라 네트워크 실패로 읽어 다른 문구가 뜬다.
 */
function envelope(status: number, code: string, message: string) {
  return {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    body: JSON.stringify({ error: { code, message } }),
  };
}

const PARSE_DOWN = envelope(
  503,
  'PARSE_UNAVAILABLE',
  '지금은 캡처를 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.',
);
const OVER_LIMIT = envelope(
  429,
  'USAGE_LIMIT',
  '오늘은 캡처 분석을 충분히 썼어요. 키패드로는 계속 기록할 수 있어요.',
);

/** 한 건도 못 읽은 묶음. 서버가 주는 모양 그대로다. */
const EMPTY_BATCH = {
  status: 201,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  body: JSON.stringify({
    id: '00000000-0000-4000-8000-000000000001',
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

test('사진 접근이 꺼져 있으면 무슨 일인지 말해 주고 다시 시도할 길을 준다', async ({
  home,
  page,
  recordSheet,
}) => {
  await denyPhotoPermission()(page);

  await home.open();
  await home.waitReady();
  // 다이얼이 안 걸리면 권한 화면이 아니라 정상 경로를 보게 된다.
  expect(await photoPermissionDenied(page)).toBe(true);

  await home.recordButton.click();
  await recordSheet.methodTab('캡처').click();
  await recordSheet.capture.pickButton.click();

  await expect(recordSheet.capture.permissionDenied).toBeVisible();

  // 권한을 켜고 돌아온 척 다시 눌러 본다. 이 탭에서 할 수 있는 일이 남아 있어야 한다.
  await recordSheet.capture.pickButton.click();

  // 여전히 거부면 같은 화면으로 돌아온다. 알 수 없는 오류로 뭉개면 무엇을 고칠지 모른다.
  await expect(recordSheet.capture.permissionDenied).toBeVisible();
  await expect(recordSheet.capture.pickAlert).toHaveCount(0);
});

test('읽는 동안 탭도 닫기도 잠기고, 끝나면 풀린다', async ({ home, page, recordSheet }) => {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(CAPTURE_ANALYZE, async (route) => {
    if (route.request().method() === 'POST') await held;
    await route.continue();
  });

  await seedAlbumPhotos(CAPTURE_DATA_URI)(page);
  const appClosed = watchAppClose(page);
  await home.open();
  await home.waitReady();
  expect(await albumPhotosSeeded(page)).toBe(true);

  await home.recordButton.click();
  await recordSheet.methodTab('캡처').click();
  await recordSheet.capture.pickButton.click();

  await expect(recordSheet.capture.analyzing).toBeVisible();
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

  await expect(recordSheet.capture.readLine).toBeVisible();
  await expect(recordSheet.capture.analyzing).toHaveCount(0);
  await expect(recordSheet.methodTab('키패드')).toBeEnabled();
  await expect(recordSheet.closeButton).toBeVisible();
});

test('탭을 옮겨도 Tab 키가 시트 밖으로 새지 않는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('캡처').click();
  await expect(recordSheet.capture.guide).toBeVisible();

  // 감춘 탭(키패드·줄글)의 버튼이 DOM 에 그대로 남아 있다. 그것까지 포커스 대상으로 세면
  // 마지막 자리가 안 보이는 요소가 되어 되감기가 안 걸리고 포커스가 시트 밖으로 나간다.
  //
  // 한 번 누를 때마다 본다. 끝에서 한 번만 보면 놓친다. 시트는 포털이라 문서 맨 뒤에 붙고,
  // 새어 나간 포커스가 문서를 한 바퀴 돌아 시트로 되돌아오기 때문이다.
  for (let press = 1; press <= 12; press += 1) {
    await recordSheet.pressTab(1);
    expect(await recordSheet.focusInside, `${press}번째 Tab 에서 시트 밖으로 나갔다`).toBe(true);
  }
});

test.describe('일부러 실패시켰을 때', () => {
  test.use({
    // 일부러 만든 실패다. 브라우저가 그 응답을 콘솔에 적는 것이고 앱이 낸 오류가 아니다.
    consoleErrorAllowList: [/Failed to load resource.*(422|429|503)/],
  });

  test('한 건도 못 읽으면 그 사실을 말하고 다시 고를 수 있다', async ({
    home,
    page,
    recordSheet,
  }) => {
    await seedAlbumPhotos(CAPTURE_DATA_URI)(page);
    await page.route(CAPTURE_ANALYZE, (route) =>
      route.request().method() === 'POST' ? route.fulfill(EMPTY_BATCH) : route.continue(),
    );

    await home.open();
    await home.waitReady();
    expect(await albumPhotosSeeded(page)).toBe(true);

    await home.recordButton.click();
    await recordSheet.methodTab('캡처').click();
    await recordSheet.capture.pick();

    await expect(recordSheet.capture.emptyNotice).toBeVisible();
    // 저장할 것이 없으면 저장 버튼도 없어야 한다. 눌러도 아무 일이 없으면 더 헷갈린다.
    await expect(recordSheet.capture.saveButton).toHaveCount(0);

    await recordSheet.capture.restartButton.click();
    await expect(recordSheet.capture.guide).toBeVisible();
  });

  test('읽기가 실패해도 첫 화면이 남고 다시 고를 수 있다', async ({ home, page, recordSheet }) => {
    await seedAlbumPhotos(CAPTURE_DATA_URI)(page);
    await page.route(CAPTURE_ANALYZE, (route) =>
      route.request().method() === 'POST' ? route.fulfill(PARSE_DOWN) : route.continue(),
    );

    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.methodTab('캡처').click();
    await recordSheet.capture.pickButton.click();

    await expect(recordSheet.capture.pickAlert).toContainText('지금은 캡처를 읽지 못했어요');
    await expect(recordSheet.capture.guide).toBeVisible();
    await expect(recordSheet.capture.pickButton).toBeEnabled();
    // 한 자리가 실패했다고 시트가 잠겨 버리면 키패드로도 못 적는다.
    await expect(recordSheet.methodTab('키패드')).toBeEnabled();
    await expect(recordSheet.closeButton).toBeVisible();
  });

  test('하루 상한에 걸려도 키패드는 그대로 쓸 수 있다', async ({ home, page, recordSheet }) => {
    await seedAlbumPhotos(CAPTURE_DATA_URI)(page);
    await page.route(CAPTURE_ANALYZE, (route) =>
      route.request().method() === 'POST' ? route.fulfill(OVER_LIMIT) : route.continue(),
    );

    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.methodTab('캡처').click();
    await recordSheet.capture.pickButton.click();

    await expect(recordSheet.capture.pickAlert).toContainText('오늘은 캡처 분석을 충분히 썼어요');

    await recordSheet.methodTab('키패드').click();
    await recordSheet.input.enterAmount(5_000);
    await expect(recordSheet.input.amountText).toHaveText('5,000원');
  });
});
