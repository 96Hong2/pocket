import { formatCurrency } from '../../../src/shared/lib/format';
import { CAPTURE_DATA_URI, mockImagesSeeded, seedMockImages } from '../../support/deviceMock';
import { expect, test } from '../support/director';

/**
 * 영수증 한 장을 찍어 총액 한 건을 적는 장면.
 *
 * 홈을 먼저 열어 제목 카드를 띄우고 그 뒤에 시트를 연다. 시트를 먼저 열면 카드 뒤로 딤이 비친다.
 * 카메라는 네이티브 기능이라 브라우저에서 못 연다. devtools 목에 사진 한 장을 심어 '찍었다' 를
 * 만들고, 브릿지 코드는 실기기와 같은 것이 그대로 돈다.
 *
 * 사진 인식은 아직 실제 모델이 아니라 규칙 기반 스텁이다. 영수증에는 상호를 못 읽은 한 건만
 * 낸다(캡처 탭은 다섯 건이다). 그래서 여기서 보이는 것은 '얼마나 잘 알아듣는가' 가 아니라
 * '알아들은 것을 화면이 어떻게 다루는가' 다. 이름을 못 읽어도 금액을 버리지 않는 것이 핵심이다.
 */

/** 스텁이 영수증에 대해 늘 내는 총액. */
const RECEIPT_AMOUNT = 23_500;
/** 상호가 비면 검토 화면이 이 이름으로 그린다. */
const NO_NAME = '이름 없음';
/** 상호가 없으니 달력은 분류 이름으로 줄 제목을 만든다. */
const ROW_TITLE = '식비';

test('42 영수증을 찍으면 총액 한 건이 나오고 상호는 비어 있다', async ({
  calendar,
  demo,
  home,
  page,
  recordSheet,
}) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);

  await home.open();
  await home.waitReady();
  // 안 심긴 채로 지나가면 목이 만든 기본 그림을 찍는 장면이 된다.
  expect(await mockImagesSeeded(page), '목에 사진이 안 심겼다').toBe(true);
  await demo.open('영수증 찍기', '상호를 못 읽어도 총액은 버리지 않는다');

  await demo.step('홈에서 10초 기록을 누른다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await demo.beat(2);

  await demo.step('기록 방법에서 영수증으로 옮긴다');
  await recordSheet.methodTab('영수증').click();
  await expect(recordSheet.receipt.guide).toBeVisible();
  await demo.beat(2);

  await demo.step('영수증 찍기를 누르면 카메라가 열리고 한 장을 읽는다');
  await recordSheet.receipt.pick();
  await expect(recordSheet.receipt.rows).toHaveCount(1);
  await expect(recordSheet.receipt.stubNotice).toBeVisible();
  await demo.beat(3);

  await demo.step('총액 한 건을 읽었는데 상호 자리는 이름 없음이다');
  await expect(recordSheet.receipt.amount(NO_NAME)).toHaveText(formatCurrency(RECEIPT_AMOUNT));
  await demo.beat(3);

  await demo.step('이름을 못 읽었다고 줄을 버리지 않는다. 켜 둔 채로 확인만 부탁한다');
  await expect(recordSheet.receipt.checkbox(NO_NAME)).toBeChecked();
  await expect(recordSheet.receipt.readLine).toBeVisible();
  await demo.beat(3);

  await demo.step('저장 버튼에 건수와 금액이 그대로 적힌다');
  await expect(recordSheet.receipt.saveButton).toHaveText(
    `1건 저장 · ${formatCurrency(RECEIPT_AMOUNT)}`,
  );
  await demo.beat(3);

  await demo.step('누르면 한 건이 저장된다');
  await recordSheet.receipt.save();
  await expect(recordSheet.receipt.savedTitle).toHaveText(
    `1건 저장했어요 · ${formatCurrency(RECEIPT_AMOUNT)}`,
  );
  await demo.beat(3);

  await demo.step('홈의 이번 달 쓴 돈이 그만큼 올라간다');
  await recordSheet.receipt.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(RECEIPT_AMOUNT));
  await demo.beat(3);

  await demo.step('달력에는 상호 대신 분류 이름으로 줄이 선다');
  await calendar.open();
  await calendar.waitReady();
  await expect(calendar.list.row(ROW_TITLE)).toBeVisible();
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
