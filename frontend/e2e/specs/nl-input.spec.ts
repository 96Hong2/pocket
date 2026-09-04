import { formatCurrency, formatDayLabel, toLedgerDate } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * 줄글로 적고, 이해한 결과를 고치고, 한 번에 저장하는 한 바퀴.
 *
 * 지금 도는 것은 실제 모델이 아니라 규칙 기반 스텁이다. 그래서 여기서 재는 것은
 * "얼마나 잘 알아듣는가" 가 아니라 "알아들은 것을 화면이 어떻게 다루는가" 다.
 * 인식 정확도는 실제 모델이 붙은 뒤에 잰다.
 *
 * 하루 상한(429)과 모델에 보내기 전에 가리는 규칙은 여기서 못 본다.
 * 그 자리는 백엔드 테스트가 지킨다.
 */

const THREE_ITEMS = '점심 12000 스벅 4500 어제 택시 9000';

function yesterday(): string {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return formatDayLabel(toLedgerDate(now));
}

function today(): string {
  return formatDayLabel(toLedgerDate(new Date()));
}

/** `2026-09-02` 모양. 날짜 입력칸이 받는 형식이다. */
function twoDaysAgoIso(): string {
  const now = new Date();
  now.setDate(now.getDate() - 2);
  return toLedgerDate(now);
}

// ── 적고 이해시키기 ──────────────────────────────

test('줄글 탭이 열려 있고, 한 줄에 적은 세 건을 따로 읽는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await expect(recordSheet.methodTab('줄글')).toBeEnabled();
  await recordSheet.methodTab('줄글').click();
  await expect(recordSheet.nl.textarea).toBeVisible();

  await recordSheet.nl.analyze(THREE_ITEMS);

  await expect(recordSheet.nl.rows).toHaveCount(3);
  await expect(recordSheet.nl.amount('점심')).toHaveText(formatCurrency(12000));
  await expect(recordSheet.nl.amount('스벅')).toHaveText(formatCurrency(4500));
  await expect(recordSheet.nl.amount('택시')).toHaveText(formatCurrency(9000));
});

test('날짜를 적은 것만 그 날로 가고 나머지는 오늘로 간다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze(THREE_ITEMS);

  await expect(recordSheet.nl.day('점심')).toHaveText(today());
  await expect(recordSheet.nl.day('스벅')).toHaveText(today());
  // '어제' 라고 적은 것만 하루 앞이다.
  await expect(recordSheet.nl.day('택시')).toHaveText(yesterday());
});

test('상호를 보고 분류를 붙인다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze(THREE_ITEMS);

  await expect(recordSheet.nl.row('점심')).toContainText('식비');
  await expect(recordSheet.nl.row('스벅')).toContainText('카페·간식');
  await expect(recordSheet.nl.row('택시')).toContainText('교통');
});

test('확신이 낮으면 확인 필요로 표시하고 스스로 켜지지 않는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('9000');

  await expect(recordSheet.nl.chip('이름 없음', '확인 필요')).toBeVisible();
  await expect(recordSheet.nl.checkbox('이름 없음')).not.toBeChecked();
  // 하나도 고르지 않았으니 저장할 수 없다. 조용히 저장되는 길이 없다.
  await expect(recordSheet.nl.saveButton).toBeDisabled();
});

test('금액을 못 읽으면 이유를 말하고 저장 버튼을 내놓지 않는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('오늘은 아무것도 안 썼다');

  await expect(recordSheet.nl.emptyNotice).toBeVisible();
  await expect(recordSheet.nl.saveButton).toHaveCount(0);
});

// ── 검토하고 고치기 ──────────────────────────────

test('저장 버튼 하나에 건수와 합계가 적히고, 선택을 바꾸면 함께 바뀐다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze(THREE_ITEMS);

  await expect(recordSheet.nl.saveButton).toHaveText(`3건 저장 · ${formatCurrency(25500)}`);

  await recordSheet.nl.toggle('스벅', false);
  await expect(recordSheet.nl.saveButton).toHaveText(`2건 저장 · ${formatCurrency(21000)}`);

  await recordSheet.nl.toggle('점심', false);
  await recordSheet.nl.toggle('택시', false);
  await expect(recordSheet.nl.saveButton).toBeDisabled();
});

test('한 건을 고치면 목록과 저장 버튼이 그 자리에서 따라온다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('점심 12000');

  await recordSheet.nl.openEdit('점심');
  await recordSheet.nl.form.merchantField.fill('김밥천국');
  await recordSheet.nl.form.amountField.fill('13000');
  await recordSheet.nl.form.categoryChip('생활').click();
  await recordSheet.nl.form.apply();

  await expect(recordSheet.nl.amount('김밥천국')).toHaveText(formatCurrency(13000));
  await expect(recordSheet.nl.row('김밥천국')).toContainText('생활');
  await expect(recordSheet.nl.saveButton).toHaveText(`1건 저장 · ${formatCurrency(13000)}`);
});

test('고치면 확인 필요 표시가 사라지고 저장 대상에 들어온다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('9000');

  await recordSheet.nl.openEdit('이름 없음');
  await recordSheet.nl.form.merchantField.fill('택시');
  await recordSheet.nl.form.apply();

  await expect(recordSheet.nl.chip('택시', '확인 필요')).toHaveCount(0);
  await expect(recordSheet.nl.checkbox('택시')).toBeChecked();
});

// ── 저장하고 나서 ────────────────────────────────

test('저장하면 고른 것만 목록과 홈 합계에 들어간다', async ({ calendar, home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze(THREE_ITEMS);

  await recordSheet.nl.toggle('스벅', false);
  await recordSheet.nl.save();
  await expect(recordSheet.nl.savedTitle).toHaveText(`2건 저장했어요 · ${formatCurrency(21000)}`);

  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  // 홈이 저장한 만큼만 올라간다. 고르지 않은 4,500원은 어디에도 없다.
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(21000));

  await calendar.open();
  await calendar.waitReady();
  // 달 합계는 어제 것까지 함께 센다. 목록은 고른 날(오늘) 것만 보여준다.
  await expect(calendar.totals.expense).toHaveText(formatCurrency(21000));
  await expect(calendar.list.row('점심')).toBeVisible();
  await expect(calendar.list.row('스벅')).toHaveCount(0);
});

test('이미 저장한 것을 다시 적으면 이미 있어요로 표시하고 켜지 않는다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('점심 12000');
  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('점심 12000');

  await expect(recordSheet.nl.chip('점심', '이미 있어요')).toBeVisible();
  await expect(recordSheet.nl.checkbox('점심')).not.toBeChecked();
});

// ── 기억하기 ────────────────────────────────────

test('분류를 바꿔 저장하면 다음번에 그 분류가 먼저 잡힌다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('올리브영 23000');
  await expect(recordSheet.nl.row('올리브영')).toContainText('건강·미용');

  await recordSheet.nl.openEdit('올리브영');
  await recordSheet.nl.form.categoryChip('생활').click();
  await recordSheet.nl.form.apply();
  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('올리브영 5000');
  await expect(recordSheet.nl.row('올리브영')).toContainText('생활');
});

test('기억한 분류를 관리 탭에서 보고 지우면 원래 분류로 돌아간다', async ({
  home,
  manage,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('올리브영 23000');
  await recordSheet.nl.openEdit('올리브영');
  await recordSheet.nl.form.categoryChip('생활').click();
  await recordSheet.nl.form.apply();
  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await manage.open();
  await manage.waitReady();
  await expect(manage.rules.row('올리브영')).toContainText('생활');

  await manage.rules.remove('올리브영');
  await expect(manage.rules.emptyTitle).toBeVisible();

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('올리브영 5000');
  await expect(recordSheet.nl.row('올리브영')).toContainText('건강·미용');
});

// ── 리뷰가 잡은 자리 ─────────────────────────────

test('만과 천을 이어 쓴 금액을 한 건으로 읽는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('커피 3만5천원');

  // 두 건으로 갈리면 뒤 조각이 저신뢰라 기본 선택에서 빠져 5,000원이 조용히 사라진다.
  await expect(recordSheet.nl.rows).toHaveCount(1);
  await expect(recordSheet.nl.amount('커피')).toHaveText(formatCurrency(35000));
  await expect(recordSheet.nl.saveButton).toHaveText(`1건 저장 · ${formatCurrency(35000)}`);
});

test('날짜를 고치면 목록의 날짜가 그대로 따라온다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('점심 12000');
  await expect(recordSheet.nl.day('점심')).toHaveText(today());

  await recordSheet.nl.openEdit('점심');
  await recordSheet.nl.form.dayField.fill(twoDaysAgoIso());
  await recordSheet.nl.form.apply();

  await expect(recordSheet.nl.day('점심')).toHaveText(formatDayLabel(twoDaysAgoIso()));
});

test('검토하다 키패드에 다녀와도 후보 목록이 남는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze(THREE_ITEMS);
  await expect(recordSheet.nl.rows).toHaveCount(3);

  await recordSheet.methodTab('키패드').click();
  await expect(recordSheet.input.amountText).toBeVisible();

  await recordSheet.methodTab('줄글').click();
  // 언마운트하면 적어 둔 줄글과 검토 목록이 통째로 사라진다.
  await expect(recordSheet.nl.rows).toHaveCount(3);
  await expect(recordSheet.nl.saveButton).toHaveText(`3건 저장 · ${formatCurrency(25500)}`);
});

test('수입이 섞이면 저장 버튼이 지출만 센다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('점심 12000 월급 2000000 입금');

  // 수입을 지출과 한 덩어리로 더하면 버튼이 실제로 쓴 돈과 다른 값을 말한다.
  await expect(recordSheet.nl.saveButton).toHaveText(`2건 저장 · ${formatCurrency(12000)}`);
});

test('환불로 읽힌 것은 스스로 켜지지 않는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('스벅 환불 40000');

  // 되돌릴 지출을 고를 자리가 없다. 대상 없이 저장하면 쓴 적 없는 돈이 예산으로 돌아온다.
  await expect(recordSheet.nl.checkbox('스벅 환불')).not.toBeChecked();
  await expect(recordSheet.nl.saveButton).toBeDisabled();
});

test('이미 저장한 것의 분류만 바꿔도 저장 대상이 되지 않는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('점심 12000');
  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await home.recordButton.click();
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('점심 12000');
  await recordSheet.nl.openEdit('점심');
  await recordSheet.nl.form.categoryChip('생활').click();
  await recordSheet.nl.form.apply();

  await expect(recordSheet.nl.chip('점심', '이미 있어요')).toBeVisible();
  await expect(recordSheet.nl.checkbox('점심')).not.toBeChecked();
});
