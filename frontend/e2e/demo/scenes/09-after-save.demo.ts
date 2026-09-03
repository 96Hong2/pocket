import { expect, test } from '../support/director';

import { formatCurrency } from '../../../src/shared/lib/format';

/**
 * 저장한 뒤에 고치는 흐름을 찍는다.
 *
 * 카테고리 바꾸기로 칩을 펼쳐 다른 분류로 옮기고, 확인으로 시트를 닫는다.
 * 시트를 다시 열면 '한 번 더' 칩이 떠서 같은 기록이 한 번에 만들어지는 것까지 이어 본다.
 * 그 칩은 직전 저장 이력을 읽으므로, 시트를 닫았다 다시 열어야 보인다.
 */

const AMOUNT = 12_000;
const FIRST_CATEGORY = '식비';
const MOVED_CATEGORY = '카페·간식';

test('14 저장한 뒤 카테고리 고치고 한 번 더로 반복하기', async ({
  demo,
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await demo.open('저장한 뒤에 고치기', '분류를 바꾸고, 다음엔 칩 하나로 같은 기록을 만든다');

  await demo.step('먼저 12,000원을 식비로 저장한다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(AMOUNT);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(AMOUNT));
  await recordSheet.input.pickCategory(FIRST_CATEGORY);
  await recordSheet.feedback.waitSaved();
  await expect(recordSheet.feedback.headline).toContainText(formatCurrency(AMOUNT));
  await demo.beat(2);

  await demo.step('카테고리 바꾸기를 누르면 칩이 펼쳐진다');
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

  await demo.step('다시 열면 한 번 더 칩이 떠 있다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  // 칩이 읽는 것은 저장 시점의 기록이다. 저장한 뒤 분류를 바꾼 것은 여기 반영되지 않아
  // 칩에는 처음 고른 식비가 그대로 적힌다.
  await expect(recordSheet.input.repeatChip).toHaveText(
    `한 번 더 · ${FIRST_CATEGORY} ${formatCurrency(AMOUNT)}`,
  );
  await demo.beat(2);

  await demo.step('칩 하나로 금액·분류·저장이 한꺼번에 끝난다');
  await recordSheet.input.repeatChip.click();
  await recordSheet.feedback.waitSaved();
  await expect(recordSheet.feedback.rowTitle(FIRST_CATEGORY)).toBeVisible();
  // 키패드를 한 번도 누르지 않았는데 이번 달 지출이 한 건만큼 더 늘었다.
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(AMOUNT * 2));
  await demo.beat(2);

  await demo.step('확인으로 닫으면 오늘 목록에 두 줄이 남는다');
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.today.row(FIRST_CATEGORY)).toBeVisible();
  await expect(home.today.row(MOVED_CATEGORY)).toBeVisible();
  await demo.clearStep();
  await demo.beat(3);
});
