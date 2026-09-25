import type { Locator, Page } from '@playwright/test';

import { LeaveConfirmArea } from '../screens/RecordSheet';
import { expect, test } from '../support/fixtures';

/**
 * 🔴 **적던 것이 말없이 사라지던 자리**(2026-09-25 사용자 신고).
 *
 * 「기록 수정 · 추가하다가 중간에 스크롤 내렸을 때, 카테고리 추가하다가 스크롤 내리면
 * 그냥 바로 작성하던 창이 닫히던데 ... 2번이나 있어서 처음부터 다시 작성했어야 했어.」
 *
 * 원인이 둘이었다.
 *
 * ① **안쪽에 따로 굴러가는 상자를 못 봤다.** 기록 고치기 시트와 아이콘 격자는 자기만
 *   굴러서 시트의 `scrollTop` 이 늘 0인데, 손짓 판정이 그 0을 「맨 위니까 닫아도 된다」
 *   로 읽었다. 읽던 자리를 도로 올리려고 아래로 쓸면 시트째 닫혔다
 * ② **묻는 기준이 읽어 온 건수뿐이었다.** 손으로 적은 금액 · 줄글 초안 · 만들던 분류는
 *   세지 않아, 딤이나 뒤로가기로 닫아도 확인 창이 안 떴다
 *
 * ①은 `sheetDrag.test.ts` 가 표로 재고, 여기서는 **화면에서 실제로 무엇이 남는지**를 본다.
 */

/** 시트 안쪽 어딘가를 잡고 아래로 쭉 쓴다. 손잡이가 아니라 본문이다. */
async function swipeDown(page: Page, selector: string): Promise<void> {
  await swipeDownAt(page, page.locator(selector).first());
}

/**
 * 굴리기가 가라앉기를 기다린다.
 *
 * 밀어 닫기 규칙이 「방금 굴린 참인가」 를 시간으로 재기 때문에(`SCROLL_SETTLE_MS`),
 * 화면이 열리자마자 쓸면 규칙이 아니라 그 유예가 막는다. 사람 손은 그보다 느리다.
 */
async function settleScroll(page: Page): Promise<void> {
  await page.waitForTimeout(600);
}

/**
 * 만들기 화면의 「아이콘」 이름표. 버튼도 입력칸도 아니라 손짓을 시작할 수 있는 자리다.
 *
 * **페이지 전역에서 글자로 찾지 않는다.** 같은 글자가 하나라도 더 생기면 조용히 다른
 * 것을 집고, 그것이 숨은 탭 안이면 엉뚱한 실패로 죽는다.
 */
function composeIconLabel(page: Page): Locator {
  return page.locator('.cat-sheet__field--icon > .cat-sheet__label');
}

async function swipeDownAt(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  if (box == null) throw new Error('끌 자리를 화면에서 못 찾았다');
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(40, box.height / 3);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (const step of [20, 60, 110, 170, 230]) {
    await page.mouse.move(x, y + step);
  }
  await page.mouse.up();
}

test.describe('적던 것을 말없이 잃지 않는다', () => {
  test('기록 고치기에서 내려 읽다 되올려도 시트가 안 닫힌다', async ({ page, prep, calendar }) => {
    await prep.addTransaction({ amount: 12_000, merchant: '김밥천국', daysAgo: 0 });
    await calendar.open();
    await calendar.waitReady();
    await calendar.list.pick('김밥천국');
    await expect(calendar.edit.dialog).toBeVisible();

    /*
      고치기 시트는 안쪽(`.tx-edit__scroll`)만 굴러간다. **한 번 내려 읽은 뒤** 아래로
      쓴 것은 「위로 올려 보겠다」 는 뜻이지 닫으라는 뜻이 아니다. 신고된 장면이 이것이다.
    */
    await page.locator('.tx-edit__scroll').evaluate((node) => {
      node.scrollTop = 150;
    });
    await swipeDown(page, '.tx-edit__scroll');
    await expect(calendar.edit.dialog).toBeVisible();
  });

  test('고친 값을 두고 나가려 하면 한 번 묻는다', async ({ page, prep, calendar }) => {
    const leave = new LeaveConfirmArea(page);
    await prep.addTransaction({ amount: 12_000, merchant: '김밥천국', daysAgo: 0 });
    await calendar.open();
    await calendar.waitReady();
    await calendar.list.pick('김밥천국');
    await expect(calendar.edit.dialog).toBeVisible();

    await calendar.edit.merchant.fill('스타벅스');
    await page.keyboard.press('Escape');

    await expect(leave.dialog).toBeVisible();
    await expect(leave.draftText).toBeVisible();

    // 머무는 쪽을 고르면 고쳐 둔 값이 그대로 있다.
    await leave.stayButton.click();
    await expect(calendar.edit.dialog).toBeVisible();
    await expect(calendar.edit.merchant).toHaveValue('스타벅스');
  });

  test('아무것도 안 고쳤으면 안 붙잡는다', async ({ page, prep, calendar }) => {
    const leave = new LeaveConfirmArea(page);
    await prep.addTransaction({ amount: 12_000, merchant: '김밥천국', daysAgo: 0 });
    await calendar.open();
    await calendar.waitReady();
    await calendar.list.pick('김밥천국');
    await expect(calendar.edit.dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(calendar.edit.dialog).toHaveCount(0);
    await expect(leave.dialog).toHaveCount(0);
  });

  test('키패드에 금액을 눌러 두고 나가려 하면 한 번 묻는다', async ({
    page,
    home,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();

    await recordSheet.input.enterAmount(24_000);
    await page.keyboard.press('Escape');

    await expect(recordSheet.leave.dialog).toBeVisible();
    await recordSheet.leave.stayButton.click();
    // 눌러 둔 금액이 그대로다. 처음부터 다시 누르게 하지 않는다.
    await expect(recordSheet.input.amountText).toContainText('24,000');
  });

  test('줄글을 적어 두고 나가려 하면 한 번 묻는다', async ({ page, recordSheet, home }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.methodTab('줄글').click();

    /*
      읽기를 안 눌렀으니 읽어 온 건수는 0이다. **옛 기준으로는 아무것도 안 물었다.**
      열 줄을 적어 둔 사람에게 0건은 「잃을 것이 없다」 가 아니다.
    */
    await recordSheet.nl.textarea.fill('어제 김밥천국 8000원\n그제 스타벅스 4500원');
    await page.keyboard.press('Escape');

    await expect(recordSheet.leave.dialog).toBeVisible();
    await recordSheet.leave.stayButton.click();
    await expect(recordSheet.nl.textarea).toHaveValue(/김밥천국/);
  });

  test('분류를 만들던 중에 나가려 하면 한 번 묻는다', async ({ home, recordSheet }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();

    await recordSheet.input.enterAmount(24_000);
    await recordSheet.input.openNewCategory();
    const form = recordSheet.input.newCategoryForm;
    await expect(form.title).toBeVisible();
    await form.nameField.fill('반려동물');

    await form.backButton.click();
    await expect(recordSheet.leave.dialog).toBeVisible();

    await recordSheet.leave.stayButton.click();
    // 적어 둔 이름이 그대로 있고, 만들기 화면도 그대로다.
    await expect(form.nameField).toHaveValue('반려동물');

    // 그만두기를 고르면 만들기만 닫히고 적던 금액은 남는다.
    await form.backButton.click();
    await recordSheet.leave.leaveButton.click();
    await expect(form.title).toHaveCount(0);
    await expect(recordSheet.input.amountText).toContainText('24,000');
  });

  test('아이콘 격자를 굴려 놓고 되올려도 창이 안 닫힌다', async ({ page, home, recordSheet }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.input.openNewCategory();

    const form = recordSheet.input.newCategoryForm;
    await form.nameField.fill('반려동물');
    await expect(form.iconGrid).toBeVisible();

    /*
      격자를 한 번 굴려 놓고 되올린다. **신고된 장면이 정확히 이것이다.**
      확인 창이 대신 막아 준 것이 아니라 손짓 판정이 막았는지를 보려고, 창이 안 뜬 것까지
      단언한다. 이게 없으면 판정을 옛날로 되돌려도 이 검사가 초록으로 남는다.
    */
    await page.locator('.icon-picker__grid').evaluate((node) => {
      node.scrollTop = 120;
    });
    await swipeDown(page, '.icon-picker__grid');
    await expect(recordSheet.leave.dialog).toHaveCount(0);
    await expect(form.title).toBeVisible();
    await expect(form.nameField).toHaveValue('반려동물');
  });
});

/**
 * 🔴 **첫 판으로 안 끝났다**(2026-09-25 두 번째 신고).
 *
 * 「지금도 기록 수정하거나 새 카테고리 추가하다가 스크롤해서 창 닫으면 아무 알림창 없이
 * 바로 닫히는데?」
 *
 * 앞의 검사들은 **굴려 놓은 상태에서** 아래로 쓴 한 번만 봤다. 실제 손짓은 그렇지 않다.
 * 폰에서는 튕겨 올리는 손짓이 여러 번 이어지고, 그 사이에 맨 위(0)에 닿는다. 닿은 다음
 * 한 번은 「맨 위니까 닫아도 된다」 로 읽혀 시트가 통째로 닫혔다.
 *
 * 그래서 위치만 보지 않고 **방금 굴린 참인지**를 함께 본다.
 *
 * ⚠ 한때 「굴러갈 수 있으면 본문에서는 아예 안 끈다」 로 넓혔다가 되돌렸다. `.pk-sheet` 는
 * 전부 `overflow-y: auto` 라 내용이 긴 시트가 통째로 걸려들었다. 그래서 아래에 **여전히
 * 닫혀야 하는** 손짓도 함께 둔다. 한쪽만 재면 다음 판에서 또 과하게 막는다.
 */
test.describe('굴러가는 시트는 굴리는 손짓으로 안 닫힌다', () => {
  /**
   * 내려 읽었다가 맨 위까지 되올린 **직후에** 한 번 더 쓴다. 신고된 손짓이다.
   *
   * 되올리기를 `scrollTop` 으로 만든다. 마우스 휠로 만들면 굴리기가 언제 멈추는지가
   * 실행마다 달라, 맨 위에 안 닿은 채로 쓸어서 **옛 규칙에도 통과하는** 검사가 된다.
   * 실제로 그렇게 만들었다가 사보타주에 안 걸려서 고쳤다. 자리(맨 위)와 시각(방금 굴림)
   * 둘 다 신고된 장면과 같아야 한다.
   */
  async function backToTopThenSwipe(page: Page, selector: string): Promise<void> {
    const box = await page.locator(selector).first().boundingBox();
    if (box == null) throw new Error(`${selector} 를 화면에서 못 찾았다`);
    const x = box.x + box.width / 2;
    const y = box.y + Math.min(40, box.height / 3);

    const top = await page
      .locator(selector)
      .first()
      .evaluate((node) => {
        node.scrollTop = 200; // 내려 읽었다
        node.scrollTop = 0; // 되올렸다. 여기서 scroll 이 난다
        return node.scrollTop;
      });
    // 맨 위에 실제로 닿았는지 못 박는다. 안 닿았으면 옛 규칙으로도 통과한다.
    expect(top).toBe(0);

    await page.mouse.move(x, y);
    await page.mouse.down();
    for (const step of [20, 60, 110, 170, 230]) {
      await page.mouse.move(x, y + step);
    }
    await page.mouse.up();
  }

  test('기록 고치기: 맨 위까지 되올린 뒤 한 번 더 쓸어도 안 닫힌다', async ({
    page,
    prep,
    calendar,
  }) => {
    await prep.addTransaction({ amount: 12_000, merchant: '김밥천국', daysAgo: 0 });
    await calendar.open();
    await calendar.waitReady();
    await calendar.list.pick('김밥천국');
    await expect(calendar.edit.dialog).toBeVisible();

    await backToTopThenSwipe(page, '.tx-edit__scroll');
    await expect(calendar.edit.dialog).toBeVisible();
  });

  test('분류 만들기: 격자를 맨 위까지 되올린 뒤 한 번 더 쓸어도 안 닫힌다', async ({
    page,
    home,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.input.openNewCategory();

    const form = recordSheet.input.newCategoryForm;
    await expect(form.iconGrid).toBeVisible();

    await backToTopThenSwipe(page, '.icon-picker__grid');
    await expect(form.title).toBeVisible();
  });

  test('손잡이로는 그대로 닫힌다', async ({ page, prep, calendar }) => {
    await prep.addTransaction({ amount: 12_000, merchant: '김밥천국', daysAgo: 0 });
    await calendar.open();
    await calendar.waitReady();
    await calendar.list.pick('김밥천국');
    await expect(calendar.edit.dialog).toBeVisible();

    await swipeDown(page, '[data-sheet-handle]');
    await expect(calendar.edit.dialog).toHaveCount(0);
  });

  test('🔴 굴리지 않고 본문을 잡아 내리면 기록 시트가 닫힌다', async ({
    page,
    home,
    recordSheet,
  }) => {
    /*
      🔴 **과하게 막았다가 되돌린 자리다**(PR #84 리뷰). `.pk-sheet` 는 전부
      `overflow-y: auto` 라, 굴러갈 수 있다는 것만으로 막으면 내용이 긴 시트가 통째로
      걸려든다. 이 앱의 간판인 10초 기록 키패드가 그렇게 죽었다(iPhone 14 에서 762px).

      아무것도 안 적었으니 확인 창 없이 그냥 닫힌다.
    */
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();

    // 금액 표시 줄이다. 버튼도 입력칸도 아니라 여기서 시작한 손짓은 닫기로 읽혀야 한다.
    await swipeDownAt(page, recordSheet.input.amountText);
    await expect(recordSheet.leave.dialog).toHaveCount(0);
    await recordSheet.waitClosed();
  });
});

/**
 * 🔴 **세 번째 신고**(2026-09-25 밤).
 *
 * 「수정중일때는 정상 동작하는데 새 카테고리 추가 화면에서 화면을 내렸을 때는 그대로
 * 닫혀버려. 수정 화면에서 새 카테고리 추가 시에는 닫으면 수정 화면으로 돌아가야지
 * 다 닫히는 게 아니라.」
 *
 * 앞 판들은 **굴린 뒤의 손짓**만 막았다. 새 분류 만들기는 굴리지 않고도 닫혔다.
 * 기록 시트의 만들기 화면은 덮는 창이 아니라 **시트 안쪽을 통째로 바꾸는 방식**이라,
 * 본문을 잡아 내리면 시트의 밀어 닫기가 그대로 돌아 기록 시트째 사라졌다. 적어 둔
 * 금액과 고른 날까지 함께 갔다.
 *
 * 닫는 손짓이 **한 겹만 접어야 한다.** 만들기 화면에서 내리면 만들기만 접히고 적던
 * 화면으로 돌아온다. 잃을 것이 있으면 그 전에 묻는다.
 */
test.describe('분류 만들기는 한 겹만 접힌다', () => {
  test('🔴 기록 시트에서 만들다 본문을 잡아 내리면 기록 화면으로 돌아온다', async ({
    page,
    home,
    recordSheet,
  }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();

    await recordSheet.input.enterAmount(24_000);
    await recordSheet.input.openNewCategory();
    const form = recordSheet.input.newCategoryForm;
    await expect(form.title).toBeVisible();

    /*
      창이 열리면서 한 번 굴러간다. 그 직후 400ms 는 굴리는 손짓으로 치는 구간이라
      여기서 바로 쓸면 규칙이 아니라 그 유예가 막는다(가라앉기를 기다린다).
    */
    await settleScroll(page);
    // 굴리지 않았다. 「아이콘」 이라고 적힌 이름표라 버튼도 입력칸도 아니다.
    await swipeDownAt(page, composeIconLabel(page));

    // 만들기만 접히고 기록 시트는 그대로다. 눌러 둔 금액도 살아 있다.
    await expect(form.title).toHaveCount(0);
    await expect(recordSheet.input.amountText).toContainText('24,000');
  });

  test('🔴 적어 둔 이름이 있으면 잡아 내려도 한 번 묻는다', async ({ page, home, recordSheet }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();

    await recordSheet.input.openNewCategory();
    const form = recordSheet.input.newCategoryForm;
    await form.nameField.fill('반려동물');

    await settleScroll(page);
    await swipeDownAt(page, composeIconLabel(page));
    await expect(recordSheet.leave.dialog).toBeVisible();

    await recordSheet.leave.stayButton.click();
    await expect(form.nameField).toHaveValue('반려동물');

    /*
      그만두기를 골라도 **한 겹만 접힌다.** 이 줄이 없으면 시트째 닫히던 옛 동작으로도
      이 검사가 초록으로 남는다(옛 동작도 묻기는 물었다. 다만 다 닫았다).
    */
    await settleScroll(page);
    await swipeDownAt(page, composeIconLabel(page));
    await recordSheet.leave.leaveButton.click();
    await expect(form.title).toHaveCount(0);
    await recordSheet.waitOpen();
  });

  test('🔴 덮는 창에서도 적어 둔 것이 있으면 내릴 때 묻는다', async ({ page, prep, calendar }) => {
    /*
      손짓으로 창을 접는 길은 이번에 새로 생겼다. 「이전」 버튼만 묻고 손짓은 그냥
      접히면, 어디로 나가느냐에 따라 잃는 것이 달라진다.
    */
    await prep.addTransaction({ amount: 12_000, merchant: '김밥천국', daysAgo: 0 });
    await calendar.open();
    await calendar.waitReady();
    await calendar.list.pick('김밥천국');
    await calendar.edit.openNewCategory();
    await calendar.edit.newCategoryNameField.fill('반려동물');

    await settleScroll(page);
    await swipeDownAt(page, composeIconLabel(page));
    await expect(page.locator('.record-leave')).toBeVisible();

    await page.getByRole('button', { name: '계속 쓰기' }).click();
    await expect(calendar.edit.newCategoryNameField).toHaveValue('반려동물');
    await expect(calendar.edit.dialog).toBeVisible();
  });

  test('기록 고치기에서 만들 때는 덮는 창이 손짓을 다 받는다', async ({ page, prep, calendar }) => {
    await prep.addTransaction({ amount: 12_000, merchant: '김밥천국', daysAgo: 0 });
    await calendar.open();
    await calendar.waitReady();
    await calendar.list.pick('김밥천국');
    await expect(calendar.edit.dialog).toBeVisible();

    await calendar.edit.openNewCategory();
    await expect(calendar.edit.newCategoryTitle).toBeVisible();

    await settleScroll(page);
    await swipeDownAt(page, composeIconLabel(page));

    /*
      🔴 여기가 무너져 있었다. 덮는 창은 `createPortal` 로 `body` 에 붙지만 리액트 안에서는
      시트의 자식이라, 합성 이벤트가 시트의 끌기까지 올라가 **둘 다** 사라졌다.
      이제 한 겹만 접힌다. 고치던 기록은 그대로 남는다.
    */
    await expect(calendar.edit.newCategoryTitle).toHaveCount(0);
    await expect(calendar.edit.dialog).toBeVisible();
  });
});
