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

  // 화면은 먼저 움직인다. 떠나기 전에 서버까지 갔는지 본다.
  await categories.waitOrderSaved();
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

  /*
    맨 위를 맨 아래까지 내리면 열두째 자리라 앞자리를 벗어난다.

    **연달아 눌러 내린다.** 예전에는 한 번 누를 때마다 요청을 보내고 그동안 화살표를
    잠가서, 열한 번을 누르려면 왕복을 열한 번 기다려야 했다. 지금은 화면이 먼저 움직이고
    손이 멈춘 뒤 한 번만 보낸다. 기다림 없이 이어 눌리는지가 여기서 지켜진다.
  */
  for (let step = 1; step <= QUICK_LIMIT; step += 1) {
    await expect(categories.moveDownButton('식비')).toBeEnabled();
    await categories.moveDownButton('식비').click();
  }
  await expect
    .poll(async () => (await categories.sectionNames('지출 카테고리')).indexOf('식비'))
    .toBe(QUICK_LIMIT);
  await expect(categories.moveDownButton('식비')).toBeDisabled();

  // 열한 자리 밖으로 밀려났으니 경계 줄이 어디까지가 앞자리인지 말해 준다.
  await expect(categories.quickEdge('지출 카테고리')).toHaveText('여기까지 기록 화면에 보여요');

  await categories.waitOrderSaved();
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
  await categories.waitOrderSaved();
});

/**
 * 옮기자마자 떠나는 손짓.
 *
 * 화살표를 누르면 화면이 먼저 움직이고 손이 멈춘 뒤에 보낸다. 그 사이에 뒤로 가면
 * 보내기 전에 화면이 사라지는데, **거기서 취소하면 방금 옮긴 것이 조용히 없어진다.**
 * 화살표를 누르자마자 뒤로 가는 것이 오히려 흔한 손짓이라 여기가 제일 위험하다.
 */
test('옮기자마자 화면을 떠나도 그 순서가 남는다', async ({ appShell, categories }) => {
  await categories.open();
  await categories.waitReady();

  await categories.moveUpButton('카페·간식').click();
  await expect
    .poll(async () => (await categories.sectionNames('지출 카테고리'))[0])
    .toBe('카페·간식');

  // 저장을 기다리지 않고 곧바로 나간다. 여기서 요청이 안 나가면 순서를 잃는다.
  await appShell.pressBack();

  // 서버에서 다시 받아 온다. 화면에 남은 값이 아니라 저장된 값을 보는 자리다.
  await categories.open();
  await categories.waitReady();
  await expect
    .poll(async () => (await categories.sectionNames('지출 카테고리'))[0])
    .toBe('카페·간식');
});

/**
 * 규칙을 문단으로 적지 않는다.
 *
 * 예전에는 목록 위에 「기록 화면에는 위에서 11개까지 보여요…」 두 줄이 있었다. 글자색이
 * 흐려(대비 1.6:1) 읽히지 않았고, 넘칠 일이 없는 수입 넷에도 그대로 떴다.
 */
test('넘치지 않는 묶음에는 앞자리 안내가 아예 없다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();

  // 지출은 기본 열한 개라 아직 넘치지 않는다. 수입은 넷이라 넘칠 일이 없다.
  await expect(categories.quickEdge('지출 카테고리')).toHaveCount(0);
  await expect(categories.quickEdge('수입 카테고리')).toHaveCount(0);

  // 지운 문단. 남아 있으면 화면이 다시 규칙 설명으로 시작한다.
  await expect(categories.quickRuleParagraph).toHaveCount(0);
});

test('순서를 정한 뒤에 만든 분류도 앞자리에서 시작한다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();
  await categories.moveUpButton('카페·간식').click();
  await expect
    .poll(async () => (await categories.sectionNames('지출 카테고리'))[0])
    .toBe('카페·간식');
  await categories.waitOrderSaved();

  // 순서 목록에 없는 것은 전부 뒤로 밀린다. 그대로 두면 방금 만든 것을 못 찾는다.
  await categories.create('반려동물', 'paw');
  await expect
    .poll(async () => (await categories.sectionNames('지출 카테고리'))[0])
    .toBe('반려동물');
});
