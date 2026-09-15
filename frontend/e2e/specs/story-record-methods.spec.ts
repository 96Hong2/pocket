import { formatCurrency, toLedgerDate } from '../../src/shared/lib/format';
import { CAPTURE_DATA_URI, mockImagesSeeded, seedMockImages } from '../support/deviceMock';
import { expect, test } from '../support/fixtures';

/**
 * 네 가지 기록 방법을 **귀찮은 사람의 눈으로** 걷는다.
 *
 * 기능이 있느냐가 아니라 여기서 손을 놓게 되느냐를 본다. 읽어 둔 것이 말없이 날아가거나,
 * 버튼 이름이 약속한 날과 저장된 날이 다르거나, 여러 건을 한꺼번에 고치는 길이 끊기면
 * 그 사람은 다음 달에 이 앱을 안 연다.
 *
 * 캡처와 영수증은 정해 둔 예시를 내는 스텁을 탄다. 캡처는 늘 6건(지출 다섯 + 카드 캐시백),
 * 영수증은 늘 상호를 못 읽은 한 건이다. 그래서 바뀔 줄과 안 바뀔 줄이 결정적으로 갈린다.
 */

const THIS_MONTH = toLedgerDate(new Date()).slice(0, 7);

/** 영수증 스텁이 늘 내는 한 건. 상호가 비어 화면이 이 이름으로 그린다. */
const NO_NAME = '식비';
const RECEIPT_AMOUNT = 23_500;

/** 캡처 스텁 6건 중 오늘 자로 읽히는 둘. 달이 바뀌어도 이 둘은 늘 이번 달이다. */
const STARBUCKS = 4_500;
const GS25 = 3_200;

/*
  읽어 둔 것이 남아 있으면 시트를 안 닫는다.

  캡처로 여섯 건을 읽어 두고 줄글로 한 건을 따로 저장한 사람에게, 저장 뒤 「확인」 이
  시트를 닫아 버리면 그 여섯이 말없이 사라진다. 손잡이로 닫을 때는 한 번 묻는데
  이 길만 안 물었다. 이제는 닫지 않고 남은 건이 있는 자리로 데려다 놓는다.

  ⚠ **키패드로 저장하는 길은 아직 이 보호를 못 받는다.** 저장 결과 화면이 몸통을 통째로
  바꿔 끼워서 다른 탭이 언마운트되고, 읽어 둔 줄이 그 순간 사라진다. 고치려면 결과
  화면을 덮개로 바꿔 몸통을 살려 둬야 하는데 화면 배치를 건드리는 일이라 따로 다룬다.
*/
test('캡처로 읽어 둔 여섯 건은 줄글을 따로 저장해도 남아 있다', async ({
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);

  await home.open();
  await home.waitReady();
  // 다이얼이 안 걸린 채로 통과하면 목이 만든 기본 그림을 보고 있는 것이다.
  expect(await mockImagesSeeded(page)).toBe(true);

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('캡처').click();
  await recordSheet.capture.pick();
  await expect(recordSheet.capture.rows).toHaveCount(6);

  // 캡처가 못 읽은 한 건을 줄글로 따로 적는다. 읽어 둔 여섯은 아직 아무 데도 안 갔다.
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('택시 9000');
  await recordSheet.nl.save();
  await recordSheet.nl.confirmButton.click();

  // 닫히지 않는다. 남은 건이 있는 자리로 데려다 놓는다.
  await recordSheet.waitOpen();
  await expect(recordSheet.capture.rows).toHaveCount(6);

  // 그제서야 닫으려 하면 손잡이로 닫을 때와 똑같이 한 번 묻는다.
  await recordSheet.closeButton.click();
  await expect(recordSheet.leave.text).toContainText('읽어 온 6건이 사라져요');
  await recordSheet.leave.stayButton.click();
  await expect(recordSheet.capture.rows).toHaveCount(6);
});

/*
  같은 자리를 `story-record-day.spec.ts` 가 덮는다.

  이 자리의 답은 「줄글 탭에도 날짜를 붙인다」 가 아니라 **「날 이름이 붙은 버튼은 방식을
  묻지 않는다」** 로 정해졌다. 고른 날은 키패드에만 붙고, 방식을 고를 수 있게 두면 탭을
  옮기는 순간 그 날을 잃는다. 그래서 그 확인은 저쪽 파일에 있다.
*/
test('카테고리 한 번에 바꾸기가 켜 둔 지출 줄만 한꺼번에 바꾼다', async ({
  calendar,
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);

  await home.open();
  await home.waitReady();
  expect(await mockImagesSeeded(page)).toBe(true);

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('캡처').click();
  await recordSheet.capture.pick();
  await expect(recordSheet.capture.rows).toHaveCount(6);

  // 읽어 온 분류가 줄마다 다르다. 줄마다 펴서 고치면 여섯 번을 반복해야 한다.
  await expect(recordSheet.capture.row('스타벅스')).toContainText('카페·간식');
  await expect(recordSheet.capture.row('김밥천국')).toContainText('식비');
  await expect(recordSheet.capture.row('쿠팡')).toContainText('쇼핑');

  await recordSheet.capture.bulkPickCategory('생활');

  // 켜져 있고 종류가 지출인 줄만 바뀐다.
  await expect(recordSheet.capture.row('스타벅스')).toContainText('생활');
  await expect(recordSheet.capture.row('김밥천국')).toContainText('생활');
  await expect(recordSheet.capture.row('쿠팡')).toContainText('생활');
  await expect(recordSheet.capture.row('GS25')).toContainText('생활');

  // 확신이 낮아 꺼 둔 줄과 환불 줄은 손대지 않는다. 고를 생각이 없던 것까지 바꾸면 더 나쁘다.
  await expect(recordSheet.capture.row('카카오T')).toContainText('교통');
  await expect(recordSheet.capture.row('MY 카드 캐시백')).toContainText('분류 없음');

  await recordSheet.capture.save();
  await recordSheet.capture.confirmButton.click();
  await recordSheet.waitClosed();

  // 화면에서 바꾼 분류가 저장된 거래에도 그대로 붙어야 한다.
  await calendar.open();
  await calendar.waitReady();
  await expect(calendar.list.row('스타벅스')).toBeVisible();
  await expect(calendar.list.row('GS25')).toBeVisible();
  // 오늘 자로 들어온 두 줄이 모두 생활이다. 바꾸기 전 분류는 어디에도 남지 않는다.
  await expect(calendar.list.row('생활')).toHaveCount(2);
  await expect(calendar.list.row('카페·간식')).toHaveCount(0);
  await expect(calendar.list.dayTotal).toHaveText(formatCurrency(STARBUCKS + GS25));
});

test('한 번에 바꾸기는 캡처에만 있고 줄글·영수증에는 없다', async ({ home, page, recordSheet }) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);

  await home.open();
  await home.waitReady();
  expect(await mockImagesSeeded(page)).toBe(true);

  await home.recordButton.click();
  await recordSheet.waitOpen();

  // 한 장에서 여러 건이 쏟아지는 탭이라 여기에만 필요하다.
  await recordSheet.methodTab('캡처').click();
  await recordSheet.capture.pick();
  await expect(recordSheet.capture.bulkCategoryButton).toBeVisible();

  // 문장은 한두 건이라 줄마다 고치는 편이 빠르다. 자리만 먹는 버튼을 두지 않는다.
  await recordSheet.methodTab('줄글').click();
  await recordSheet.nl.analyze('점심 12000');
  await expect(recordSheet.nl.readLine).toBeVisible();
  await expect(recordSheet.nl.bulkCategoryButton).toHaveCount(0);

  // 영수증은 늘 한 건이다.
  await recordSheet.methodTab('영수증').click();
  await recordSheet.receipt.pick();
  await expect(recordSheet.receipt.rows).toHaveCount(1);
  await expect(recordSheet.receipt.bulkCategoryButton).toHaveCount(0);
});

test('검토 화면에서 고른 결제 수단이 리포트까지 그대로 간다', async ({
  home,
  page,
  recordSheet,
  report,
}) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);

  await home.open();
  await home.waitReady();
  expect(await mockImagesSeeded(page)).toBe(true);

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('영수증').click();
  await recordSheet.receipt.pick();
  await expect(recordSheet.receipt.rows).toHaveCount(1);

  await recordSheet.receipt.openEdit(NO_NAME);
  // 총액은 읽혔는데 결제 수단을 못 읽은 영수증이다. 아무것도 안 눌려 있어야 한다.
  await expect(recordSheet.receipt.form.paymentButton('신용카드')).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  // 수입에는 결제 수단이라는 것이 없다. 비활성으로 두면 무엇을 잘못했나 싶어진다.
  await recordSheet.receipt.form.typeTab('수입').click();
  await expect(recordSheet.receipt.form.paymentGroup).toHaveCount(0);

  await recordSheet.receipt.form.typeTab('지출').click();
  // 종류를 오가는 사이 떨어진 분류를 되돌린다. 여기서 보려는 것은 결제 수단이다.
  await recordSheet.receipt.form.pickCategory('식비');

  await recordSheet.receipt.form.pickPayment('신용카드');
  await expect(recordSheet.receipt.form.paymentButton('신용카드')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await recordSheet.receipt.form.apply();

  await recordSheet.receipt.save();
  await recordSheet.receipt.confirmButton.click();
  await recordSheet.waitClosed();

  await report.open({ month: THIS_MONTH });
  await report.waitReady();
  // 고른 보람이 있어야 한다. 「안 고름」 으로 떨어지면 검토 화면에서 고른 것이 버려진 것이다.
  await expect(report.methodRow('신용카드')).toContainText(formatCurrency(RECEIPT_AMOUNT));
});
