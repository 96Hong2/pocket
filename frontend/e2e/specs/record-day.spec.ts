import {
  formatCurrency,
  formatDayLabel,
  formatRelativeDay,
  shiftDay,
  toLedgerDate,
} from '../../src/shared/lib/format';
import { TEST_IDS } from '../../src/shared/testIds';
import { expect, test } from '../support/fixtures';

/**
 * 시트 안에서 적을 날을 고른다.
 *
 * 예전에는 지난 날 것을 적으려면 홈이나 달력에서 그 날을 먼저 찾아간 다음 「기록하기」를
 * 눌러야 했다. 영수증을 몰아서 적는 사람에게는 그 왕복이 적는 일보다 길었다.
 *
 * 함께 지키는 것 하나 더. **적고 나면 그 날이 화면에 떠 있어야 한다.** 지난 날에 적었는데
 * 홈이 오늘에 머물러 「오늘은 안 썼어요」 라고 적혀 있으면, 들어간 것인지 아닌지를
 * 그 날짜로 찾아가 봐야 안다.
 */

/** 가계부 시간대(KST) 기준. 러너가 UTC 면 하루 어긋난다. 테스트 안에서 센다. */
function ledgerDay(offset: number): string {
  return shiftDay(toLedgerDate(new Date()), offset);
}

test('기록 시트에서 날짜를 지난 날로 바꿔 적으면 홈 목록이 그 날로 옮겨 간다', async ({
  home,
  recordSheet,
}) => {
  const target = ledgerDay(-5);

  await home.open();
  await home.waitReady();
  // 오늘로 시작한다. 첫 화면 맨 위 날짜가 「오늘 10월 5일 (일)」 처럼 적혀 있다.
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.dayButton).toContainText(
    `오늘 ${formatDayLabel(toLedgerDate(new Date()))} (`,
  );

  // 날짜를 눌러 「언제예요?」 에서 「다른 날 고르기」 로 닷새 전을 고르면 첫 화면으로 돌아온다.
  await recordSheet.chooseDay(target);
  await expect(recordSheet.dayButton).toContainText(`${formatDayLabel(target)} (`);
  await expect(recordSheet.dayButton).not.toContainText('오늘');

  await recordSheet.input.enterAmount(3_200);
  await recordSheet.input.pickCategory('식비');
  await expect(recordSheet.feedback.savedLabel).toBeVisible();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  // 홈이 그 날로 옮겨 가 있다. 방금 적은 것이 눈앞에 있어야 들어간 줄 안다.
  await expect(home.today.title).toHaveText(formatRelativeDay(target));
  await expect(home.today.row('식비')).toBeVisible();
  await expect(home.today.spentTotal).toHaveText(`${formatCurrency(3_200)} 씀`);
  // 안 썼다는 줄이 그 자리를 차지하고 있으면 안 된다.
  await expect(home.today.noSpendButton).toHaveCount(0);
});

test('지난 날을 골라도 네 방식을 다 쓰고, 날짜 없는 줄글은 고른 날로 떨어진다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await expect(recordSheet.methodTab('줄글')).toBeEnabled();

  const past = ledgerDay(-3);
  await recordSheet.chooseDay(past);
  // 잠그지 않는다. 고른 날이 네 방법에 함께 내려가므로 옮겨도 잃을 것이 없다.
  await expect(recordSheet.methodTab('줄글')).toBeEnabled();
  await expect(recordSheet.methodTab('캡처')).toBeEnabled();
  await expect(recordSheet.methodTab('영수증')).toBeEnabled();

  /*
    **날짜는 첫 화면 맨 위에만 있다.** 줄글로 갔다가 ‹ 로 돌아오면 고른 날이 그대로다.
    돌아올 길이 막히거나 날이 오늘로 돌아가면 잘못 고른 날에 갇히거나 엉뚱한 날에 적힌다.
  */
  await recordSheet.chooseWay('줄글');
  await expect(recordSheet.nl.textarea).toBeVisible();
  await recordSheet.back();
  await expect(recordSheet.dayButton).toContainText(`${formatDayLabel(past)} (`);

  // 날짜를 안 적은 줄은 첫 화면에서 고른 날로 들어간다. 안내 글 대신 검토 줄이 그 날을 보여 준다.
  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.analyze('택시 9000');
  await expect(recordSheet.nl.rows).toHaveCount(1);
  await expect(recordSheet.nl.rows.first().getByTestId(TEST_IDS.nlCandidateDate)).toHaveText(
    formatDayLabel(past),
  );
});

/*
  앞날은 막지 않고 한 번 묻는다 (2026-09-20 개정).

  예전에는 칸에 `max` 를 걸어 아예 못 고르게 했다. 그런데 미리 나갈 돈을 적어 두는 사람이
  있고, 읽어 온 것에 앞날이 섞여 들어오기도 한다. 잠가 두면 앞엣사람은 아예 못 적는다.
  고를 수는 있게 두고 **저장하는 순간에** 한 번 묻는다.
*/
test('앞날을 고르면 저장할 때 한 번 묻고, 그대로 저장할 수 있다', async ({ home, recordSheet }) => {
  const future = ledgerDay(3);

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  // 「다른 날 고르기」 가 앞날을 막지 않는다.
  await recordSheet.chooseDay(future);
  await expect(recordSheet.dayButton).toContainText(`${formatDayLabel(future)} (`);

  await recordSheet.input.enterAmount(6_000);
  await recordSheet.input.pickCategory('식비');

  // 묻기 전에는 저장되지 않는다.
  const ask = recordSheet.futureDayConfirm;
  await expect(ask.dialog).toBeVisible();
  await expect(ask.dialog).toContainText(formatDayLabel(future));
  await expect(recordSheet.feedback.headline).toHaveCount(0);

  // 「날짜 고치기」 는 날짜를 고르는 「언제예요?」 로 간다. 날짜 칸은 첫 화면에만 있다.
  await ask.fixButton.click();
  await expect(ask.dialog).toHaveCount(0);
  await expect(recordSheet.feedback.headline).toHaveCount(0);
  await expect(recordSheet.sheet.getByText('언제예요?', { exact: true })).toBeVisible();

  // 고치지 않고 돌아와도 잃는 것이 없다. 고른 날과 적던 금액이 그대로다.
  await recordSheet.back();
  await expect(recordSheet.dayButton).toContainText(`${formatDayLabel(future)} (`);
  await recordSheet.next();
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(6_000));

  // 다시 눌러 「이 날짜로 저장」 을 고르면 그 날로 들어간다.
  await recordSheet.input.pickCategory('식비');
  await ask.saveButton.click();
  await recordSheet.feedback.waitSaved();
});

test('오늘에 적을 때는 아무것도 묻지 않는다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.input.enterAmount(3_000);
  await recordSheet.input.pickCategory('식비');

  await recordSheet.feedback.waitSaved();
  await expect(recordSheet.futureDayConfirm.dialog).toHaveCount(0);
});

test('줄글로 어제 것을 넣으면 홈이 어제로 옮겨 간다', async ({ home, recordSheet }) => {
  const yesterday = ledgerDay(-1);

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.chooseWay('줄글');
  await recordSheet.nl.textarea.fill('어제 택시 9000');
  await recordSheet.nl.analyzeButton.click();
  await expect(recordSheet.nl.saveButton).toBeVisible();
  await recordSheet.nl.saveButton.click();
  await expect(recordSheet.nl.savedTitle).toBeVisible();
  await recordSheet.nl.confirmButton.click();
  await recordSheet.waitClosed();

  await expect(home.today.title).toHaveText(formatRelativeDay(yesterday));
  await expect(home.today.spentTotal).toHaveText(`${formatCurrency(9_000)} 씀`);
});

test('홈에서 줄을 눌러 날짜를 옮기면 그 날로 간다', async ({ home, prep }) => {
  const target = ledgerDay(-4);

  await prep.addTransaction({ amount: 7_700, merchant: '김밥천국' });
  await home.open();
  await home.waitReady();

  await home.today.row('김밥천국').click();
  await home.edit.waitOpen();
  await expect(home.edit.dayField).toHaveValue(toLedgerDate(new Date()));

  await home.edit.dayField.fill(target);
  // 머리의 날짜도 따라온다. 저장한 값만 보면 옮긴 뒤에도 옛 날이 남는다.
  await expect(home.edit.title).toContainText(formatDayLabel(target));
  await home.edit.done();
  await home.edit.waitClosed();

  // 오늘에는 없고, 옮긴 날에 있다.
  await expect(home.today.row('김밥천국')).toHaveCount(0);
  for (let step = 0; step < 4; step += 1) await home.today.prevDayButton.click();
  await expect(home.today.title).toHaveText(formatRelativeDay(target));
  await expect(home.today.row('김밥천국')).toBeVisible();
});

test('달력에서도 수정 시트로 날짜를 옮긴다', async ({ calendar, prep }) => {
  const AMOUNT = 5_500;
  const today = toLedgerDate(new Date());
  const target = ledgerDay(-2);

  await prep.addTransaction({ amount: AMOUNT, merchant: '편의점', on: today });
  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('편의점');
  await calendar.edit.waitOpen();

  await calendar.edit.dayField.fill(target);
  await calendar.edit.done();
  await calendar.edit.waitClosed();

  /*
    옮긴 날 칸의 이름에 **그 금액까지** 들어 있어야 한다. 금액 없이 찾으면 달력이 아직
    옛 합계를 들고 있는 순간에만 맞아, 느린 기계에서만 빨개진다(CI 에서 그랬다).
  */
  await calendar.grid.select(calendar.grid.cellName(target, { expense: AMOUNT }));
  await expect(calendar.list.row('편의점')).toBeVisible();
  await expect(calendar.list.dayTotal).toHaveText(formatCurrency(AMOUNT));
});
