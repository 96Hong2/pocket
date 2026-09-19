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
  // 오늘로 시작한다. 여기에는 날짜 안내가 아예 없다.
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.input.dayNotice).toHaveCount(0);

  await recordSheet.input.dayField.fill(target);
  await expect(recordSheet.input.dayNotice).toHaveText(`${formatRelativeDay(target)}에 적어요`);

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

test('지난 날을 고르면 방식 알약이 잠기고, 오늘로 되돌리면 다시 풀린다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await expect(recordSheet.methodTab('줄글')).toBeEnabled();

  await recordSheet.input.dayField.fill(ledgerDay(-3));
  // 눌리지 않는 자리를 말없이 두면 고장으로 읽힌다. 이유를 그 자리에서 말한다.
  await expect(recordSheet.input.dayLockNotice).toBeVisible();
  await expect(recordSheet.methodTab('줄글')).toBeDisabled();
  await expect(recordSheet.methodTab('캡처')).toBeDisabled();
  await expect(recordSheet.methodTab('영수증')).toBeDisabled();

  await recordSheet.input.dayField.fill(toLedgerDate(new Date()));
  await expect(recordSheet.input.dayLockNotice).toHaveCount(0);
  await expect(recordSheet.methodTab('줄글')).toBeEnabled();
});

test('아직 오지 않은 날은 고를 수 없다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await expect(recordSheet.input.dayField).toHaveAttribute('max', toLedgerDate(new Date()));
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
