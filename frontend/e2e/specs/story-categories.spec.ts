import { QUICK_LIMIT } from '../../src/shared/ledger/quickPick';
import { E2E_API_URL } from '../support/env';
import { expect, test } from '../support/fixtures';

/**
 * 분류를 만들고 고치고 옮기는 사람이 실제로 막히는 자리.
 *
 * 기능이 있는지는 `categories.spec.ts` · `category-order.spec.ts` · `merchant-rules.spec.ts`
 * 가 이미 본다. 여기서 보는 것은 **그 기능을 쓰다가 손이 멈추는 순간**이다.
 * 화면이 약속한 것과 다른 것이 나오거나, 방금 한 일이 말없이 사라지거나,
 * 잘못 누른 뒤 물러날 길이 있는지가 그것이다.
 */

const PET = '반려동물';
const PET_ICON = 'paw';
const VET = '동물병원';
const ETC = '기타';
const ORDER = `${E2E_API_URL}/api/v1/categories/order`;

/**
 * 경계선이 하는 약속.
 *
 * 앞자리가 열한 개뿐이라, 분류가 그보다 많아진 사람은 이 선을 보고 순서를 맞춘다.
 * 선 위가 기록 화면에 서는 묶음과 다르면, 선을 믿고 맞춘 순서가 화면과 어긋난다.
 * 스위치를 하나도 안 건드리면 둘이 같으므로 **끄고 나서** 본다.
 */
test('분류 하나를 꺼 둬도 경계선 위가 기록 화면 칩과 같다', async ({
  categories,
  home,
  prep,
  recordSheet,
}) => {
  // 기본 지출이 열한 개라, 둘을 더해야 앞자리가 넘쳐 선이 그어진다.
  await prep.addCategory(PET);
  await prep.addCategory('자기계발');

  await categories.open();
  await categories.waitReady();

  // 앞자리 안에 있는 줄을 끈다. 뒤쪽 줄을 끄면 두 계산이 어긋날 일이 없다.
  await categories.quickToggle('식비').click();
  await expect(categories.quickToggle('식비')).toHaveAttribute('aria-checked', 'false');

  await expect(categories.quickEdge('지출 카테고리')).toBeVisible();
  /*
    선이 약속하는 것은 「선 위」 가 아니라 **「선 위에서 켜 둔 것」** 이다.
    꺼 둔 줄은 선 위에 있어도 기록 화면에 안 선다. 선은 켜 둔 줄로만 세어 긋는다.
  */
  const promised = await categories.quickNamesAboveQuickEdge('지출 카테고리');

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  const chips = await recordSheet.input.categoryChipNames();
  expect(chips).toHaveLength(QUICK_LIMIT);
  // 자리 순서는 둘 다 목록 순서 그대로라, 어긋나는 것은 어떤 이름이 들었느냐다.
  expect([...promised].sort()).toEqual([...chips].sort());
});

/**
 * 분류를 지우면 그 분류를 가리키던 규칙 줄도 같이 사라져야 한다.
 *
 * 확인 문구가 「걸어 둔 한도와 기억한 분류는 함께 사라져요」 라고 약속한다.
 * 같은 화면 아래에 죽은 분류를 가리키는 줄이 남으면, 그 줄의 지우기는
 * 서버에 없는 것을 지우려 든다.
 */
test('카테고리를 지우면 그 분류를 걸어 둔 규칙 줄도 그 자리에서 사라진다', async ({
  categories,
}) => {
  await categories.open();
  await categories.waitReady();
  await categories.create(PET, PET_ICON);

  await categories.rules.add(VET, PET);
  await expect(categories.rules.row(VET)).toContainText(PET);

  await categories.openEdit(PET);
  await categories.sheet.deleteButton.click();
  // 화면이 하는 약속이다. 아래 단언이 그 약속을 지키는지 본다.
  await expect(categories.sheet.confirmText).toBeVisible();
  await categories.sheet.confirmDeleteButton.click();
  await categories.sheet.waitClosed();

  await expect(categories.row(PET)).toHaveCount(0);
  // 화면을 다시 열지 않는다. 다시 열어야 맞아지는 것은 그 사이에 잘못 누를 수 있다는 뜻이다.
  await expect(categories.rules.row(VET)).toHaveCount(0);
  await expect(categories.rules.emptyTitle).toBeVisible();
});

/**
 * 앞자리 밖으로 밀어 둔 분류로 적어 둔 기록을 고칠 때.
 *
 * 칩 목록이 접혀 있으면 지금 걸린 분류가 화면 어디에도 눌린 표시로 안 보인다.
 * 아무것도 안 골라진 것처럼 보여, 상호만 고치러 온 사람이 아무거나 눌러 분류를 바꾼다.
 */
test('꺼 둔 분류로 적은 기록도 고칠 때 그 분류가 눌린 채로 보인다', async ({
  calendar,
  categories,
  prep,
}) => {
  const etcId = await prep.categoryIdByName(ETC);
  await prep.addTransaction({ amount: 18_000, merchant: '잡화점', categoryId: etcId });

  await categories.open();
  await categories.waitReady();
  await categories.quickToggle(ETC).click();
  await expect(categories.quickToggle(ETC)).toHaveAttribute('aria-checked', 'false');

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('잡화점');
  await calendar.edit.waitOpen();

  // 고른 것이 뒤에 숨어 있으면 펴진 채로 연다. 「더 보기」를 한 번 더 누르게 하지 않는다.
  await expect(calendar.edit.pickedCategory).toHaveText(new RegExp(`${ETC}$`));
  await expect(calendar.edit.moreCategoriesButton).toHaveCount(0);
  // 접으면 눌러 둔 표시가 다시 사라진다. 접는 길 자체가 없어야 한다.
  await expect(calendar.edit.foldCategoriesButton).toHaveCount(0);
});

/**
 * 옮긴 순서가 서버에 못 갔을 때.
 *
 * 화면은 누르는 즉시 움직인다. 저장이 실패해도 화면은 옮겨진 순서를 그대로 들고 있어서,
 * 다 된 줄 알고 나간 사람은 다음에 열었을 때 전부 원래대로인 것을 본다.
 * 이 앱에서 굳이 손대 본 유일한 설정이 그렇게 조용히 지워진다.
 */
test.describe('순서 저장이 실패했을 때', () => {
  test.use({
    // 우리가 일부러 500 을 내려보낸다. 브라우저가 그 응답을 콘솔에 적는 것뿐이다.
    consoleErrorAllowList: [/Failed to load resource[\s\S]*500/],
  });

  test('저장이 실패하면 그 자리에서 말한다', async ({ categories, page }) => {
    await categories.open();
    await categories.waitReady();

    await page.route(ORDER, async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 500, body: '{}' });
        return;
      }
      await route.continue();
    });

    const sent = page.waitForResponse(ORDER);
    await categories.moveUpButton('카페·간식').click();
    await expect
      .poll(async () => (await categories.sectionNames('지출 카테고리'))[0])
      .toBe('카페·간식');
    expect((await sent).status(), '순서를 보내지 않았다').toBe(500);

    // 여기가 비어 있으면 옮긴 사람은 실패한 줄 모른 채 화면을 떠난다.
    await expect(categories.orderSaveError).toBeVisible();

    await page.unroute(ORDER);
    await categories.open();
    await categories.waitReady();
    // 실패한 순서는 서버에 없다. 말해 주지 않으면 이 되돌림을 아무도 예상하지 못한다.
    await expect.poll(async () => (await categories.sectionNames('지출 카테고리'))[0]).toBe('식비');
  });
});

/**
 * 잘못 눌렀을 때 물러나는 길.
 *
 * 「고치기」 옆이 「지우기」 라 잘못 누르는 일이 잦다. 되돌릴 수 없는 자리라서
 * 물러나는 한 걸음이 제대로 서 있어야 한다.
 */
test('지우기를 눌렀다가 「그대로 둘게요」로 물러나면 분류가 그대로 남는다', async ({
  categories,
}) => {
  await categories.open();
  await categories.waitReady();
  await categories.create(PET, PET_ICON);

  await categories.openEdit(PET);
  await categories.sheet.deleteButton.click();
  await expect(categories.sheet.confirmArea).toBeVisible();

  await categories.sheet.keepButton.click();

  // 확인 자리가 접히고 원래 버튼 줄이 돌아온다. 저장이 안 돌아오면 고치던 것도 못 끝낸다.
  await expect(categories.sheet.confirmArea).toHaveCount(0);
  await expect(categories.sheet.deleteButton).toBeVisible();
  await expect(categories.sheet.saveButton).toBeVisible();

  await categories.sheet.closeButton.click();
  await categories.sheet.waitClosed();
  await expect(categories.mineButton(PET)).toBeVisible();
});
