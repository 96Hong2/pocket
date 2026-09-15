import type { HomeScreen } from '../screens/HomeScreen';
import type { RecordSheet } from '../screens/RecordSheet';
import { logsNamed } from '../support/aitMock';
import {
  CANCELLED_SHOT,
  CAPTURE_DATA_URI,
  cameraPermissionDenied,
  denyCameraPermission,
  mockImagesSeeded,
  seedMockImages,
} from '../support/deviceMock';
import { expect, test } from '../support/fixtures';

/**
 * 사진과 줄글로 적을 때 **무엇이 로그로 남는가.**
 *
 * 출시하고 제일 먼저 볼 숫자가 「방식별 완료율」과 「저장까지 시간」인데, 그 숫자는 화면이
 * 아니라 로그에서 나온다. 화면을 고치다 로그 한 줄을 끊어도 다른 spec 은 전부 초록이라
 * 지표가 통째로 빈 것을 출시한 뒤에야 알게 된다. 그 자리를 여기서 못 박는다.
 *
 * 특히 사진 쪽은 갈래마다 다른 값이 남아야 한다. 취소·권한 거절·한 건도 못 읽음이
 * 한 덩어리로 뭉개지면 카메라가 문제인지 읽는 쪽이 문제인지 가릴 수 없다.
 *
 * 로그 사본은 개발·샌드박스에서만 창에 쌓인다. 운영 판에서는 토스 수집기로만 간다.
 * 같은 일을 두 번 적는 판이 있으므로 **줄 수를 세지 않고 값의 집합**을 본다.
 */

const RECEIPT_ANALYZE = '**/api/v1/imports/receipt';

/** 한 번에 검토 화면에 올리는 상한. 줄글도 사진도 서버에서 같은 자리를 지난다. */
const CANDIDATE_LIMIT = 20;

/** 한 건도 못 읽은 묶음. 서버가 주는 모양 그대로다. */
const EMPTY_BATCH = {
  status: 201,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  body: JSON.stringify({
    id: '00000000-0000-4000-8000-000000000003',
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

interface LogLine {
  params: Record<string, string | number | boolean | undefined>;
}

/** 그 칸에 적힌 값들. 같은 일이 두 번 적혀도 하나로 센다. */
function valuesOf(logs: LogLine[], key: string): Set<string | number | boolean | undefined> {
  return new Set(logs.map((log) => log.params[key]));
}

/** 홈에서 기록 시트를 열고 그 방식 탭까지 간다. */
async function openMethod(
  home: HomeScreen,
  recordSheet: RecordSheet,
  method: '줄글' | '캡처' | '영수증',
): Promise<void> {
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab(method).click();
}

// ── 사진을 가져오는 자리 ────────────────────────

test('촬영을 취소하면 취소로 남고 읽기 로그는 생기지 않는다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CANCELLED_SHOT)(page);

  await home.open();
  await home.waitReady();
  expect(await mockImagesSeeded(page)).toBe(true);

  await openMethod(home, recordSheet, '영수증');
  await recordSheet.receipt.pickButton.click();

  // 화면은 아무 말도 안 하는 것이 맞다. 그래서 무슨 일이 있었는지는 로그로만 알 수 있다.
  await expect(recordSheet.receipt.guide).toBeVisible();
  await expect(recordSheet.receipt.pickAlert).toHaveCount(0);

  await expect
    .poll(async () => valuesOf(await logsNamed(page, 'image_pick_result'), 'result'))
    .toEqual(new Set(['cancelled']));
  expect(valuesOf(await logsNamed(page, 'image_pick_result'), 'method')).toEqual(
    new Set(['receipt']),
  );

  // 읽지도 않은 것이 읽기 시도로 세이면 영수증 완료율의 분모가 부풀려진다.
  expect(await logsNamed(page, 'parse_started')).toHaveLength(0);
  expect(await logsNamed(page, 'parse_finished')).toHaveLength(0);
});

test('카메라 접근이 꺼져 있으면 거절로 남는다', async ({ home, page, recordSheet }) => {
  await denyCameraPermission()(page);

  await home.open();
  await home.waitReady();
  expect(await cameraPermissionDenied(page)).toBe(true);

  await openMethod(home, recordSheet, '영수증');
  await recordSheet.receipt.pickButton.click();
  await expect(recordSheet.receipt.permissionDenied).toBeVisible();

  /*
    거절을 취소와 같은 값으로 적으면 둘이 한 덩어리가 된다. 취소는 사람이 마음을 바꾼 것이고
    거절은 앱이 막힌 것이라, 고칠 것이 있는 쪽은 거절뿐이다.
  */
  await expect
    .poll(async () => valuesOf(await logsNamed(page, 'image_pick_result'), 'result'))
    .toEqual(new Set(['denied']));
});

test('한 건도 못 읽어도 사진은 가져왔다고 따로 남는다', async ({ home, page, recordSheet }) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await page.route(RECEIPT_ANALYZE, (route) =>
    route.request().method() === 'POST' ? route.fulfill(EMPTY_BATCH) : route.continue(),
  );

  await home.open();
  await home.waitReady();
  expect(await mockImagesSeeded(page)).toBe(true);

  await openMethod(home, recordSheet, '영수증');
  await recordSheet.receipt.pick();
  await expect(recordSheet.receipt.emptyNotice).toBeVisible();

  // 찍기까지는 잘 됐다. 이 둘을 갈라 놔야 카메라가 문제인지 읽는 쪽이 문제인지 가른다.
  expect(valuesOf(await logsNamed(page, 'image_pick_result'), 'result')).toEqual(new Set(['ok']));

  const parses = await logsNamed(page, 'parse_finished');
  expect(valuesOf(parses, 'result')).toEqual(new Set(['empty']));
  expect(valuesOf(parses, 'candidate_count')).toEqual(new Set([0]));
});

// ── 저장까지 간 한 흐름 ─────────────────────────

test('캡처로 저장까지 가면 고르기·읽기·저장이 한 흐름으로 이어진다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);

  await home.open();
  await home.waitReady();
  expect(await mockImagesSeeded(page)).toBe(true);

  await openMethod(home, recordSheet, '캡처');
  await recordSheet.capture.pick();
  await recordSheet.capture.save();
  await expect(recordSheet.capture.savedTitle).toBeVisible();

  const picks = await logsNamed(page, 'image_pick_result');
  const parses = await logsNamed(page, 'parse_finished');
  const saves = await logsNamed(page, 'save_result');

  await test.step('세 자리 모두 캡처의 결과를 말한다', async () => {
    expect(valuesOf(picks, 'result')).toEqual(new Set(['ok']));
    expect(valuesOf(parses, 'result')).toEqual(new Set(['ok']));
    expect(valuesOf(saves, 'result')).toEqual(new Set(['ok']));
    expect(valuesOf([...picks, ...parses, ...saves], 'method')).toEqual(new Set(['capture']));
  });

  await test.step('얼마나 기다렸는지가 읽기와 저장 양쪽에 남는다', async () => {
    // 서버 로그로는 사용자가 실제로 기다린 시간을 알 수 없다. 여기가 「저장까지 시간」의 출처다.
    for (const log of [...parses, ...saves]) {
      expect(
        Number(log.params.elapsed_ms),
        `걸린 시간이 비어 있다: ${JSON.stringify(log.params)}`,
      ).toBeGreaterThanOrEqual(0);
    }
  });

  await test.step('셋이 같은 흐름으로 묶인다', async () => {
    // 갈리면 「고른 사람 중 저장까지 간 비율」을 이어 붙일 수 없다.
    const flows = valuesOf([...picks, ...parses, ...saves], 'flow_id');
    expect(flows.size, '한 번 기록했는데 흐름이 여럿으로 갈렸다').toBe(1);
    expect([...flows][0], '흐름 값이 비어 있다').toBeTruthy();
  });
});

// ── 화면이 한 말과 로그가 같은가 ────────────────

test('줄글도 상한에 걸리면 온전한 성공이 아니라고 남는다', async ({ home, page, recordSheet }) => {
  const lines = CANDIDATE_LIMIT + 1;
  const dropped = lines - CANDIDATE_LIMIT;
  const text = Array.from(
    { length: lines },
    (_, index) => `커피${String(index + 1).padStart(2, '0')} 1000`,
  ).join('\n');

  await home.open();
  await home.waitReady();
  await openMethod(home, recordSheet, '줄글');
  await recordSheet.nl.analyze(text);

  // 화면은 사람에게 몇 건을 못 넣었는지 분명히 말한다.
  await expect(recordSheet.nl.rows).toHaveCount(CANDIDATE_LIMIT);
  await expect(recordSheet.nl.truncatedNotice).toHaveText(
    `한 번에 ${CANDIDATE_LIMIT}건까지만 읽어요. ${dropped}건은 다음에 나눠서 적어 주세요`,
  );

  /*
    같은 상황에서 캡처는 'partial' 을 남긴다. 줄글만 온전한 성공으로 적히면
    「줄글에 몇 줄까지 적게 할 것인가」를 로그로 정할 수 없다.
    화면이 사람에게 한 말과 로그가 같은 말을 해야 한다.
  */
  const parses = await logsNamed(page, 'parse_finished');
  expect(valuesOf(parses, 'result')).toEqual(new Set(['partial']));
  expect(valuesOf(parses, 'candidate_count')).toEqual(new Set([CANDIDATE_LIMIT]));
});
