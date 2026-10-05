import { formatCurrency, formatDayLabel, toLedgerDate } from '../../src/shared/lib/format';
import { logsNamed } from '../support/aitMock';
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
  await recordSheet.chooseWay('줄글');
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
  await recordSheet.chooseWay('줄글');
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
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze(THREE_ITEMS);

  await expect(recordSheet.nl.row('점심')).toContainText('식비');
  await expect(recordSheet.nl.row('스벅')).toContainText('카페·간식');
  await expect(recordSheet.nl.row('택시')).toContainText('교통');
});

test('확신이 낮으면 확인 필요로 표시하고 스스로 켜지지 않는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('9000');

  await expect(recordSheet.nl.chip('기록', '확인 필요')).toBeVisible();
  await expect(recordSheet.nl.checkbox('기록')).not.toBeChecked();
  // 하나도 고르지 않았으니 저장할 수 없다. 조용히 저장되는 길이 없다.
  await expect(recordSheet.nl.saveButton).toBeDisabled();
});

test('금액을 못 읽으면 이유를 말하고 저장 버튼을 내놓지 않는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('오늘은 아무것도 안 썼다');

  await expect(recordSheet.nl.emptyNotice).toBeVisible();
  await expect(recordSheet.nl.saveButton).toHaveCount(0);
});

// ── 검토하고 고치기 ──────────────────────────────

/**
 * 고치는 자리는 줄 자체다.
 *
 * 예전에는 메타 줄 끝의 작은 「고치기」 하나뿐이라, 고치려는 사람이 그 자리를 먼저 찾아야
 * 했다. 지금은 이름·금액이 있는 자리를 그냥 누르면 펼쳐진다. 저장 대상 선택은 그대로 둔다.
 * 같은 자리에서 두 가지가 함께 바뀌면 무엇을 눌렀는지 사용자가 알 수 없다.
 */
test('후보 줄을 누르면 고치기가 펼쳐지고, 저장 대상 선택은 그대로다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('점심 12000');

  await expect(recordSheet.nl.checkbox('점심')).toBeChecked();

  await recordSheet.nl.editTrigger('점심').click();

  await expect(recordSheet.nl.form.merchantField).toBeVisible();
  await expect(recordSheet.nl.checkbox('점심')).toBeChecked();

  // 같은 자리를 다시 누르면 접힌다. 접는 버튼을 따로 찾지 않아도 된다.
  await recordSheet.nl.editTrigger('점심').click();
  await expect(recordSheet.nl.form.merchantField).toHaveCount(0);
});

test('저장 버튼 하나에 건수와 합계가 적히고, 선택을 바꾸면 함께 바뀐다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
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
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('점심 12000');

  await recordSheet.nl.openEdit('점심');
  await recordSheet.nl.form.merchantField.fill('김밥천국');
  await recordSheet.nl.form.amountField.fill('13000');
  await recordSheet.nl.form.pickCategory('생활');
  await recordSheet.nl.form.apply();

  await expect(recordSheet.nl.amount('김밥천국')).toHaveText(formatCurrency(13000));
  await expect(recordSheet.nl.row('김밥천국')).toContainText('생활');
  await expect(recordSheet.nl.saveButton).toHaveText(`1건 저장 · ${formatCurrency(13000)}`);
});

test('고치면 확인 필요 표시가 사라지고 저장 대상에 들어온다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('9000');

  await recordSheet.nl.openEdit('기록');
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
  await recordSheet.chooseWay('줄글');
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
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('점심 12000');
  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('점심 12000');

  await expect(recordSheet.nl.chip('점심', '이미 있어요')).toBeVisible();
  await expect(recordSheet.nl.checkbox('점심')).not.toBeChecked();
});

// ── 기억하기 ────────────────────────────────────

test('분류를 바꿔 저장하면 다음번에 그 분류가 먼저 잡힌다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('올리브영 23000');
  await expect(recordSheet.nl.row('올리브영')).toContainText('건강·미용');

  await recordSheet.nl.openEdit('올리브영');
  await recordSheet.nl.form.pickCategory('생활');
  await recordSheet.nl.form.apply();
  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('올리브영 5000');
  await expect(recordSheet.nl.row('올리브영')).toContainText('생활');
});

test('기억한 분류를 카테고리 관리에서 보고 지우면 원래 분류로 돌아간다', async ({
  categories,
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('올리브영 23000');
  await recordSheet.nl.openEdit('올리브영');
  await recordSheet.nl.form.pickCategory('생활');
  await recordSheet.nl.form.apply();
  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await categories.open();
  await categories.waitReady();
  await expect(categories.rules.row('올리브영')).toContainText('생활');

  await categories.rules.remove('올리브영');
  await expect(categories.rules.emptyTitle).toBeVisible();

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('올리브영 5000');
  await expect(recordSheet.nl.row('올리브영')).toContainText('건강·미용');
});

// ── 리뷰가 잡은 자리 ─────────────────────────────

test('만과 천을 이어 쓴 금액을 한 건으로 읽는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
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
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('점심 12000');
  await expect(recordSheet.nl.day('점심')).toHaveText(today());

  await recordSheet.nl.openEdit('점심');
  await recordSheet.nl.form.setDay(twoDaysAgoIso());
  await recordSheet.nl.form.apply();

  await expect(recordSheet.nl.day('점심')).toHaveText(formatDayLabel(twoDaysAgoIso()));
});

test('검토하다 ‹ 를 누르면 읽어 온 건수를 말하며 묻고, 머물면 후보 목록이 그대로 남는다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze(THREE_ITEMS);
  await expect(recordSheet.nl.rows).toHaveCount(3);

  // 읽어 온 것을 두고 첫 화면으로 가면 그 목록을 버리게 된다. 말없이 버리지 않고 한 번 묻는다.
  await recordSheet.back();
  await expect(recordSheet.panelLeave.text).toHaveText('읽어 온 3건이 사라져요');
  await recordSheet.panelLeave.stayButton.click();

  // 머물렀으면 목록이 통째로 남는다.
  await expect(recordSheet.nl.rows).toHaveCount(3);
  await expect(recordSheet.nl.saveButton).toHaveText(`3건 저장 · ${formatCurrency(25500)}`);

  // 「나가기」 를 고르면 그 패널만 비우고 첫 화면으로 간다. 시트는 남는다.
  await recordSheet.back();
  await recordSheet.panelLeave.leaveButton.click();
  await expect(recordSheet.wayGroup).toBeVisible();
  await recordSheet.chooseWay('줄글');
  await expect(recordSheet.nl.rows).toHaveCount(0);
  await expect(recordSheet.nl.textarea).toHaveValue('');
});

test('수입이 섞이면 저장 버튼이 지출만 센다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('점심 12000 월급 2000000 입금');

  // 수입을 지출과 한 덩어리로 더하면 버튼이 실제로 쓴 돈과 다른 값을 말한다.
  await expect(recordSheet.nl.saveButton).toHaveText(`2건 저장 · ${formatCurrency(12000)}`);
});

/**
 * 읽어 온 종류를 줄에서 바로 고친다.
 *
 * 사진과 문장에서 가장 자주 틀리는 값이 종류인데, 예전에는 '고치기' 를 펴야만 보였다.
 * 그래서 줄 위로 꺼냈다. 화면 글자만 바뀌고 값이 안 바뀌면 아래 저장 버튼이 그대로 남는다.
 */
test('읽어 온 종류를 줄에서 한 번 눌러 바꾼다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('점심 12000 월급 2000000 입금');

  await expect(recordSheet.nl.kindButton('점심')).toHaveText(/지출/);
  await expect(recordSheet.nl.saveButton).toHaveText(`2건 저장 · ${formatCurrency(12000)}`);

  await recordSheet.nl.switchKind('점심');

  await expect(recordSheet.nl.kindButton('점심')).toHaveText(/수입/);
  // 붙어 있던 지출 분류가 함께 떨어진다. 남겨 두면 수입 줄에 '식비' 가 붙는다.
  await expect(recordSheet.nl.row('점심')).toContainText('분류 없음');
  // 쓴 돈이 아니게 됐으니 버튼에서 금액이 통째로 빠진다.
  await expect(recordSheet.nl.saveButton).toHaveText('2건 저장');
});

test('환불로 읽힌 것은 스스로 켜지지 않는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('스벅 환불 40000');

  // 되돌릴 지출을 고를 자리가 없다. 대상 없이 저장하면 쓴 적 없는 돈이 예산으로 돌아온다.
  await expect(recordSheet.nl.checkbox('스벅 환불')).not.toBeChecked();
  await expect(recordSheet.nl.saveButton).toBeDisabled();
});

test('이미 저장한 것의 분류만 바꿔도 저장 대상이 되지 않는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('점심 12000');
  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('점심 12000');
  await recordSheet.nl.openEdit('점심');
  await recordSheet.nl.form.pickCategory('생활');
  await recordSheet.nl.form.apply();

  await expect(recordSheet.nl.chip('점심', '이미 있어요')).toBeVisible();
  await expect(recordSheet.nl.checkbox('점심')).not.toBeChecked();
});

/**
 * **적은 것이 저장돼야 한다.**
 *
 * 펼친 줄의 값은 줄 끝 버튼을 눌러야만 서버로 갔다. 그래서 상호를 고치고 곧바로
 * 아래 저장을 누르면 적은 것이 통째로 버려졌다. 사용자가 실기기에서 겪은 일이다.
 * 줄 끝 「완료」를 **일부러 안 누르고** 저장하는 것이 이 테스트의 전부다.
 */
test('상호를 고치고 바로 저장해도 고친 이름으로 들어간다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('점심 12000');

  await recordSheet.nl.openEdit('점심');
  await recordSheet.nl.form.merchantField.fill('토끼 키링');

  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await home.waitReady();
  await expect(home.today.row('토끼 키링')).toBeVisible();
  await expect(home.today.row('점심')).toHaveCount(0);
});

test('줄을 접기만 해도 적어 둔 상호가 남는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('점심 12000');

  await recordSheet.nl.openEdit('점심');
  await recordSheet.nl.form.merchantField.fill('토끼 키링');
  // 「완료」가 아니라 줄 머리를 다시 눌러 접는다.
  await recordSheet.nl.editTrigger('점심').click();

  await expect(recordSheet.nl.checkbox('토끼 키링')).toBeVisible();
});

// ── 날짜·분류 칩 ─────────────────────────────────

/*
  펼친 폼에는 상호·금액·종류·결제 수단만 선다. 날짜와 분류는 머리 아래 칩을 눌러야 열린다.
  폼이 짧아야 펼치자마자 「완료」 가 보이고, 위에서 분류만 누르고 넘어가도 고친 것이 남는다.
*/
test('분류 칩을 눌러 고르면 격자가 닫히고 그 분류로 저장된다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('점심 12000');

  await recordSheet.nl.openEdit('점심');
  // 날짜 칸과 분류 격자는 기본으로 닫혀 있다.
  await expect(recordSheet.nl.form.dayField).toHaveCount(0);
  await expect(recordSheet.nl.form.categoryGroup).toHaveCount(0);

  await recordSheet.nl.form.categoryButton.click();
  await expect(recordSheet.nl.form.categoryGroup).toBeVisible();
  // 잠깐 열어 하나 고르는 자리라 관리 안내는 없다.
  await expect(
    recordSheet.nl.form.categoryGroup.getByText('카테고리 관리', { exact: false }),
  ).toHaveCount(0);
  await recordSheet.nl.form.categoryChip('생활').click();

  await expect(recordSheet.nl.form.categoryGroup).toHaveCount(0);
  await expect(recordSheet.nl.form.categoryButton).toHaveAccessibleName('분류 생활, 바꾸기');

  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await home.waitReady();
  await expect(home.today.row('점심')).toBeVisible();
  // 상호가 제목을 가져간 줄은 분류 이름이 제목 아래로 내려간다.
  await expect(home.today.subtitle('생활')).toBeVisible();
});

test('날짜 칩을 눌러 바꾸면 그 날로 저장된다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('점심 12000');

  // 접힌 줄의 날짜 칩을 누르면 줄이 펴지며 날짜 칸이 바로 열린다.
  await recordSheet.nl.day('점심').click();
  await expect(recordSheet.nl.form.dayField).toBeVisible();
  await expect(recordSheet.nl.form.doneButton).toBeVisible();

  await recordSheet.nl.form.dayField.fill(twoDaysAgoIso());
  // 고르면 칸이 닫히고 칩 글자가 바뀐다.
  await expect(recordSheet.nl.form.dayField).toHaveCount(0);
  await expect(recordSheet.nl.form.dayChip).toHaveText(formatDayLabel(twoDaysAgoIso()));

  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  // 홈은 방금 적은 날로 옮겨 가 있다.
  await home.waitReady();
  await expect(home.today.title).toHaveText(formatDayLabel(twoDaysAgoIso()));
  await expect(home.today.row('점심')).toBeVisible();
});

test('분류만 바꾸고 다른 줄을 펴도 바꾼 분류가 남는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze(THREE_ITEMS);
  await expect(recordSheet.nl.rows).toHaveCount(3);

  // 접힌 줄의 분류 칩을 누르면 줄이 펴지며 격자가 바로 열린다.
  await recordSheet.nl.categoryButton('점심').click();
  await expect(recordSheet.nl.form.categoryGroup).toBeVisible();
  await recordSheet.nl.form.categoryChip('생활').click();

  // 「완료」 를 안 누르고 다른 줄로 간다.
  await recordSheet.nl.editTrigger('택시').click();
  await expect(recordSheet.nl.form.merchantField).toHaveValue('택시');

  await expect(recordSheet.nl.categoryButton('점심')).toHaveAccessibleName('분류 생활, 바꾸기');
});

test('펼친 줄이 좁은 화면에서도 스크롤 없이 「완료」 까지 보인다', async ({
  home,
  page,
  recordSheet,
}) => {
  // 토스 웹뷰 실측 크기다(아이폰 390pt 폭에서 상태줄과 토스 머리줄을 뺀 높이).
  await page.setViewportSize({ width: 390, height: 746 });
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze(THREE_ITEMS);
  await expect(recordSheet.nl.rows).toHaveCount(3);

  // 맨 위 줄과 맨 아래 줄 둘 다 본다. 아래 줄은 더 올라갈 자리가 없어 바닥 저장 줄 바로 위에 선다.
  for (const name of ['점심', '택시']) {
    await recordSheet.nl.openEdit(name);
    const done = recordSheet.nl.form.doneButton;
    // 펼친 줄이 맨 위로 부드럽게 올라간다. 멈출 때까지 기다린 뒤 잰다.
    await expect(async () => {
      const before = await done.boundingBox();
      await page.waitForTimeout(120);
      const after = await done.boundingBox();
      expect(before?.y).toBe(after?.y);
    }).toPass();

    const box = await done.boundingBox();
    // 바닥에 붙은 저장 줄(취소 · N건 저장). 버튼이 아니라 바탕을 깐 줄 전체가 가린다.
    const foot = await recordSheet.nl.saveButton.locator('xpath=..').boundingBox();
    expect(box, '「완료」 가 그려지지 않았다').not.toBeNull();
    expect(foot, '바닥 저장 줄이 그려지지 않았다').not.toBeNull();
    expect(box!.y, `${name}: 「완료」 가 화면 위로 밀려났다`).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height, `${name}: 「완료」 가 바닥 저장 줄에 가렸다`).toBeLessThanOrEqual(
      foot!.y,
    );
    await expect(done).toBeInViewport({ ratio: 1 });
    await recordSheet.nl.form.apply();
  }
});

test('펼친 줄을 맨 위로 올려도 윗변이 시트 손잡이 밑에 들어가지 않는다', async ({
  home,
  page,
  recordSheet,
}) => {
  await page.setViewportSize({ width: 390, height: 746 });
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('점심 12000 커피 4500 택시 9000 약국 7000 빵집 3000 문구 2000');
  await expect(recordSheet.nl.rows).toHaveCount(6);

  // 둘째 줄은 아래 줄이 넉넉해 끝까지 끌어올려진다. 윗변이 손잡이에 붙는지는 그 자리에서만 보인다.
  const row = recordSheet.nl.rows.nth(1);
  await row.getByRole('button', { name: /눌러서 고치기$/ }).click();
  await expect(recordSheet.nl.form.doneButton).toBeVisible();
  await expect(async () => {
    const before = await row.boundingBox();
    await page.waitForTimeout(120);
    const after = await row.boundingBox();
    expect(before?.y).toBe(after?.y);
  }).toPass();

  const handle = await recordSheet.closeButton.boundingBox();
  const top = await row.boundingBox();
  expect(handle, '손잡이가 그려지지 않았다').not.toBeNull();
  expect(top, '펼친 줄이 그려지지 않았다').not.toBeNull();
  const gap = top!.y - (handle!.y + handle!.height);
  // 테두리와 둥근 모서리가 손잡이 바탕에 덮이지 않게 8px 띄운 자리에 선다.
  expect(gap, '펼친 줄 윗변이 손잡이 밑에 들어갔다').toBeGreaterThanOrEqual(7.5);
  expect(gap, '펼친 줄이 맨 위로 올라오지 않았다').toBeLessThanOrEqual(9);

  // 손잡이 위 여백 띠로 위로 올라간 카드가 비치지 않는다. 시트 윗변 바로 아래는 손잡이 바탕이다.
  const topBandIsHandle = await page.evaluate(() => {
    const sheet = document.querySelector('.pk-sheet');
    if (sheet == null) return false;
    const rect = sheet.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 2);
    return hit?.closest('.pk-sheet__handle') != null;
  });
  expect(topBandIsHandle, '손잡이 위 여백 띠로 아래 내용이 비친다').toBe(true);
});

// ── 읽어 온 것을 잃지 않기 ────────────────────────

test('검토 화면에는 다시 쓰기가 아니라 창을 닫는 취소가 선다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze(THREE_ITEMS);
  await expect(recordSheet.nl.rows).toHaveCount(3);

  /*
    고칠 것을 눈앞에 두고 「다시 쓰기」가 있으면, 닫고 싶은 사람이 그것을 눌러
    읽어 온 것을 통째로 버린다. 그 버튼은 한 건도 못 읽었을 때만 선다.
  */
  await expect(recordSheet.nl.rewriteButton).toHaveCount(0);
  await expect(recordSheet.nl.cancelButton).toBeVisible();
});

test('손잡이를 잘못 눌러도 읽어 온 것이 날아가지 않는다', async ({ home, page, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze(THREE_ITEMS);
  await expect(recordSheet.nl.rows).toHaveCount(3);

  // 실기기에서 이 한 번에 세 건이 통째로 사라졌다.
  await recordSheet.closeButton.click();

  await expect(recordSheet.leave.text).toContainText('읽어 온 3건이 사라져요');
  // 아직 시트는 열려 있다. 물어보기만 하고 아무것도 버리지 않았다.
  await expect(recordSheet.nl.rows).toHaveCount(3);

  await recordSheet.leave.stayButton.click();
  await expect(recordSheet.leave.text).toHaveCount(0);
  // 목록이 그대로다. 고르고 고쳐 둔 것을 되돌리지 않는다.
  await expect(recordSheet.nl.rows).toHaveCount(3);
  await expect(recordSheet.nl.saveButton).toBeVisible();

  // 무엇을 물었고 무엇을 골랐는지 로그에 남는다. 이 창이 구해 낸 기록이 여기서 세어진다.
  const asked = await logsNamed(page, 'record_leave_asked');
  expect(asked.map((log) => log.params.result)).toEqual(['asked', 'stayed']);
  expect(asked[0]?.params.pending).toBe(3);
});

test('밀어서 닫아도 같은 확인을 지나고, 그만두기를 골라야 닫힌다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze(THREE_ITEMS);

  // 손잡이·딤·Esc·미는 손짓이 모두 같은 규칙을 지나야 한다. 하나만 새면 그리로 잃는다.
  await recordSheet.dragDown();
  await expect(recordSheet.leave.text).toBeVisible();
  await expect(recordSheet.isVisible).resolves.toBe(true);

  await recordSheet.leave.leaveButton.click();
  await recordSheet.waitClosed();
});

test('저장을 마친 뒤에는 묻지 않고 그냥 닫힌다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze(THREE_ITEMS);
  await recordSheet.nl.save();

  // 저장이 끝난 화면에서 닫는 것은 아무것도 버리지 않는다. 거기서 묻는 것은 방해다.
  await recordSheet.closeButton.click();
  await expect(recordSheet.leave.text).toHaveCount(0);
  await recordSheet.waitClosed();
});

test('취소를 누르면 시트가 닫히고 한 건도 저장되지 않는다', async ({ home, page, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze(THREE_ITEMS);

  await recordSheet.nl.cancelButton.click();
  // 눌러서 그만둔 것이라 다시 묻지 않는다. 확인은 실수로 닫는 길에만 있다.
  await expect(recordSheet.leave.text).toHaveCount(0);
  await recordSheet.waitClosed();

  await home.waitReady();
  // 오늘 목록이 비어 있다. 취소는 서버에도 아무것도 남기지 않는다.
  await expect(home.today.empty).toBeVisible();

  // 실수로 잃은 것과 스스로 버린 것을 갈라 센다.
  const cancelled = await logsNamed(page, 'review_cancelled');
  expect(cancelled).toHaveLength(1);
  expect(cancelled[0]?.params.candidate_count).toBe(3);
});

// ── 앞날 날짜 ────────────────────────────────────

/*
  가계부는 이미 쓴 돈을 적는 곳이라 앞날 날짜는 거의 다 잘못 읽은 것이다.
  실기기에서 「내일」·「9/16」 으로 적었는데 그대로 저장되는 것을 신고받았다.

  방어가 두 겹이다. **서버**는 오늘보다 하루 넘게 뒤인 줄을 자동 선택에서 빼고(시간대 차이로
  하루가 앞설 수 있어 하루는 봐준다), **화면**은 내일부터 「날짜를 확인해 주세요」 를 적는다.
  막지는 않는다. 정말 그렇게 적고 싶은 사람이 켜서 저장할 수 있어야 한다.
*/

function isoInDays(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return toLedgerDate(now);
}

test('한참 뒤 날짜는 스스로 켜지지 않고, 날짜를 확인하라고 알려 준다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');

  // 연·월·일을 다 적으면 그대로 읽는다. 지난해로 돌려 주지 않는다.
  await recordSheet.nl.analyze(`${isoInDays(30)} 커피 4500`);

  await expect(recordSheet.nl.rows).toHaveCount(1);
  await expect(recordSheet.nl.futureNotices).toHaveText(
    '아직 오지 않은 날이에요. 날짜가 맞는지 확인해 주세요',
  );

  // 스스로 켜지지 않는다. 그대로 두면 아무것도 저장되지 않는다.
  await expect(recordSheet.nl.saveButton).toBeDisabled();

  // 그래도 막지는 않는다. 사람이 켜면 저장할 수 있다.
  await recordSheet.nl.toggle('커피', true);
  await expect(recordSheet.nl.saveButton).toBeEnabled();
});

test('내일 날짜는 켜져 있어도 확인하라고 알려 준다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze(`${isoInDays(1)} 커피 4500`);

  await expect(recordSheet.nl.rows).toHaveCount(1);
  // 서버는 시간대 때문에 하루를 봐준다. 그래서 켜져 있다.
  await expect(recordSheet.nl.saveButton).toBeEnabled();
  // 화면은 그래도 알려 준다. 켜져 있다고 맞는 날짜인 것은 아니다.
  await expect(recordSheet.nl.futureNotices).toHaveCount(1);
});

/*
  저장을 누르면 펼친 줄에 고쳐 둔 것을 먼저 보내고, 돌려받은 날로 앞날인지 가린다.
  서버 값으로 판정하면 칩으로 고친 날과 반대로 묻거나, 묻지 않고 앞날로 넣는다.
*/
test('앞날로 읽힌 줄을 칩으로 지난 날로 고치고 바로 저장하면 묻지 않는다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze(`${isoInDays(1)} 커피 4500`);
  await expect(recordSheet.nl.futureNotices).toHaveCount(1);

  await recordSheet.nl.openEdit('커피');
  await recordSheet.nl.form.setDay(twoDaysAgoIso());
  // 「완료」 없이 저장한다.
  await recordSheet.nl.saveButton.click();

  await expect(recordSheet.nl.savedTitle).toBeVisible();
  await expect(recordSheet.futureDayConfirm.dialog).toHaveCount(0);
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await home.waitReady();
  await expect(home.today.title).toHaveText(formatDayLabel(twoDaysAgoIso()));
  await expect(home.today.row('커피')).toBeVisible();
});

test('지난 날 줄을 칩으로 앞날로 고치고 바로 저장하면 그 날로 묻는다. 버튼 합계도 고친 금액이다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('점심 12000');

  await recordSheet.nl.openEdit('점심');
  await recordSheet.nl.form.amountField.fill('15000');
  // 「완료」 전에도 버튼이 고친 금액을 말한다. 저장하면 이 금액이 들어간다.
  await expect(recordSheet.nl.saveButton).toHaveText(`1건 저장 · ${formatCurrency(15000)}`);
  await recordSheet.nl.form.setDay(isoInDays(1));
  await recordSheet.nl.saveButton.click();

  const ask = recordSheet.futureDayConfirm;
  await expect(ask.dialog).toBeVisible();
  await expect(ask.dialog).toContainText(formatDayLabel(isoInDays(1)));
  await ask.fixButton.click();
  await expect(ask.dialog).toHaveCount(0);
  // 저장되지 않았다. 고치던 줄이 그대로 있다.
  await expect(recordSheet.nl.savedTitle).toHaveCount(0);
  await expect(recordSheet.nl.rows).toHaveCount(1);
});

test('오늘과 지난 날에는 그 안내가 없다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze(THREE_ITEMS);

  await expect(recordSheet.nl.rows).toHaveCount(3);
  // 오늘 둘과 어제 하나. 하나도 앞날이 아니다.
  await expect(recordSheet.nl.futureNotices).toHaveCount(0);
});

test('연도 없이 적은 9/16 은 앞날이 아니라 지난해로 읽는다', async ({ home, recordSheet }) => {
  const ahead = new Date();
  ahead.setDate(ahead.getDate() + 30);
  const slash = `${ahead.getMonth() + 1}/${ahead.getDate()}`;

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze(`${slash} 커피 4500`);

  await expect(recordSheet.nl.rows).toHaveCount(1);
  // 올해로 읽으면 앞날이 되니 지난해로 돌린다. 그래서 안내가 없다.
  await expect(recordSheet.nl.futureNotices).toHaveCount(0);
});
