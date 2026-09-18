import { expect, test } from '../support/fixtures';

/**
 * 메모와 검색.
 *
 * 메모는 상호와 **다른 칸**이다. 상호는 「어디서」 고 메모는 「무엇을·왜」 다.
 * 같은 스타벅스라도 "팀 커피 쐈다" 는 상호에 적을 말이 아니고, 상호에 적으면 다음에
 * 같은 가게에서 쓴 것과 묶이지 않는다.
 *
 * 검색은 그 메모까지 본다. 그리고 숫자만 적으면 **그 금액**을 찾는다.
 */

test('저장한 뒤에 메모를 적고, 목록 줄에서 그 메모를 읽는다', async ({
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(12000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  await recordSheet.feedback.writeMerchant('스타벅스');
  await recordSheet.feedback.writeMemo('팀 커피 쐈다');
  await recordSheet.closeByEsc();

  /*
    목록에서는 분류 이름 대신 메모를 보여 준다. 분류는 왼쪽 그림이 이미 말하고 있어서,
    같은 자리에 분류 이름을 또 적느니 일부러 남긴 한 줄을 보여 주는 쪽이 쓸모가 있다.
  */
  await expect(home.today.row('스타벅스')).toBeVisible();
  await expect(home.today.row('팀 커피 쐈다')).toBeVisible();
});

test('수정 시트에서도 메모를 고친다', async ({ calendar, home, prep }) => {
  await prep.addTransaction({ amount: 12000, merchant: '스타벅스' });

  await home.open();
  await home.waitReady();
  await home.today.row('스타벅스').click();
  await home.edit.waitOpen();

  await home.edit.memo.fill('팀 커피 쐈다');
  await home.edit.doneButton.click();
  await home.edit.waitClosed();

  await expect(home.today.row('팀 커피 쐈다')).toBeVisible();

  // 달력의 그 날 목록에서도 같은 줄이 보인다. 두 화면이 한 규칙으로 그린다.
  await calendar.open();
  await calendar.waitReady();
  await expect(calendar.list.row('팀 커피 쐈다')).toBeVisible();
});

test('금액으로 찾으면 그 금액만 나온다', async ({ calendar, prep }) => {
  await prep.addTransaction({ amount: 12000, merchant: '스타벅스' });
  await prep.addTransaction({ amount: 112000, merchant: '백화점' });

  await calendar.open();
  await calendar.waitReady();

  await calendar.search.find('12000');

  /*
    부분일치가 아니라 딱 그 금액이다. 12,000 을 찾다가 112,000 이 나오면
    검색이 아니라 훼방이다.
  */
  await expect(calendar.list.row('스타벅스')).toBeVisible();
  await expect(calendar.list.row('백화점')).toHaveCount(0);
});

test('쉼표와 원을 붙여 적어도 찾는다', async ({ calendar, prep }) => {
  await prep.addTransaction({ amount: 12000, merchant: '스타벅스' });

  await calendar.open();
  await calendar.waitReady();

  // 사람은 화면에 보이는 대로 적는다. 화면이 「12,000원」 이라고 보여 주기 때문이다.
  await calendar.search.find('12,000원');
  await expect(calendar.list.row('스타벅스')).toBeVisible();
});

test('메모로도 찾는다', async ({ calendar, home, prep }) => {
  await prep.addTransaction({ amount: 12000, merchant: '스타벅스' });
  await prep.addTransaction({ amount: 8000, merchant: '김밥천국' });

  await home.open();
  await home.waitReady();
  await home.today.row('스타벅스').click();
  await home.edit.memo.fill('팀 커피 쐈다');
  await home.edit.doneButton.click();
  await home.edit.waitClosed();

  await calendar.open();
  await calendar.waitReady();
  await calendar.search.find('커피');

  await expect(calendar.list.row('스타벅스')).toBeVisible();
  await expect(calendar.list.row('김밥천국')).toHaveCount(0);
});

test('태그 이름으로도 찾는다', async ({ calendar, home, prep, recordSheet, tags }) => {
  await tags.open();
  await tags.waitReady();
  await tags.create('지출 태그', '출장');

  await prep.addTransaction({ amount: 8000, merchant: '김밥천국' });

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(12000);
  await recordSheet.input.pickCategory('교통');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.writeMerchant('택시');
  await recordSheet.feedback.tagChip('출장').click();
  await expect(recordSheet.feedback.tagChip('출장')).toHaveAttribute('aria-pressed', 'true');
  await recordSheet.closeByEsc();

  await calendar.open();
  await calendar.waitReady();
  await calendar.search.find('출장');

  await expect(calendar.list.row('택시')).toBeVisible();
  await expect(calendar.list.row('김밥천국')).toHaveCount(0);
});

test('검색 안내 문구가 실제로 찾는 것과 같다', async ({ calendar }) => {
  await calendar.open();
  await calendar.waitReady();

  // 문구와 동작이 어긋나면 사용자는 검색이 고장 난 줄로 안다.
  await expect(calendar.search.input).toHaveAttribute('placeholder', '이름·태그·금액으로 검색');
});

/**
 * 검색 칸은 **달력 아래**다.
 *
 * 위에 있으면 이 화면에 들어온 사람이 달력보다 검색을 먼저 본다. 이 화면에 오는 이유는
 * 달력을 보려는 것이고, 검색은 그러다 찾을 것이 생겼을 때 쓴다.
 */
test('검색 칸이 달력 아래에 선다', async ({ calendar }) => {
  await calendar.open();
  await calendar.waitReady();

  const grid = await calendar.grid.box.boundingBox();
  const search = await calendar.search.input.boundingBox();
  expect(grid).not.toBeNull();
  expect(search).not.toBeNull();

  expect(search!.y, '검색 칸이 달력 위에 있다').toBeGreaterThan(grid!.y + grid!.height);
});

/**
 * 찾는 동안에도 달력은 그대로 있다.
 *
 * 감추면 아래 있던 검색 칸이 위로 뛰어올라, 글자를 한 자 칠 때마다 화면이 움직인다.
 * 그리고 달력의 날을 누르면 검색이 끝나고 그 날로 간다. 안 그러면 검색 중 달력이
 * 안 눌리는 죽은 자리가 된다.
 */
test('찾는 동안에도 달력이 그 자리에 있고, 날을 누르면 검색이 끝난다', async ({
  calendar,
  prep,
}) => {
  await prep.addTransaction({ amount: 12000, merchant: '스타벅스' });

  await calendar.open();
  await calendar.waitReady();
  const before = await calendar.search.input.boundingBox();
  expect(before).not.toBeNull();

  await calendar.search.find('스타벅스');
  await expect(calendar.search.resultCount).toBeVisible();

  await expect(calendar.grid.box).toBeVisible();
  const after = await calendar.search.input.boundingBox();
  expect(Math.round(after!.y), '검색을 시작하니 검색 칸이 움직였다').toBe(Math.round(before!.y));

  await test.step('달력의 날을 누르면 그 날 목록으로 돌아온다', async () => {
    // 검색 중에도 달력이 눌려야 한다. 안 그러면 보이기만 하는 죽은 자리가 된다.
    await calendar.grid.select(calendar.grid.cellName('2026-09-02'));
    await expect(calendar.search.input).toHaveValue('');
    await expect(calendar.search.resultCount).toHaveCount(0);
    await expect(calendar.list.dayTotal).toBeVisible();
  });
});
