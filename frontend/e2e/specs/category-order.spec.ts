import { QUICK_LIMIT } from '../../src/shared/ledger/quickPick';
import { expect, test } from '../support/fixtures';

/**
 * 기록 화면에 먼저 보일 분류를 내가 정한다.
 *
 * 칩이 앞자리 열한 개까지라, **무엇이 앞에 서는지**가 값이 됐다. 관리 화면에서 화살표로
 * 한 칸씩 옮기고, 「자주 쓴 순서로」 한 번으로 다시 세운다.
 *
 * 서버가 스스로 자주 쓴 순서로 세우지는 않는다. 쓸 때마다 칩이 자리를 옮기면
 * 손이 기억한 자리가 무너져, 빨리 적는다는 이 앱의 유일한 값이 사라진다.
 */

test('화살표로 올린 분류가 기록 화면에서도 앞에 선다', async ({
  appShell,
  categories,
  home,
  recordSheet,
}) => {
  await categories.open();
  await categories.waitReady();

  // 맨 위는 더 올릴 곳이 없다.
  await expect(categories.moveUpButton('식비')).toBeDisabled();

  await categories.moveUpButton('카페·간식').click();
  await expect
    .poll(async () => (await categories.sectionNames('지출 카테고리')).slice(0, 2))
    .toEqual(['카페·간식', '식비']);

  await appShell.pressBack();
  await appShell.goToTab('홈');
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  const chips = await recordSheet.input.categoryChipNames();
  expect(chips.slice(0, 2)).toEqual(['카페·간식', '식비']);
});

test('아래로 밀어 열한 자리 밖으로 보내면 「더 보기」 뒤로 간다', async ({
  appShell,
  categories,
  home,
  recordSheet,
  prep,
}) => {
  // 기본 지출이 딱 열한 개라, 하나를 더 만들어야 앞자리 밖으로 밀려나는 자리가 생긴다.
  await prep.addCategory('반려동물');

  await categories.open();
  await categories.waitReady();

  // 맨 위를 맨 아래까지 내리면 열두째 자리라 앞자리를 벗어난다.
  for (let step = 1; step <= QUICK_LIMIT; step += 1) {
    await categories.moveDownButton('식비').click();
    // 한 칸 내려간 것을 보고 다음을 누른다. 저장이 도는 동안에는 화살표가 잠긴다.
    await expect
      .poll(async () => (await categories.sectionNames('지출 카테고리')).indexOf('식비'))
      .toBe(step);
  }
  await expect(categories.moveDownButton('식비')).toBeDisabled();

  await appShell.pressBack();
  await appShell.goToTab('홈');
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  // 열한 개는 그대로 서고, 밀려난 하나만 뒤로 간다. 없어지는 것이 아니다.
  const chips = await recordSheet.input.categoryChipNames();
  expect(chips).toHaveLength(QUICK_LIMIT);
  expect(chips).not.toContain('식비');

  await recordSheet.input.moreCategoriesButton.click();
  await expect(recordSheet.input.categoryChip('식비')).toBeVisible();
});

test('「자주 쓴 순서로」를 누르면 많이 쓴 것이 앞에 선다', async ({ categories, prep }) => {
  // 세 번 쓴 것이 한 번 쓴 것보다 앞이어야 한다.
  const gift = await prep.categoryIdByName('여가·취미');
  const fixed = await prep.categoryIdByName('주거·고정비');
  await prep.addExpense({ amount: 1000, daysAgo: 0, categoryId: fixed });
  for (let step = 0; step < 3; step += 1) {
    await prep.addExpense({ amount: 1000, daysAgo: 0, categoryId: gift });
  }

  await categories.open();
  await categories.waitReady();
  await categories.sortByUsageButton('지출 카테고리').click();

  await expect
    .poll(async () => (await categories.sectionNames('지출 카테고리')).slice(0, 2))
    .toEqual(['여가·취미', '주거·고정비']);
});

test('순서를 정한 뒤에 만든 분류도 앞자리에서 시작한다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();
  await categories.moveUpButton('카페·간식').click();
  await expect
    .poll(async () => (await categories.sectionNames('지출 카테고리'))[0])
    .toBe('카페·간식');

  // 순서 목록에 없는 것은 전부 뒤로 밀린다. 그대로 두면 방금 만든 것을 못 찾는다.
  await categories.create('반려동물', 'paw');
  await expect
    .poll(async () => (await categories.sectionNames('지출 카테고리'))[0])
    .toBe('반려동물');
});
