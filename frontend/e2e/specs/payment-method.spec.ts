import {
  formatCurrency,
  formatMonthLabel,
  shiftMonth,
  toLedgerDate,
} from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * 무엇으로 냈나.
 *
 * 같은 10만원이라도 신용카드로 낸 것은 다음 달에 빠지고 현금은 이미 빠졌다. 그 둘을 한
 * 숫자로 뭉개면 「이번 달에 쓴 돈」 과 「이번 달에 나간 돈」 이 구분되지 않는다.
 *
 * **적는 화면에는 이 칸이 없다.** 칸이 하나 더 서면 10초 약속이 깨진다. 지난번에 쓴
 * 것으로 조용히 저장하고, 저장이 끝난 화면에서 무엇으로 적혔는지 보여 준다.
 *
 * 여기서 지키는 것이 넷이다. 적는 화면이 깨끗하다는 것, 저장 뒤에 고칠 수 있다는 것,
 * 고른 것이 리포트까지 그대로 닿는다는 것, 그리고 **다음에도 그것으로 적힌다**는 것.
 * 마지막 것이 없으면 매번 다시 고르게 되고, 그러면 아무도 안 골라 통계가 빈다.
 */

const THIS_MONTH = toLedgerDate(new Date()).slice(0, 7);

test('적는 화면에는 결제 수단 칸이 없고, 저장한 뒤에 나온다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  // 금액과 분류만 있는 화면이어야 한다. 칸이 하나 더 서면 10초 약속이 깨진다.
  await expect(recordSheet.input.paymentGroup).toHaveCount(0);
  await recordSheet.input.enterAmount(4000);
  await recordSheet.input.pickCategory('식비');

  await recordSheet.feedback.waitSaved();
  await expect(recordSheet.feedback.savedAmount).toHaveText(formatCurrency(4000));
  await expect(recordSheet.feedback.paymentGroup).toBeVisible();
});

test('수입에는 결제 수단 자리가 아예 없다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.input.pickKind('수입');
  await recordSheet.input.enterAmount(4000);
  await recordSheet.input.pickCategory('월급');
  await recordSheet.feedback.waitSaved();

  // 비활성으로 두면 무엇을 잘못했나 싶어진다. 뜻이 없는 값이라 자리째 없앤다.
  await expect(recordSheet.feedback.paymentGroup).toHaveCount(0);
});

test('고른 결제 수단이 리포트의 「무엇으로 냈나」 에 그대로 나온다', async ({
  home,
  recordSheet,
  report,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.input.enterAmount(30000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  await recordSheet.feedback.pickPayment('신용카드');
  await expect(recordSheet.feedback.paymentButton('신용카드')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await report.open({ month: THIS_MONTH });
  await report.waitReady();
  await expect(report.methodCard).toBeVisible();
  await expect(report.methodRow('신용카드')).toContainText(formatCurrency(30000));
});

test('한 번도 안 고른 달에는 「무엇으로 냈나」 자리가 없다', async ({ prep, report }) => {
  // 「안 고름 100%」 한 줄은 아무것도 알려 주지 않으면서 자리만 먹는다.
  await prep.addTransaction({ amount: 8000, merchant: '분식' });

  await report.open({ month: THIS_MONTH });
  await report.waitReady();
  await expect(report.methodCard).toHaveCount(0);
});

test('안 고르고 적은 줄은 금액이 제일 커도 맨 아래에 선다', async ({
  home,
  recordSheet,
  prep,
  report,
}) => {
  // 금액으로만 세우면 '모르는 것' 이 화면의 결론이 된다.
  await prep.addTransaction({ amount: 90000, merchant: '가구' });

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(1000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.pickPayment('현금');
  await expect(recordSheet.feedback.paymentButton('현금')).toHaveAttribute('aria-pressed', 'true');
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await report.open({ month: THIS_MONTH });
  await report.waitReady();
  await expect(report.methodRows()).toHaveText([/현금/, /안 고름/]);
});

test('한 번 고르면 다음 기록도 묻지 않고 그것으로 적힌다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.input.enterAmount(5000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.pickPayment('체크카드');
  // 붙은 것을 보고 나서 닫는다. 확인이 먼저 닿으면 시트가 사라져 저장 결과가 갈 곳을 잃는다.
  await expect(recordSheet.feedback.paymentButton('체크카드')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  // 두 번째는 아무것도 안 골랐는데 저장 화면이 체크카드를 들고 있어야 한다.
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(3000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await expect(recordSheet.feedback.paymentButton('체크카드')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('고른 것을 한 번 더 누르면 다시 안 고른 상태가 된다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.input.enterAmount(2000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  await recordSheet.feedback.pickPayment('현금');
  await expect(recordSheet.feedback.paymentButton('현금')).toHaveAttribute('aria-pressed', 'true');
  await recordSheet.feedback.pickPayment('현금');
  await expect(recordSheet.feedback.paymentButton('현금')).toHaveAttribute('aria-pressed', 'false');
});

test('이미 적어 둔 기록에도 나중에 결제 수단을 붙인다', async ({ calendar, prep, report }) => {
  await prep.addTransaction({ amount: 15000, merchant: '약국' });

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('약국');
  await calendar.edit.waitOpen();
  await calendar.edit.paymentButton('신용카드').click();
  await calendar.edit.done();

  await report.open({ month: THIS_MONTH });
  await report.waitReady();
  await expect(report.methodRow('신용카드')).toContainText(formatCurrency(15000));
});

test('수입으로 고치면 붙어 있던 결제 수단이 사라진다', async ({ calendar, prep }) => {
  await prep.addTransaction({ amount: 20000, merchant: '중고거래' });

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('중고거래');
  await calendar.edit.waitOpen();
  await calendar.edit.paymentButton('현금').click();
  await calendar.edit.kindButton('수입').click();
  await expect(calendar.edit.paymentGroup).toHaveCount(0);
  await calendar.edit.done();

  // 다시 열어도 비어 있어야 한다. 남겨 두면 지출로 되돌렸을 때 고른 적 없는 값이 되살아난다.
  await calendar.list.pick('중고거래');
  await calendar.edit.waitOpen();
  await calendar.edit.kindButton('지출').click();
  await expect(calendar.edit.paymentButton('현금')).toHaveAttribute('aria-pressed', 'false');
});

/** 지난달 리포트를 보러 갔다가 한 번에 돌아온다. */
test('지난 리포트를 보다가 이번 달로 한 번에 돌아온다', async ({ report }) => {
  await report.open({ month: THIS_MONTH });
  await report.waitReady();
  // 이번 달을 보고 있으면 갈 곳이 없어 알약이 없다.
  await expect(report.thisMonthJump).toHaveCount(0);

  await report.goPreviousMonth();
  await report.goPreviousMonth();
  await expect(report.monthLabel()).toHaveText(formatMonthLabel(shiftMonth(THIS_MONTH, -2)));

  await report.thisMonthJump.click();
  await expect(report.monthLabel()).toHaveText(formatMonthLabel(THIS_MONTH));
  await expect(report.thisMonthJump).toHaveCount(0);
});
