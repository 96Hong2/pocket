import { formatNumber } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';
import { shotBothWidths as shot } from '../support/shots';

/**
 * 기록 고치기 맨 위 큰 그림을 누르면 분류를 고친다. **어디서 열든 같다.**
 *
 * 분류 칸은 칸이 많은 시트 맨 아래라 작은 화면에서는 굴려야 나온다. 사람은 그림을 먼저
 * 누르는데 예전에는 아무 일도 없었다. 그림을 누르면 분류를 전부 펼친 한 장이 서고,
 * 고르면 시트로 돌아와 그 분류로 저장된다. 저축·투자는 「어디에」, 이체는 고를 것이 없다.
 */

test('홈과 리포트 분류 화면에서 연 고치기 모두 그림을 눌러 분류를 바꾸고 저장한다', async ({
  appShell,
  home,
  page,
  prep,
  report,
  reportCategory,
}) => {
  const food = await prep.categoryIdByName('식비');
  await prep.addTransaction({ amount: 12_000, merchant: '스타벅스', categoryId: food });
  await prep.addTransaction({ amount: 8_000, merchant: '김밥천국', categoryId: food });

  await test.step('홈 오늘 목록에서 연 고치기', async () => {
    await home.open();
    await home.waitReady();
    await home.today.row('스타벅스').click();
    await home.edit.waitOpen();
    await expect(home.edit.headCategoryButton).toHaveAccessibleName('카테고리 식비, 바꾸기');
    await shot(page, 'A_고치기_그림버튼', home.edit.headCategoryButton, 'start');

    await home.edit.headCategoryButton.click();
    const pick = home.edit.categoryPick;
    await expect(pick.dialog).toBeVisible();
    // 처음부터 다 펼친다. 고르기만 하는 한 장이라 「더 보기」 를 한 번 더 누르게 하지 않는다.
    await expect(pick.picked).toHaveText('식비');
    await expect(pick.moreButton).toHaveCount(0);
    await expect(pick.newCategoryButton).toBeVisible();
    await shot(page, 'A_카테고리바꾸기', pick.dialog, 'start');

    await pick.chip('카페·간식').click();
    await expect(pick.dialog).toHaveCount(0);
    // 시트는 그대로이고 그림과 아래 분류 칸이 함께 바뀐다.
    await home.edit.waitOpen();
    await expect(home.edit.headCategoryButton).toHaveAccessibleName('카테고리 카페·간식, 바꾸기');
    await expect(home.edit.pickedCategory).toHaveText('카페·간식');
    await home.edit.done();
    await expect(home.today.rowSubtitle('스타벅스')).toContainText('카페·간식');

    await home.today.row('스타벅스').click();
    await home.edit.waitOpen();
    await expect(home.edit.headCategoryButton).toHaveAccessibleName('카테고리 카페·간식, 바꾸기');
    await appShell.pressBack();
    await home.edit.waitClosed();
  });

  await test.step('리포트 분류 화면에서 연 고치기', async () => {
    await report.open();
    await report.waitReady();
    await report.row('식비').click();
    await reportCategory.waitReady();
    await reportCategory.row('김밥천국').click();
    await reportCategory.edit.waitOpen();

    await reportCategory.edit.headCategoryButton.click();
    await reportCategory.edit.categoryPick.chip('편의점').click();
    await expect(reportCategory.edit.categoryPick.dialog).toHaveCount(0);
    await expect(reportCategory.edit.headCategoryButton).toHaveAccessibleName(
      '카테고리 편의점, 바꾸기',
    );
    await reportCategory.edit.done();

    // 식비에 남은 기록이 없다. 저장이 서버까지 갔다.
    await expect(reportCategory.empty).toBeVisible();
  });
});

test('고르기만 접고 고치던 값은 남는다. 거기서 새 분류를 만들면 그 분류가 골라진다', async ({
  appShell,
  calendar,
  page,
  prep,
}) => {
  const food = await prep.categoryIdByName('식비');
  await prep.addTransaction({ amount: 12_000, merchant: '스타벅스', categoryId: food });

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('스타벅스');
  await calendar.edit.waitOpen();
  await calendar.edit.amount.fill('15000');

  const pick = calendar.edit.categoryPick;

  // 토스 ‹ 와 폰 뒤로가기는 고르기 한 겹만 접는다.
  await calendar.edit.headCategoryButton.click();
  await expect(pick.dialog).toBeVisible();
  await appShell.pressBack();
  await expect(pick.dialog).toHaveCount(0);
  await calendar.edit.waitOpen();

  // Esc 와 화면 안 ‹ 도 같다.
  await calendar.edit.headCategoryButton.click();
  await expect(pick.dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pick.dialog).toHaveCount(0);
  await calendar.edit.headCategoryButton.click();
  await pick.backButton.click();
  await expect(pick.dialog).toHaveCount(0);
  await calendar.edit.waitOpen();
  await expect(calendar.edit.amount).toHaveValue(formatNumber(15_000));

  await calendar.edit.headCategoryButton.click();
  await pick.newCategoryButton.click();
  await expect(pick.dialog).toHaveCount(0);
  await calendar.edit.createCategory('선물', 'gift');
  await expect(calendar.edit.newCategoryTitle).toHaveCount(0);
  await expect(calendar.edit.headCategoryButton).toHaveAccessibleName('카테고리 선물, 바꾸기');
  await expect(calendar.edit.amount).toHaveValue(formatNumber(15_000));
  await calendar.edit.done();
  await expect(calendar.list.rowSubtitle('스타벅스')).toContainText('선물');

  await calendar.list.pick('스타벅스');
  await calendar.edit.waitOpen();
  await expect(calendar.edit.headCategoryButton).toHaveAccessibleName('카테고리 선물, 바꾸기');
  await expect(calendar.edit.amount).toHaveValue(formatNumber(15_000));
});

test('저축·투자 기록은 그림이 「어디에」 목록을 열고, 그냥 이체는 그림을 누를 수 없다', async ({
  appShell,
  calendar,
  page,
  prep,
}) => {
  const assets = await prep.putAssets([
    { group: 'cash', amount: 1_000_000, label: '청년도약계좌' },
    { group: 'cash', amount: 500_000, label: '비상금통장' },
  ]);
  const saving = assets.items.find((row) => row.label === '청년도약계좌');
  if (saving?.item_key == null) throw new Error('항목 키가 없다');
  await prep.addAssetTransfer({ amount: 300_000, itemKey: saving.item_key, memo: '도약 납입' });
  await prep.addTransaction({ amount: 50_000, type: 'transfer', merchant: '내 계좌로 옮김' });

  await calendar.open();
  await calendar.waitReady();

  await calendar.list.pick('도약 납입');
  await calendar.edit.waitOpen();
  await expect(calendar.edit.headDestButton).toHaveAccessibleName('어디에 청년도약계좌, 바꾸기');
  await expect(calendar.edit.headCategoryButton).toHaveCount(0);
  await calendar.edit.headDestButton.click();
  await expect(calendar.edit.destPage).toBeVisible();
  await shot(page, 'A_저축투자_어디에', calendar.edit.destPage, 'start');
  await calendar.edit.destPageRow('비상금통장').click();
  await expect(calendar.edit.destPage).toHaveCount(0);
  await expect(calendar.edit.headDestButton).toHaveAccessibleName('어디에 비상금통장, 바꾸기');
  await calendar.edit.done();

  // 저축·투자 줄 제목은 어디에 넣었는지다. 바꾼 곳으로 저장됐다.
  await expect(calendar.list.rowSubtitle('비상금통장')).toHaveText('도약 납입');

  await calendar.list.pick('내 계좌로 옮김');
  await calendar.edit.waitOpen();
  await expect(calendar.edit.headIcon).toBeVisible();
  await expect(calendar.edit.headCategoryButton).toHaveCount(0);
  await expect(calendar.edit.headDestButton).toHaveCount(0);
  await appShell.pressBack();
  await calendar.edit.waitClosed();
});

test('공유 가계부 기록을 고칠 때도 그림을 눌러 분류를 바꾼다', async ({ home, page, prep }) => {
  const bookId = await prep.createBook({ name: '우리 집', myName: '은홍' });
  await prep.addBookEntry(bookId, { amount: 32_000, category: '장보기', title: '이마트' });

  await home.open();
  await home.waitReady();
  await home.book.switchTo('우리 집');
  await home.book.recent.row('이마트').click();
  await home.bookEdit.waitOpen();

  await expect(home.bookEdit.headCategoryButton).toHaveAccessibleName('카테고리 장보기, 바꾸기');
  await home.bookEdit.headCategoryButton.click();
  await expect(home.bookEdit.categoryPick.picked).toHaveText('장보기');
  await home.bookEdit.categoryPick.chip('외식·배달').click();
  await expect(home.bookEdit.categoryPick.dialog).toHaveCount(0);
  await expect(home.bookEdit.headCategoryButton).toHaveAccessibleName('카테고리 외식·배달, 바꾸기');
  await expect(home.bookEdit.categoryChip('외식·배달')).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'A_공유기록_그림버튼', home.bookEdit.headCategoryButton, 'start');
  await home.bookEdit.saveButton.click();
  await home.bookEdit.waitClosed();
  // 줄의 그림이 바뀐 것을 본 뒤에 다시 연다. 목록을 다시 받기 전에 누르면 옛 기록으로 열린다.
  await expect(home.book.recent.rowIcon('이마트')).toHaveAttribute('src', /\/76_burger\.png$/);

  await home.book.recent.row('이마트').click();
  await home.bookEdit.waitOpen();
  await expect(home.bookEdit.headCategoryButton).toHaveAccessibleName('카테고리 외식·배달, 바꾸기');
});
