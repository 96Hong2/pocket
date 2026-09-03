import { formatCurrency } from '../../../src/shared/lib/format';
import { expect, test } from '../support/director';

/**
 * 되돌리기 한 편.
 *
 * 저장 직후 버튼 옆 숫자가 8부터 줄어드는 것, 그 안에 누르면 홈 숫자가 새로고침 없이
 * 원래대로 돌아오는 것, 그리고 시간이 지난 뒤 누르면 무슨 안내가 뜨는지까지 이어서 찍는다.
 * 되돌리기 전에 홈 숫자가 실제로 늘었는지를 먼저 화면에 담아 왕복을 증명한다.
 */

/** 먼저 심어 두는 이번 달 지출. 0원에서 시작하면 숫자가 움직였는지 알아보기 어렵다. */
const SEEDED = 20_000;
/** 되돌릴 기록. */
const AMOUNT = 12_000;
/** 만료를 보여줄 두 번째 기록. 앞 금액과 다른 값이라 화면에서 구분된다. */
const LATER_AMOUNT = 4_500;
const CATEGORY = '식비';

/** 서버 허용치는 되돌리기 창 8초 + 왕복 여유 3초다. 그 뒤에 눌러야 만료 답이 온다. */
const EXPIRY_WAIT_MS = 12_000;

test('13 되돌리기 카운트다운과 만료 안내', async ({
  demo,
  home,
  prep,
  recordSheet,
  consoleErrorAllowList,
}) => {
  // 만료 뒤 되돌리기는 서버가 409 로 거절한다. 크로미움이 그 응답을 콘솔 오류로 적는데,
  // 이 장면이 보여주려는 것이 바로 그 거절이라 이것만 눈감는다.
  consoleErrorAllowList.push(/Failed to load resource[\s\S]*409/);

  await prep.addExpense({ amount: SEEDED, daysAgo: 0 });

  await home.open();
  await home.waitReady();
  await demo.open('되돌리기', '저장 직후 8초 안에 누르면 없던 일이 된다');

  await demo.step(`이번 달 지출은 지금 ${formatCurrency(SEEDED)}`);
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SEEDED));
  await demo.beat(2);

  await demo.step(`${formatCurrency(AMOUNT)} ${CATEGORY}를 저장한다`);
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(AMOUNT);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(AMOUNT));
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();

  // 되돌리기 전에 홈 숫자가 실제로 움직였는지부터 못 박는다.
  // 이것이 없으면 저장 반영이 통째로 빠져도 나중에 보는 원래 값이 초록으로 통과한다.
  await demo.step(`홈 숫자가 ${formatCurrency(SEEDED + AMOUNT)} 로 늘었다`);
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SEEDED + AMOUNT));
  await demo.beat(2);

  await demo.step('되돌리기 옆 숫자가 8부터 줄어든다');
  const started = await recordSheet.feedback.undoSecondsLeft();
  expect(started, '되돌리기 남은 초가 화면에 없다').not.toBeNull();
  expect(started ?? 0, '남은 초가 이미 0이다').toBeGreaterThan(0);
  await demo.beat(2);
  await expect
    .poll(() => recordSheet.feedback.undoSecondsLeft(), { message: '남은 초가 줄지 않는다' })
    .toBeLessThan(started ?? 0);

  await demo.step('아직 창이 열려 있을 때 되돌리기를 누른다');
  await recordSheet.feedback.undo();
  await recordSheet.waitClosed();

  await demo.clearStep();
  // 새로고침 없이 돌아와야 한다. 홈을 다시 열면 배선이 빠져도 이 단언이 통과한다.
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SEEDED));
  await demo.beat(3);

  await demo.step(`이번에는 되돌리지 않는다. ${formatCurrency(LATER_AMOUNT)} 저장`);
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(LATER_AMOUNT);
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();
  const savedAt = Date.now();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SEEDED + LATER_AMOUNT));

  await demo.step('8초가 지나면 숫자 배지만 사라진다. 버튼은 그대로 남는다');
  await expect
    .poll(() => recordSheet.feedback.undoSecondsLeft(), {
      message: '되돌리기 배지가 사라지지 않는다',
      timeout: 15_000,
    })
    .toBe(0);
  await expect(recordSheet.feedback.undoButton).toBeVisible();
  await demo.beat(2);

  await demo.step('서버가 봐 주는 3초 여유까지 흘려보낸다');
  await demo.beat(3);
  await expect
    .poll(() => Date.now() - savedAt, { message: '만료까지 기다리지 못했다', timeout: 20_000 })
    .toBeGreaterThan(EXPIRY_WAIT_MS);

  await demo.step('시간이 지난 뒤 되돌리기를 누르면');
  await recordSheet.feedback.undo();

  await expect(recordSheet.feedback.notice).toHaveText(
    '되돌릴 수 있는 시간이 지났어요. 카테고리는 아래에서 바꿀 수 있어요.',
  );
  // 다시 눌러도 같은 답이라 버튼을 아예 거둔다. 카드와 나머지 버튼은 남는다.
  await expect(recordSheet.feedback.undoButton).toHaveCount(0);
  await expect(recordSheet.feedback.changeCategoryButton).toBeVisible();
  await expect(recordSheet.feedback.confirmButton).toBeVisible();
  // 거절당했으니 기록은 그대로다. 홈 숫자도 저장된 값을 지킨다.
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SEEDED + LATER_AMOUNT));
  await demo.beat(3);

  await demo.step('확인을 누르면 시트가 닫히고 기록은 남는다');
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await demo.clearStep();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SEEDED + LATER_AMOUNT));
  await demo.beat(3);
});
