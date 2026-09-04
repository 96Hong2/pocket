import { formatCurrency } from '../../src/shared/lib/format';
import type { HomeScreen } from '../screens/HomeScreen';
import type { RecordSheet } from '../screens/RecordSheet';
import { expect, test } from '../support/fixtures';

/**
 * 줄글 입력의 경계.
 *
 * 한 바퀴가 도는 것은 `nl-input.spec.ts` 가 지킨다. 여기서 보는 것은 그 바퀴가
 * 어긋나는 자리다. 켠 뒤에 고치는 순서, 상한을 넘긴 입력, 요청이 도는 중의 잠금,
 * 그리고 한 자리가 실패했을 때 나머지가 살아남는지.
 */

const THREE_ITEMS = '점심 12000 스벅 4500 어제 택시 9000';

/** 한 번에 검토 화면에 올리는 상한. */
const CANDIDATE_LIMIT = 20;

const TEXT_ANALYZE = '**/api/v1/imports/text';
const CANDIDATE_PATCH = '**/api/v1/imports/*/candidates/*';
const CATEGORIES = '**/api/v1/categories*';

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
  '지금은 문장을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.',
);
const PATCH_REJECTED = envelope(422, 'INVALID_REQUEST', '고친 내용을 저장하지 못했어요.');
const OVER_LIMIT = envelope(
  429,
  'USAGE_LIMIT',
  '오늘은 줄글 분석을 충분히 썼어요. 키패드로는 계속 기록할 수 있어요.',
);
const CATEGORIES_DOWN = envelope(422, 'INVALID_REQUEST', '');

/** 홈에서 기록 시트를 열고 줄글 탭까지 간다. 시트를 다시 열면 탭이 키패드로 돌아온다. */
async function openNlTab(home: HomeScreen, recordSheet: RecordSheet): Promise<void> {
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('줄글').click();
  await expect(recordSheet.nl.textarea).toBeVisible();
}

// ── 켜고 나서 고치는 순서 ────────────────────────

test('고쳐서 이미 저장한 것과 같아지면 체크가 꺼지고 저장 버튼이 잠긴다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await openNlTab(home, recordSheet);
  await recordSheet.nl.analyze('점심 12000');
  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  // 켜진 채로 시작해서 고치는 도중에 중복이 되는 순서. 처음부터 중복인 것과 길이 다르다.
  await openNlTab(home, recordSheet);
  await recordSheet.nl.analyze('커피 5000');
  await expect(recordSheet.nl.checkbox('커피')).toBeChecked();

  await recordSheet.nl.openEdit('커피');
  await recordSheet.nl.form.merchantField.fill('점심');
  await recordSheet.nl.form.amountField.fill('12000');
  await recordSheet.nl.form.apply();

  await expect(recordSheet.nl.chip('점심', '이미 있어요')).toBeVisible();
  // '이미 있어요' 를 붙여 놓고 저장까지 되면 같은 거래가 두 번 남는다.
  await expect(recordSheet.nl.checkbox('점심')).not.toBeChecked();
  await expect(recordSheet.nl.saveButton).toBeDisabled();
});

test('중복이던 줄을 다른 금액으로 고치면 칩이 사라지고 저장 대상이 된다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await openNlTab(home, recordSheet);
  await recordSheet.nl.analyze('점심 12000');
  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await openNlTab(home, recordSheet);
  await recordSheet.nl.analyze('점심 12000');
  await expect(recordSheet.nl.chip('점심', '이미 있어요')).toBeVisible();

  await recordSheet.nl.openEdit('점심');
  await recordSheet.nl.form.amountField.fill('13000');
  await recordSheet.nl.form.apply();

  // 금액만 다른 정상 기록이 꺼진 채로 남으면 매번 손으로 켜야 한다.
  await expect(recordSheet.nl.chip('점심', '이미 있어요')).toHaveCount(0);
  await expect(recordSheet.nl.checkbox('점심')).toBeChecked();
  await expect(recordSheet.nl.saveButton).toHaveText(`1건 저장 · ${formatCurrency(13000)}`);
});

// ── 두 화면이 같은 숫자를 말하나 ─────────────────

test('저장 결과의 합계가 저장 버튼과 같은 지출 금액을 말한다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await openNlTab(home, recordSheet);
  await recordSheet.nl.analyze('점심 12000 월급 2000000 입금');

  await expect(recordSheet.nl.saveButton).toHaveText(`2건 저장 · ${formatCurrency(12000)}`);
  await recordSheet.nl.save();

  // 버튼에서 12,000원을 보고 누른 사람에게 결과가 다른 숫자를 말하면 어느 쪽이 참인지 알 수 없다.
  await expect(recordSheet.nl.savedTitle).toHaveText(`2건 저장했어요 · ${formatCurrency(12000)}`);
});

// ── 상한 ────────────────────────────────────────

test('스무 건을 넘겨 적으면 빠진 건수를 알려 준다', async ({ home, recordSheet }) => {
  const lines = CANDIDATE_LIMIT + 1;
  const dropped = lines - CANDIDATE_LIMIT;
  const text = Array.from(
    { length: lines },
    (_, index) => `커피${String(index + 1).padStart(2, '0')} 1000`,
  ).join('\n');

  await home.open();
  await home.waitReady();
  await openNlTab(home, recordSheet);
  await recordSheet.nl.analyze(text);

  await expect(recordSheet.nl.rows).toHaveCount(CANDIDATE_LIMIT);
  // 넘친 건이 말없이 사라지면 사용자는 몇 건을 잃었는지 모른 채 넘어간다.
  // 부분일치로 보면 21건을 '1건' 이라 적어도 통과한다. 문구 전체를 못 박는다.
  await expect(recordSheet.nl.truncatedNotice).toHaveText(
    `한 번에 ${CANDIDATE_LIMIT}건까지만 읽어요. ${dropped}건은 다음에 나눠서 적어 주세요`,
  );
});

// ── 도는 동안의 잠금 ────────────────────────────

test('분석이 도는 동안 탭도 닫기도 잠긴다', async ({ home, page, recordSheet }) => {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(TEXT_ANALYZE, async (route) => {
    if (route.request().method() === 'POST') await held;
    await route.continue();
  });

  await home.open();
  await home.waitReady();
  await openNlTab(home, recordSheet);
  await recordSheet.nl.textarea.fill('점심 12000');
  await recordSheet.nl.analyzeButton.click();

  await expect(recordSheet.nl.analyzing).toBeVisible();
  // 결과가 돌아올 자리를 없애면 하루 상한만 깎고 얻은 것이 사라진다.
  await expect(recordSheet.methodTab('키패드')).toBeDisabled();
  await expect(recordSheet.closeButton).toHaveCount(0);
  await recordSheet.closeByEsc();
  await recordSheet.waitOpen();

  release();

  await expect(recordSheet.nl.readLine).toBeVisible();
  await expect(recordSheet.nl.analyzing).toHaveCount(0);
  await expect(recordSheet.methodTab('키패드')).toBeEnabled();
  await expect(recordSheet.closeButton).toBeVisible();
});

// ── 한 자리가 실패했을 때 ───────────────────────

test.describe('일부러 실패시켰을 때', () => {
  test.use({
    // 일부러 만든 실패다. 브라우저가 그 응답을 콘솔에 적는 것이고 앱이 낸 오류가 아니다.
    consoleErrorAllowList: [/Failed to load resource.*(422|429|503)/],
  });

  test('분석이 실패해도 적어 둔 글이 남는다', async ({ home, page, recordSheet }) => {
    await page.route(TEXT_ANALYZE, (route) =>
      route.request().method() === 'POST' ? route.fulfill(PARSE_DOWN) : route.continue(),
    );

    await home.open();
    await home.waitReady();
    await openNlTab(home, recordSheet);
    await recordSheet.nl.textarea.fill(THREE_ITEMS);
    await recordSheet.nl.analyzeButton.click();

    await expect(recordSheet.nl.notice).toContainText('지금은 문장을 읽지 못했어요');
    // 길게 적은 문장까지 지우면 사용자는 처음부터 다시 적어야 한다.
    await expect(recordSheet.nl.textarea).toHaveValue(THREE_ITEMS);
    await expect(recordSheet.nl.analyzeButton).toBeEnabled();
    await expect(recordSheet.methodTab('키패드')).toBeEnabled();
    await expect(recordSheet.closeButton).toBeVisible();
  });

  test('고치기가 실패해도 검토 목록과 잠금이 되돌아온다', async ({ home, page, recordSheet }) => {
    await home.open();
    await home.waitReady();
    await openNlTab(home, recordSheet);
    await recordSheet.nl.analyze('점심 12000');

    await page.route(CANDIDATE_PATCH, (route) =>
      route.request().method() === 'PATCH' ? route.fulfill(PATCH_REJECTED) : route.continue(),
    );
    await recordSheet.nl.openEdit('점심');
    await recordSheet.nl.form.amountField.fill('13000');
    await recordSheet.nl.form.doneButton.click();

    await expect(recordSheet.nl.notice).toContainText('고친 내용을 저장하지 못했어요');
    // 한 줄을 못 고쳤다고 검토하던 것이 통째로 사라지면 분석 한 번이 날아간다.
    await expect(recordSheet.nl.rows).toHaveCount(1);
    await expect(recordSheet.nl.saveButton).toHaveText(`1건 저장 · ${formatCurrency(12000)}`);
    await expect(recordSheet.nl.form.doneButton).toBeVisible();
    // 잠금이 안 풀리면 시트를 닫을 길이 영영 없다.
    await expect(recordSheet.methodTab('키패드')).toBeEnabled();
    await expect(recordSheet.closeButton).toBeVisible();
  });

  test('환불을 손으로 켜서 저장하면 이유를 말하고 후보를 지킨다', async ({ home, recordSheet }) => {
    await home.open();
    await home.waitReady();
    await openNlTab(home, recordSheet);
    await recordSheet.nl.analyze('스벅 환불 40000');

    // 스스로 켜지지는 않지만 손으로 켜는 길은 열려 있다. 눌리는 저장 버튼이 실제로 만들어진다.
    await recordSheet.nl.toggle('스벅 환불', true);
    await expect(recordSheet.nl.saveButton).toBeEnabled();
    await recordSheet.nl.saveButton.click();

    await expect(recordSheet.nl.notice).toContainText('원래 지출');
    await expect(recordSheet.nl.rows).toHaveCount(1);
    await expect(recordSheet.nl.savedTitle).toHaveCount(0);
  });

  test('분류를 못 불러와도 검토와 저장은 이어진다', async ({ home, page, recordSheet }) => {
    await page.route(CATEGORIES, (route) =>
      route.request().method() === 'GET' ? route.fulfill(CATEGORIES_DOWN) : route.continue(),
    );

    await home.open();
    await home.waitReady();
    await openNlTab(home, recordSheet);
    await recordSheet.nl.analyze(THREE_ITEMS);

    await expect(recordSheet.nl.categoriesError).toBeVisible();
    // 분류 이름은 표시에만 쓴다. 이것 때문에 검토 결과까지 버리면 상한만 깎고 끝난다.
    await expect(recordSheet.nl.rows).toHaveCount(3);
    await expect(recordSheet.nl.row('점심')).toContainText('분류 없음');
    await expect(recordSheet.nl.saveButton).toHaveText(`3건 저장 · ${formatCurrency(25500)}`);
  });

  test('줄글 분석이 막혀도 키패드 기록은 그대로 된다', async ({ home, page, recordSheet }) => {
    await page.route(TEXT_ANALYZE, (route) =>
      route.request().method() === 'POST' ? route.fulfill(OVER_LIMIT) : route.continue(),
    );

    await home.open();
    await home.waitReady();
    await openNlTab(home, recordSheet);
    await recordSheet.nl.textarea.fill('점심 12000');
    await recordSheet.nl.analyzeButton.click();

    await expect(recordSheet.nl.notice).toContainText('오늘은 줄글 분석을 충분히 썼어요');

    // 상한이 앱을 통째로 막으면 안 된다는 것이 이 기능의 전제다.
    await recordSheet.methodTab('키패드').click();
    await recordSheet.input.enterAmount(4500);
    await recordSheet.input.pickCategory('식비');
    await recordSheet.feedback.waitSaved();
  });
});
