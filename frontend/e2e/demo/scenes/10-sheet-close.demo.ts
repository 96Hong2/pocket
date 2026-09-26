import { expect, test } from '../support/director';

import { ROUTES } from '../../../src/app/router/routes';
import { formatCurrency } from '../../../src/shared/lib/format';

/**
 * 시트에서 나가는 길과, 나가지지 않는 경우를 한 파일에 담는다.
 *
 * 15 는 손잡이 · Esc · 시스템 뒤로가기 셋으로 저장 없이 닫는 모습이다.
 * 뒤로가기가 미니앱이 아니라 시트를 먼저 가져간다는 것이 요점이다. 찍어 둔 금액이 있으면
 * 어느 길로 닫든 한 번 묻는다.
 * 16 은 반대다. 저장이 실패하면 시트를 닫지 않고 찍어 둔 금액을 쥔 채 안내만 띄운다.
 * 60 은 묻는 쪽을 자세히 본다. 머무르면 적던 것이 그대로고, 분류 만들기 창은 그 창만 닫힌다.
 */

const CATEGORY = '식비';
const OTHER_CATEGORY = '카페·간식';

/** 홈에 미리 적어 두는 오늘 지출. 0원에서 시작하면 숫자가 그대로인지 알아보기 어렵다. */
const SEEDED = 20_000;
/** 닫기 전에 찍어 두는 금액. 저장하지 않고 사라지는 것을 보여준다. */
const TYPED = 3_500;
/** Esc 로 닫을 때 찍는 금액. 앞과 다른 값이라 새로 찍은 것이 화면에서 구분된다. */
const RETYPED = 7_000;

test('15 시트를 닫는 세 가지 방법 (손잡이 · Esc · 시스템 뒤로가기)', async ({
  appShell,
  demo,
  home,
  prep,
  recordSheet,
}) => {
  const categoryId = await prep.categoryIdByName(CATEGORY);
  await prep.addExpense({ amount: SEEDED, daysAgo: 0, categoryId });

  await home.open();
  await home.waitReady();
  await demo.open('시트 닫기', '저장 없이 나가는 세 가지 길. 뒤로가기는 미니앱보다 시트가 먼저다');

  await demo.step(`홈에는 오늘 적어 둔 ${formatCurrency(SEEDED)} 이 있다`);
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SEEDED));
  await expect(home.today.row(CATEGORY)).toBeVisible();
  await demo.beat(2);

  await demo.step(`시트를 열고 ${formatCurrency(TYPED)} 을 찍어 둔다`);
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(TYPED);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(TYPED));
  await demo.beat(2);

  await demo.step('맨 위 손잡이를 누른다. 찍어 둔 금액이 있어 한 번 묻는다');
  await recordSheet.closeButton.click();
  await expect(recordSheet.leave.draftText).toHaveText('적던 내용이 사라져요. 그만둘까요?');
  await demo.beat(2);

  await demo.step('그만두기를 누르면 시트가 닫힌다');
  await recordSheet.leave.leaveButton.click();
  await recordSheet.waitClosed();
  // 카테고리를 누르지 않았으니 저장이 아니다. 홈 숫자가 움직이면 안 된다.
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SEEDED));
  await demo.clearStep();
  await demo.beat(2);

  await demo.step('다시 열면 금액은 0원부터다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  // 닫을 때 시트 안쪽이 통째로 언마운트된다. 방금 찍은 3,500원이 남아 있지 않다.
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(0));
  await demo.beat(2);

  await demo.step(`이번엔 ${formatCurrency(RETYPED)} 을 찍고 Esc 를 누른다. 같은 확인을 지난다`);
  await recordSheet.input.enterAmount(RETYPED);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(RETYPED));
  await recordSheet.closeByEsc();
  await expect(recordSheet.leave.dialog).toBeVisible();
  await demo.beat(2);
  await recordSheet.leave.leaveButton.click();
  await recordSheet.waitClosed();
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SEEDED));
  await demo.clearStep();
  await demo.beat(2);

  await demo.step('세 번째는 토스 앱의 시스템 뒤로가기. 이번에는 아무것도 안 찍었다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  const beforeBack = appShell.pathname;
  expect(beforeBack, '홈에서 시작하지 않았다').toBe(ROUTES.home);
  await demo.beat(2);

  await demo.step('뒤로가기를 눌러도 미니앱이 아니라 시트가 닫힌다. 잃을 것이 없어 묻지 않는다');
  await appShell.pressBack();
  await recordSheet.waitClosed();
  await expect(recordSheet.leave.dialog).toHaveCount(0);
  // 미니앱이 닫혔다면 홈도 같이 사라진다. 화면이 살아 있고 경로도 그대로인 것이 그 증거다.
  await appShell.expectMounted();
  await expect(home.recordButton).toBeVisible();
  expect(appShell.pathname, '뒤로가기가 화면을 옮겼다').toBe(beforeBack);
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(SEEDED));
  await demo.clearStep();
  await demo.beat(3);
});

/** 저장에 실패시킬 금액. 실패한 뒤 그대로 다시 눌러 저장까지 이어 본다. */
const FAIL_AMOUNT = 8_900;

test('16 저장이 실패해도 시트는 닫히지 않고 금액이 남는다', async ({
  consoleErrorAllowList,
  demo,
  home,
  page,
  recordSheet,
}) => {
  // 이 장면이 보여주려는 것이 500 응답 자체다. 크로미움이 그것을 콘솔 오류로 적는 것만 눈감는다.
  consoleErrorAllowList.push(/Failed to load resource[\s\S]*500/);

  // 저장 요청을 붙잡아 둔다. 놓아 주기 전까지 '저장하는 중' 화면이 그대로 서 있어 눈에 담긴다.
  // 고정 시간으로 늦추면 늦게 풀리거나 일찍 풀려 그 화면을 놓친다.
  let releaseSave = (): void => {};
  const held = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });

  // 첫 저장만 실패시킨다. 두 번째부터는 진짜 서버가 답해야 재시도가 재시도로 보인다.
  let failNext = true;

  await page.route('**/api/v1/transactions', async (route) => {
    if (route.request().method() !== 'POST' || !failNext) {
      await route.continue();
      return;
    }
    failNext = false;
    await held;
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      // 진짜 서버가 500 에 실어 보내는 봉투 그대로다. 화면은 이 문구를 그대로 보여준다.
      body: JSON.stringify({
        error: { code: 'INTERNAL_ERROR', message: '잠시 후 다시 시도해 주세요.' },
      }),
    });
  });

  await home.open();
  await home.waitReady();
  await demo.open('저장이 실패하면', '시트를 닫지 않는다. 금액이 남아 그대로 다시 누르면 된다');

  await demo.step(`${formatCurrency(FAIL_AMOUNT)} 을 찍고 ${CATEGORY}를 누른다`);
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(FAIL_AMOUNT);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(FAIL_AMOUNT));
  await recordSheet.input.pickCategory(CATEGORY);

  await demo.step('답이 올 때까지는 저장하는 중이라고 말한다');
  await expect(recordSheet.input.hint).toHaveText('저장하는 중이에요');
  // 두 번 들어가지 않게 칩을 전부 잠근다. 누른 것만이 아니라 다른 칩도 같이 잠긴다.
  await expect(recordSheet.input.categoryChip(CATEGORY)).toBeDisabled();
  await expect(recordSheet.input.categoryChip(OTHER_CATEGORY)).toBeDisabled();
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(FAIL_AMOUNT));
  await demo.beat(2);

  await demo.step('서버가 실패로 답했다');
  releaseSave();
  await expect(recordSheet.input.notice).toHaveText('잠시 후 다시 시도해 주세요.');
  await demo.beat(2);

  await demo.step('시트는 그대로 열려 있고 금액도 지워지지 않는다');
  // 실패를 닫힘으로 덮으면 사용자는 찍어 둔 금액을 처음부터 다시 눌러야 한다.
  await recordSheet.waitOpen();
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(FAIL_AMOUNT));
  // 실패했으니 아무것도 안 적혔다. 홈 숫자가 0원 그대로다.
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(0));
  await demo.beat(3);

  await demo.step('칩이 다시 살아난다. 같은 칩을 한 번 더 누르면 저장된다');
  await expect(recordSheet.input.categoryChip(CATEGORY)).toBeEnabled();
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();
  await expect(recordSheet.feedback.headline).toContainText(formatCurrency(FAIL_AMOUNT));
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(FAIL_AMOUNT));
  await demo.beat(2);

  await demo.step('확인을 누르면 오늘 목록에 남는다');
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.today.row(CATEGORY)).toBeVisible();
  await demo.clearStep();
  await demo.beat(3);
});

/** 찍어 두고 닫으려 하는 금액. 머무르면 이 값이 그대로 남아 있어야 한다. */
const DRAFT_AMOUNT = 12_000;
/** 분류 만들기 창에 적어 두는 이름. */
const DRAFT_CATEGORY = '반려동물';

test('60 적다 만 것이 있으면 닫기 전에 한 번 묻는다', async ({ demo, home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await demo.open('적다 만 것', '실수로 닫아도 적던 것을 말없이 잃지 않는다');

  await demo.step(`기록하기를 누르고 ${formatCurrency(DRAFT_AMOUNT)}을 찍는다`);
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(DRAFT_AMOUNT);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(DRAFT_AMOUNT));
  await demo.beat(2);

  await demo.step('맨 위 손잡이를 잡고 아래로 끌어내린다');
  await recordSheet.dragDown();
  await expect(recordSheet.leave.draftText).toHaveText('적던 내용이 사라져요. 그만둘까요?');
  await demo.beat(3);

  await demo.step('「계속 쓰기」 를 누르면 찍어 둔 금액 그대로 돌아온다');
  await recordSheet.leave.stayButton.click();
  await expect(recordSheet.leave.dialog).toHaveCount(0);
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(DRAFT_AMOUNT));
  await demo.beat(2);

  await demo.step('이번에는 분류 칸의 「새 분류」 로 만들기 창을 연다');
  await recordSheet.input.openNewCategory();
  const compose = recordSheet.input.newCategoryForm;
  await expect(compose.title).toBeVisible();
  await demo.beat(2);

  await demo.step(`이름 칸에 ${DRAFT_CATEGORY}을 적어 둔다`);
  await compose.nameField.fill(DRAFT_CATEGORY);
  await expect(compose.nameField).toHaveValue(DRAFT_CATEGORY);
  await demo.beat(2);

  await demo.step('만들기 창을 손가락으로 아래로 끌어내린다');
  await compose.dragDown();
  await expect(recordSheet.leave.draftText).toHaveText('만들던 분류가 사라져요. 그만둘까요?');
  await demo.beat(3);

  await demo.step('「그만두기」 를 누르면 만들기 창만 닫히고 찍어 둔 금액은 남는다');
  await recordSheet.leave.leaveButton.click();
  await expect(compose.title).toHaveCount(0);
  await recordSheet.waitOpen();
  await expect(recordSheet.input.amountText).toHaveText(formatCurrency(DRAFT_AMOUNT));
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
