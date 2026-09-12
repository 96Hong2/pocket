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
 * 여기서 지키는 것이 셋이다. **안 골라도 저장된다**는 것(10초 안에 적는 약속이 먼저다),
 * 고른 것이 리포트까지 그대로 닿는다는 것, 그리고 **지난번에 고른 것으로 열린다**는 것.
 * 마지막 것이 없으면 매번 다시 고르게 되고, 그러면 아무도 안 고른다.
 */

const THIS_MONTH = toLedgerDate(new Date()).slice(0, 7);

test('결제 수단을 안 골라도 그대로 저장된다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await expect(recordSheet.input.paymentGroup).toBeVisible();
  await recordSheet.input.enterAmount(4000);
  await recordSheet.input.pickCategory('식비');

  await recordSheet.feedback.waitSaved();
  await expect(recordSheet.feedback.savedAmount).toHaveText(formatCurrency(4000));
});

test('수입에는 결제 수단 자리가 아예 없다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await expect(recordSheet.input.paymentGroup).toBeVisible();
  await recordSheet.input.pickKind('수입');
  // 비활성으로 두면 무엇을 잘못했나 싶어진다. 뜻이 없는 값이라 자리째 없앤다.
  await expect(recordSheet.input.paymentGroup).toHaveCount(0);
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

  await recordSheet.input.pickPayment('신용카드');
  await expect(recordSheet.input.paymentButton('신용카드')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await recordSheet.input.enterAmount(30000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
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
  await recordSheet.input.pickPayment('현금');
  await recordSheet.input.enterAmount(1000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await report.open({ month: THIS_MONTH });
  await report.waitReady();
  await expect(report.methodRows()).toHaveText([/현금/, /안 고름/]);
});

test('지난번에 고른 결제 수단으로 다시 열린다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.input.pickPayment('체크카드');
  await recordSheet.input.enterAmount(5000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.input.paymentButton('체크카드')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('고른 것을 한 번 더 누르면 다시 안 고른 상태가 된다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.input.pickPayment('현금');
  await recordSheet.input.pickPayment('현금');
  await expect(recordSheet.input.paymentButton('현금')).toHaveAttribute('aria-pressed', 'false');
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
