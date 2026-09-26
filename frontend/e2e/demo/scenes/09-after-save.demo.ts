import { expect, test } from '../support/director';

import { formatCurrency } from '../../../src/shared/lib/format';

/**
 * 저장한 뒤에 고치는 흐름을 찍는다.
 *
 * 카테고리 바꾸기로 칩을 펼쳐 다른 분류로 옮기고, 상세 칸 아래에서 결제 수단을 고른 뒤
 * 확인으로 시트를 닫는다. 무엇으로 냈는지는 **저장이 끝난 다음에** 묻는다.
 * 적는 화면에 칸이 하나 더 서면 10초 약속이 깨진다.
 */

const AMOUNT = 12_000;
const FIRST_CATEGORY = '식비';
const MOVED_CATEGORY = '카페·간식';

test('14 저장한 뒤 카테고리와 결제 수단 고치기', async ({ demo, home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await demo.open('저장한 뒤에 고치기', '분류를 바꾸고, 무엇으로 냈는지도 여기서 고른다');

  await demo.step('먼저 12,000원을 식비로 저장한다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(AMOUNT);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(AMOUNT));
  await recordSheet.input.pickCategory(FIRST_CATEGORY);
  await recordSheet.feedback.waitSaved();
  await expect(recordSheet.feedback.headline).toContainText(formatCurrency(AMOUNT));
  await demo.beat(2);

  await demo.step('저장한 줄의 분류 쪽을 누르면 칩이 펼쳐진다');
  await recordSheet.feedback.changeCategoryButton.click();
  await expect(recordSheet.feedback.changeTitle).toBeVisible();
  // 지금 들어가 있는 분류는 눌린 상태로 표시된다. 어디서 옮기는지가 화면에 보인다.
  await expect(recordSheet.feedback.categoryChip(FIRST_CATEGORY)).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await demo.beat(2);

  await demo.step('카페·간식을 고르면 그 자리에서 고쳐진다');
  await recordSheet.feedback.categoryChip(MOVED_CATEGORY).click();
  // 고치고 나면 목록이 다시 접히고 거래 한 줄의 제목이 새 분류로 바뀐다.
  await expect(recordSheet.feedback.changeTitle).toBeHidden();
  await expect(recordSheet.feedback.rowTitle(MOVED_CATEGORY)).toBeVisible();
  await demo.beat(2);

  await demo.step('확인을 누르면 기록을 남긴 채 닫힌다');
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  // 되돌린 것이 아니라 남긴 것이다. 홈 숫자가 방금 저장한 만큼 움직인 채로 있다.
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(AMOUNT));
  await expect(home.today.row(MOVED_CATEGORY)).toBeVisible();
  await demo.clearStep();
  await demo.beat(2);

  await demo.step('무엇으로 냈는지는 저장이 끝난 뒤에 묻는다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(AMOUNT);
  await recordSheet.input.pickCategory(MOVED_CATEGORY);
  await recordSheet.feedback.waitSaved();
  // 적는 화면에는 이 칸이 없었다. 저장이 끝난 지금 상세 칸 아래에 선다.
  await expect(recordSheet.feedback.paymentGroup).toBeVisible();
  await demo.beat(2);

  await demo.step('신용카드를 고르면 그 자리에서 붙는다');
  await recordSheet.feedback.pickPayment('신용카드');
  await expect(recordSheet.feedback.paymentButton('신용카드')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await demo.beat(2);

  await demo.step('확인으로 닫으면 오늘 목록에 카페·간식 두 줄이 남는다');
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(AMOUNT * 2));
  await expect(home.today.row(MOVED_CATEGORY)).toHaveCount(2);
  await expect(home.today.row(FIRST_CATEGORY)).toHaveCount(0);
  await demo.clearStep();
  await demo.beat(3);
});
