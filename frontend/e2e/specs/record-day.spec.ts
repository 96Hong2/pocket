import {
  formatCurrency,
  formatDayLabel,
  formatRelativeDay,
  shiftDay,
  toLedgerDate,
} from '../../src/shared/lib/format';
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
  // 오늘로 시작한다. 알약이 「오늘」 이라고 적혀 있다.
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.input.dayChip).toHaveText(formatDayLabel(toLedgerDate(new Date())));

  await recordSheet.input.dayField.fill(target);
  await expect(recordSheet.input.dayChip).toHaveText(formatDayLabel(target));

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

test('지난 날을 골라도 네 방식을 다 쓰고, 어디로 떨어지는지 적어 준다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await expect(recordSheet.methodTab('줄글')).toBeEnabled();

  const past = ledgerDay(-3);
  await recordSheet.input.dayField.fill(past);
  // 잠그지 않는다. 고른 날이 세 탭에 함께 내려가므로 옮겨도 잃을 것이 없다.
  await expect(recordSheet.methodTab('줄글')).toBeEnabled();
  await expect(recordSheet.methodTab('캡처')).toBeEnabled();
  await expect(recordSheet.methodTab('영수증')).toBeEnabled();

  // 키패드에는 이 줄이 안 뜬다. 키패드는 고른 날에 그대로 적는 것이라 설명할 것이 없다.
  await expect(recordSheet.input.dayBaseNotice(formatDayLabel(past))).toHaveCount(0);
  await recordSheet.methodTab('줄글').click();
  await expect(recordSheet.input.dayBaseNotice(formatDayLabel(past))).toBeVisible();

  /*
    **날짜 칸은 키패드 패널 안에 있다.** 줄글·캡처·영수증 쪽에서는 고른 날이 위의 한 줄로
    보이기만 하고 바꾸지는 못한다. 바꾸려면 키패드로 돌아온다. 그 왕복이 실제로 되는지를
    여기서 지킨다. 돌아올 길이 막히면 잘못 고른 날에 갇힌다.
  */
  await recordSheet.methodTab('키패드').click();
  await recordSheet.input.dayField.fill(toLedgerDate(new Date()));
  await recordSheet.methodTab('줄글').click();
  await expect(recordSheet.input.dayBaseNotice(formatDayLabel(past))).toHaveCount(0);
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

  // 칸이 앞날을 막지 않는다.
  await recordSheet.input.dayField.fill(future);
  await expect(recordSheet.input.dayChip).toHaveText(formatDayLabel(future));

  await recordSheet.input.enterAmount(6_000);
  await recordSheet.input.pickCategory('식비');

  // 묻기 전에는 저장되지 않는다.
  const ask = recordSheet.futureDayConfirm;
  await expect(ask.dialog).toBeVisible();
  await expect(ask.dialog).toContainText(formatDayLabel(future));
  await expect(recordSheet.feedback.headline).toHaveCount(0);

  // 「날짜 고치기」 를 고르면 그대로 남는다. 잃는 것이 없다.
  await ask.fixButton.click();
  await expect(ask.dialog).toHaveCount(0);
  await expect(recordSheet.feedback.headline).toHaveCount(0);

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

  await recordSheet.methodTab('줄글').click();
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
