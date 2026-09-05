import { formatCurrency } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * 카테고리를 험하게 다뤘을 때.
 *
 * 기본 동작은 `specs/categories.spec.ts` 가 지킨다. 여기서 보는 것은 경계다.
 * 이름이 비었을 때·아주 길 때·똑같아 보일 때, 그리고 지운 이름을 다시 쓸 때.
 *
 * 지운 이름 자리는 실제로 사고가 났던 곳이다. 유니크 인덱스에 `deleted_at` 이 없어
 * 지운 행이 그 이름을 계속 붙들고, 화면에 없는 카테고리를 「이미 있어요」라고 했다.
 */

const PET = '반려동물';
const PET_ICON = 'paw';
/** 이름 칸이 받아 주는 만큼 긴 이름. 목록이 이걸 감당하는지 본다. */
const VERY_LONG = '아주아주기다란카테고리이름을적어보면어디까지들어가는지보자꾸나정말길다';

test('공백만 적으면 저장이 잠긴다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();

  await categories.addButton.click();
  await categories.sheet.waitOpen();
  await categories.sheet.nameField.fill('   ');

  // 잠그지 않으면 이름이 빈 카테고리가 목록에 서고, 기록 시트 칩이 이름 없이 그려진다.
  await expect(categories.sheet.saveButton).toBeDisabled();
});

test('이름 앞뒤 공백은 다듬어 저장된다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();

  await categories.addButton.click();
  await categories.sheet.waitOpen();
  await categories.sheet.nameField.fill(`  ${PET}  `);
  await categories.sheet.pickIcon(PET_ICON);
  await categories.sheet.saveButton.click();
  await categories.sheet.waitClosed();

  // 다듬지 않으면 ' 반려동물 ' 과 '반려동물' 이 서로 다른 이름이 되어 둘 다 만들어진다.
  await expect(categories.mineButton(PET)).toBeVisible();
});

test.describe('이미 있는 이름', () => {
  test.use({
    // 서버가 일부러 막은 409 다. 브라우저가 그 응답을 콘솔에 적는 것이고 앱이 낸 오류가 아니다.
    consoleErrorAllowList: [/Failed to load resource[\s\S]*409/],
  });

  test('공백만 다른 같은 이름은 이미 있다고 말한다', async ({ categories }) => {
    await categories.open();
    await categories.waitReady();
    await categories.create(PET, PET_ICON);

    await categories.addButton.click();
    await categories.sheet.waitOpen();
    await categories.sheet.nameField.fill(`  ${PET}  `);
    await categories.sheet.saveButton.click();

    await expect(categories.sheet.errorText).toHaveText('같은 이름의 카테고리가 이미 있어요.');
    await expect(categories.row(PET)).toHaveCount(1);
  });
});

test('아주 긴 이름을 넣어도 목록이 가로로 넘치지 않는다', async ({ categories, page }) => {
  await categories.open();
  await categories.waitReady();
  await categories.create(VERY_LONG, PET_ICON);

  await expect(categories.mineButton(VERY_LONG)).toBeVisible();

  // 넘치면 브라우저가 화면을 축소해 탭바가 밖으로 밀린다. 관리 탭으로 돌아갈 수 없게 된다.
  const box = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    visual: Math.ceil(window.visualViewport?.width ?? window.innerWidth),
  }));
  expect(box.scroll, `${JSON.stringify(box)} 긴 이름이 화면을 가로로 밀었다`).toBeLessThanOrEqual(
    box.visual + 1,
  );
});

test('지운 이름으로 다시 만들 수 있다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();
  await categories.create(PET, PET_ICON);

  await categories.openEdit(PET);
  await categories.sheet.remove();
  await expect(categories.row(PET)).toHaveCount(0);

  // 지운 행이 그 이름을 계속 붙들고 있으면 여기서 409 가 난다.
  // 사용자에게는 화면에 없는 이름이 「이미 있다」고 막히는 것으로 보인다.
  await categories.create(PET, PET_ICON);
  await expect(categories.mineButton(PET)).toBeVisible();
  await expect(categories.row(PET)).toHaveCount(1);
});

test('지운 이름으로 이름을 바꿀 수 있다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();
  await categories.create(PET, PET_ICON);
  await categories.create('데이트', PET_ICON);

  await categories.openEdit(PET);
  await categories.sheet.remove();
  await expect(categories.row(PET)).toHaveCount(0);

  // 만들기는 지운 행을 되살려 비켜 갈 수 있지만 이름 바꾸기는 그럴 수 없다.
  // 바꿀 행이 이미 살아 있어서다. 지운 행의 이름을 비켜 주지 않으면 여기서 영영 막힌다.
  await categories.openEdit('데이트');
  await categories.sheet.nameField.fill(PET);
  await categories.sheet.saveButton.click();
  await categories.sheet.waitClosed();

  await expect(categories.mineButton(PET)).toBeVisible();
  await expect(categories.row('데이트')).toHaveCount(0);
});

test('카테고리를 지우면 그 카테고리 예산도 함께 사라진다', async ({
  appShell,
  categories,
  manage,
  prep,
}) => {
  await prep.setBudget(500_000);
  const petId = await prep.addCategory(PET);
  await prep.setCategoryBudget(petId, 100_000);

  await appShell.open();
  await appShell.goToTab('관리');
  await manage.waitReady();
  await expect(manage.categories.row(PET)).toBeVisible();

  await appShell.followLink('카테고리 관리');
  await categories.waitReady();
  await categories.openEdit(PET);
  await categories.sheet.remove();

  await appShell.pressBack();
  await manage.waitReady();

  // 서버가 한도까지 지운다. 화면이 예산 캐시를 안 비우면 지운 분류의 한도가 남아 보인다.
  await expect(manage.categories.row(PET)).toHaveCount(0);
});

test('스무 개를 만들어도 기록 시트 칩에 다 나오고 순서가 안 뒤집힌다', async ({
  home,
  prep,
  recordSheet,
}) => {
  const names = Array.from({ length: 20 }, (_, i) => `분류${String(i + 1).padStart(2, '0')}`);
  for (const name of names) await prep.addCategory(name);

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(5_000);

  const chips = await recordSheet.input.categoryChipNames();
  // 기본이 앞, 내가 만든 것이 뒤. 서버가 정렬값을 안 넣으면 새 분류가 '식비' 앞으로 온다.
  // '기타' 는 기본이지만 맨 뒤에 둔다. 고를 것이 없을 때 마지막으로 집는 자리라서다.
  expect(chips[0]).toBe('식비');
  expect(chips.slice(-(names.length + 1))).toEqual([...names, '기타']);
});

test('지운 분류로 적어 둔 기록은 금액과 상호가 그대로 남는다', async ({
  categories,
  home,
  prep,
}) => {
  const petId = await prep.addCategory(PET);
  await prep.addTransaction({ amount: 30_000, merchant: '동물병원', categoryId: petId });

  await categories.open();
  await categories.waitReady();
  await categories.openEdit(PET);
  await categories.sheet.remove();

  await home.open();
  await home.waitReady();

  // 행이 통째로 사라지면 지난달 리포트 숫자가 나중에 달라진다.
  await expect(home.today.row('동물병원')).toBeVisible();
  await expect(home.today.amount(formatCurrency(30_000))).toBeVisible();
  await expect(home.today.subtitle(PET)).toHaveCount(0);
});
