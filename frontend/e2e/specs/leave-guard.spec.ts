import type { Page } from '@playwright/test';

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
  const box = await page.locator(selector).first().boundingBox();
  if (box == null) throw new Error(`${selector} 를 화면에서 못 찾았다`);
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
  test('기록 고치기에서 안쪽을 쓸어내려도 시트가 안 닫힌다', async ({
    page,
    prep,
    calendar,
  }) => {
    await prep.addTransaction({ amount: 12_000, merchant: '김밥천국', daysAgo: 0 });
    await calendar.open();
    await calendar.waitReady();
    await calendar.list.pick('김밥천국');
    await expect(calendar.edit.dialog).toBeVisible();

    /*
      고치기 시트는 안쪽(`.tx-edit__scroll`)만 굴러간다. 거기서 아래로 쓴 것은
      「위로 올려 보겠다」 는 뜻이지 닫으라는 뜻이 아니다.
    */
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

  test('이름만 적고 아이콘 격자를 쓸어내려도 창이 안 닫힌다', async ({
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
    await form.nameField.fill('반려동물');
    await expect(form.iconGrid).toBeVisible();

    // 격자는 자기만 굴러가는 상자다. 거기서 아래로 쓴 것은 닫으라는 뜻이 아니다.
    await swipeDown(page, '.icon-picker__grid');
    await expect(form.title).toBeVisible();
    await expect(form.nameField).toHaveValue('반려동물');
  });
});
