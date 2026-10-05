import { logsNamed } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 공유 가계부에 적고, 같이 보고, 고치고, 옮기고, 지운다.
 *
 * 지키는 것:
 * - 공유 가계부가 없는 사람의 홈과 기록 시트는 지금과 똑같다(칩도 「적을 곳」 줄도 없다).
 * - 공유 가계부에 적는 데 누르는 횟수는 내 가계부와 같다. 우리 집 홈에서 열면 이미 골라져 있다.
 * - 같이 쓰는 사람이 적거나 고친 것이 새로 고침 없이 들어온다.
 * - 공유 기록은 내 가계부 합계를 바꾸지 않고, 내 가계부로 옮긴 것만 바꾼다.
 *
 * 만들기와 합류 화면은 따로 본다. 여기서는 배경으로 API 로 만든다.
 */

/** 다시 읽는 주기가 30초다. 한 번 놓쳐도 다음 번에 들어와야 한다. */
const POLL_MS = 40_000;

test('은홍이 우리 집에 적은 것을 준호가 보고, 준호가 고친 것을 은홍이 본다', async ({
  home,
  page,
  partner,
  prep,
  recordSheet,
}) => {
  test.setTimeout(180_000);

  const bookId = await prep.createBook({ name: '우리 집', myName: '은홍' });
  await partner.prep.joinBook(await prep.bookInviteCode(bookId), '준호');
  await prep.addTransaction({ amount: 5_000, merchant: '편의점' });

  await test.step('준호가 먼저 우리 집 홈을 보고 있다. 빈 달에는 정산 카드도 예산 권유도 없다', async () => {
    await partner.home.open();
    const settled = partner.page.waitForResponse(
      (response) => /\/settlement(\?|$)/.test(response.url()) && response.ok(),
    );
    await partner.home.book.switchTo('우리 집');
    await expect(partner.home.book.recent.emptyLine).toBeVisible();
    // 정산을 받아 본 뒤에 없다고 말한다. 받기 전에는 무엇이든 없어 보인다.
    await settled;
    await expect(partner.home.book.heroAmount).toHaveText('0원');
    await expect(partner.home.book.settleCard).toHaveCount(0);
    await expect(partner.home.book.setBudgetButton).toHaveCount(0);
  });

  await test.step('은홍이 우리 집 홈에서 적는다. 누르는 횟수는 내 가계부와 같다', async () => {
    await home.open();
    await home.waitReady();
    await expect(home.hero.monthSpent).toHaveText('5,000원');
    await home.book.switchTo('우리 집');

    await home.recordButton.click();
    await recordSheet.waitOpen();
    await expect(recordSheet.destination.pill('우리 집')).toHaveAttribute('aria-pressed', 'true');
    // 공유 가계부는 지출만 받는다. 적는 방법은 내 가계부와 같이 넷이다(줄글·사진은 shared-books-inputs).
    await expect(recordSheet.methodTabs).toHaveCount(4);
    await expect(recordSheet.kindChip('지출')).toHaveAttribute('aria-checked', 'true');
    await expect(recordSheet.kindChip('수입')).toBeDisabled();
    await expect(recordSheet.kindChip('이체')).toBeDisabled();
    await expect(recordSheet.dayButton).toBeVisible();
    await recordSheet.openKeypad();
    await expect(recordSheet.input.categoryChip('편의점')).toHaveCount(0);

    await recordSheet.input.enterAmount(32_000);
    await recordSheet.input.pickCategory('장보기');

    await expect(recordSheet.bookFeedback.savedLabel('우리 집')).toBeVisible();
    await expect(recordSheet.bookFeedback.card).toContainText('이번 달 같이 쓴 돈 32,000원');
    await expect(recordSheet.bookFeedback.card).toContainText('준호도 바로 볼 수 있어요');
    await expect(recordSheet.bookFeedback.payer('은홍')).toHaveAttribute('aria-pressed', 'true');
    await recordSheet.bookFeedback.confirmButton.click();
    await recordSheet.waitClosed();

    await expect(home.book.recent.row('장보기')).toContainText('은홍');
    await expect(home.book.recent.row('장보기')).toContainText('32,000원');
    // 예산이 없으니 큰 숫자는 이번 달 같이 쓴 돈이다. 내 가계부의 5,000원은 섞이지 않는다.
    await expect(home.book.heroAmount).toHaveText('32,000원');
    await expect(home.book.setBudgetButton).toBeVisible();
    // 32,000 을 둘이 나누면 16,000 씩이고 은홍이 다 냈다.
    await expect(home.book.settleCard).toContainText('준호가 은홍에게 16,000원 보내면 반반이에요');

    const saved = (await logsNamed(page, 'save_result')).at(-1);
    expect(saved?.params.book).toBe('shared');
    expect(JSON.stringify(saved?.params)).not.toContain('우리 집');
  });

  await test.step('준호 화면에 새로 고침 없이 들어온다', async () => {
    await expect
      .poll(() => partner.home.book.recent.row('장보기').count(), { timeout: POLL_MS })
      .toBe(1);
    await expect(partner.home.book.recent.row('장보기')).toContainText('32,000원');
  });

  await test.step('앱을 다시 열면 내 기록이 있는 은홍은 내 가계부, 없는 준호는 우리 집이다', async () => {
    await page.reload();
    await home.waitReady();
    // 은홍은 내 가계부에 5,000원이 있다. 공유 가계부를 보던 채로 열려 내 지출이 섞이면 안 된다.
    await expect(home.book.chip).toHaveAccessibleName('보는 가계부 내 가계부');
    await expect(home.hero.monthSpent).toHaveText('5,000원');

    await partner.page.reload();
    await partner.home.waitReady();
    await expect(partner.home.book.chip).toHaveAccessibleName('보는 가계부 우리 집');
    await expect(partner.home.book.recent.row('장보기')).toBeVisible();

    await home.book.switchTo('우리 집');
  });

  await test.step('준호가 금액을 고친다', async () => {
    await partner.home.book.recent.row('장보기').click();
    await partner.home.bookEdit.waitOpen();
    await expect(partner.home.bookEdit.wroteLine).toHaveText(/^은홍이 .+에 적었어요$/);
    // 남이 적은 것이고 관리자도 아니라 지울 수도, 옮길 수도 없다.
    await expect(partner.home.bookEdit.deleteButton).toHaveCount(0);
    await expect(partner.home.bookEdit.destination).toHaveCount(0);
    await partner.home.bookEdit.amount.fill('35000');
    await partner.home.bookEdit.saveButton.click();
    await partner.home.bookEdit.waitClosed();
    await expect(partner.home.toast.withText('고쳤어요. 은홍 화면에도 반영돼요')).toBeVisible();
  });

  await test.step('은홍 화면에 「고침」 이 붙고 누가 고쳤는지 보인다', async () => {
    await expect
      .poll(async () => (await home.book.recent.row('장보기').textContent()) ?? '', {
        timeout: POLL_MS,
      })
      .toContain('고침');
    await expect(home.book.recent.row('장보기')).toContainText('35,000원');
    await home.book.recent.row('장보기').click();
    await home.bookEdit.waitOpen();
    await expect(home.bookEdit.editedLine).toHaveText(/^준호가 .+에 고쳤어요$/);
    await page.keyboard.press('Escape');
    await home.bookEdit.waitClosed();
  });

  await test.step('공유 기록은 내 가계부 합계를 바꾸지 않는다', async () => {
    await home.book.switchTo('내 가계부');
    await expect(home.hero.monthSpent).toHaveText('5,000원');
  });

  await test.step('저장 뒤 화면에서 내 가계부로 옮기면 내 합계에 들어간다', async () => {
    await home.book.switchTo('우리 집');
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.input.enterAmount(12_000);
    await recordSheet.input.pickCategory('외식·배달');
    await expect(recordSheet.bookFeedback.savedLabel('우리 집')).toBeVisible();

    await recordSheet.bookFeedback.moveOutButton.click();
    await expect(recordSheet.bookFeedback.movedLabel).toBeVisible();
    await expect(recordSheet.bookFeedback.payerGroup).toHaveCount(0);
    await recordSheet.bookFeedback.confirmButton.click();
    await recordSheet.waitClosed();
    await expect(home.book.recent.row('외식·배달')).toHaveCount(0);

    await home.book.switchTo('내 가계부');
    await expect(home.hero.monthSpent).toHaveText('17,000원');
  });

  await test.step('내가 적은 것은 묻지 않고 지우고, 알림에서 되돌린다', async () => {
    await home.book.switchTo('우리 집');
    await home.book.recent.row('장보기').click();
    await home.bookEdit.waitOpen();
    await home.bookEdit.deleteButton.click();
    await home.bookEdit.waitClosed();
    await expect(home.toast.withText('지웠어요')).toBeVisible();
    await expect(home.book.recent.row('장보기')).toHaveCount(0);

    await home.toast.undoButton.click();
    await expect(home.book.recent.row('장보기')).toBeVisible();
    await expect(home.book.recent.row('장보기')).toContainText('35,000원');
  });
});

test('관리자가 남이 적은 기록을 지우면 한 번 묻고, 확인한 뒤에만 지운다', async ({
  home,
  partner,
  prep,
}) => {
  const bookId = await prep.createBook({ name: '우리 집', myName: '은홍' });
  await partner.prep.joinBook(await prep.bookInviteCode(bookId), '준호');
  await partner.prep.addBookEntry(bookId, { amount: 21_000, category: '장보기' });

  await home.open();
  await home.waitReady();
  await home.book.switchTo('우리 집');
  await home.book.recent.row('장보기').click();
  await home.bookEdit.waitOpen();
  await home.bookEdit.deleteButton.click();

  await expect(home.bookEdit.deleteConfirm).toContainText(
    '준호가 적은 기록이에요. 지우면 준호 화면에서도 사라져요',
  );
  // 묻는 동안에는 아직 지우지 않았다.
  expect(await prep.bookEntries(bookId)).toHaveLength(1);

  await home.bookEdit.confirmDeleteButton.click();
  await home.bookEdit.waitClosed();
  await expect(home.toast.withText('지웠어요')).toBeVisible();
  await expect(home.book.recent.row('장보기')).toHaveCount(0);
  expect(await prep.bookEntries(bookId)).toEqual([]);
});

test('공유 가계부가 셋이면 셋째 칩이 「다른 가계부」 이고 거기서 고른 곳에 적힌다', async ({
  home,
  page,
  prep,
  recordSheet,
}) => {
  await prep.createBook({ name: '우리 집' });
  await prep.createBook({ kind: 'trip', name: '제주 여행' });
  await prep.createBook({ kind: 'room', name: '우리 방' });

  await home.open();
  await home.waitReady();
  await expect(home.book.chip).toHaveAccessibleName('보는 가계부 내 가계부');

  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.destination.pills).toHaveCount(3);
  await expect(recordSheet.destination.pill('내 가계부')).toHaveAttribute('aria-pressed', 'true');
  // 적은 적이 없으면 둘째 칩은 가장 최근에 만든 가계부다.
  await expect(recordSheet.destination.pill('우리 방')).toBeVisible();
  await expect(recordSheet.destination.otherButton).toBeVisible();
  await expect(recordSheet.methodTabs).toHaveCount(4);
  // 보통 폰(Pixel 8)에서는 줄이 하나 늘어도 첫 화면이 한 화면이다.
  expect(await recordSheet.overflowY()).toBe(0);

  // 금액을 눌러 둔 뒤 ‹ 로 첫 화면에 돌아와 적을 곳을 바꾼다.
  await recordSheet.input.enterAmount(8_000);
  await recordSheet.back();
  await recordSheet.destination.otherButton.click();
  await expect(recordSheet.destination.picker).toBeVisible();
  await recordSheet.destination.pickerRow('제주 여행').click();
  await expect(recordSheet.destination.picker).toHaveCount(0);

  // 고른 가계부가 둘째 칩 자리로 오고, 누른 금액은 그대로다. 분류만 그 가계부 것으로 바뀐다.
  await expect(recordSheet.destination.pill('제주 여행')).toHaveAttribute('aria-pressed', 'true');
  await expect(recordSheet.destination.pills).toHaveCount(3);
  await recordSheet.next();
  await expect(recordSheet.input.amountText).toHaveText('8,000원');
  await expect(recordSheet.input.categoryChip('편의점')).toHaveCount(0);
  await recordSheet.input.pickCategory('숙소');

  await expect(recordSheet.bookFeedback.savedLabel('제주 여행')).toBeVisible();
  // 혼자 쓰는 가계부라 누가 볼 수 있는지도, 낸 사람도 묻지 않는다.
  await expect(recordSheet.bookFeedback.card).not.toContainText('볼 수 있어요');
  await expect(recordSheet.bookFeedback.payerGroup).toHaveCount(0);
  await recordSheet.bookFeedback.confirmButton.click();
  await recordSheet.waitClosed();

  await test.step('다음에 열면 마지막에 적은 곳이 둘째 칩이다. 기본은 여전히 내 가계부다', async () => {
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await expect(recordSheet.destination.pill('제주 여행')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(recordSheet.destination.pill('내 가계부')).toHaveAttribute('aria-pressed', 'true');

    await recordSheet.input.enterAmount(3_000);
    await recordSheet.input.pickCategory('편의점');
    // 공유 가계부가 있는 사람에게도 어디에 적혔는지가 맨 위 큰 제목이다.
    await expect(recordSheet.feedback.savedToMineLabel).toBeVisible();
    await expect(recordSheet.feedback.headline).toHaveText('내 가계부에 적었어요');
  });

  const books = (await logsNamed(page, 'save_result')).map((log) => log.params.book);
  expect(books).toEqual(['shared', 'mine']);
  expect(JSON.stringify(await logsNamed(page, 'save_result'))).not.toContain('제주');
});

test('분류를 더 보기로 펼친 뒤 첫 화면에서 적을 곳을 바꾸면 목록이 접히고 키패드가 다시 선다', async ({
  home,
  prep,
  recordSheet,
}) => {
  await prep.createBook({ name: '우리 집' });
  // 앞자리는 열한 개다. 하나를 더해야 「더 보기」 가 선다.
  await prep.addCategory('반려동물');

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.openKeypad();
  await recordSheet.input.moreCategoriesButton.click();
  await expect(recordSheet.input.keypad).toHaveCount(0);

  // 적을 곳은 첫 화면에 있다. ‹ 로 돌아가 바꾸고 「다음」 으로 온다.
  await recordSheet.back();
  await recordSheet.destination.pill('우리 집').click();
  await expect(recordSheet.destination.pill('우리 집')).toHaveAttribute('aria-pressed', 'true');
  await recordSheet.next();
  // 펼쳐 둔 목록이 다른 가계부로 따라오지 않는다. 내 가계부에만 있는 관리 칩도 따라오지 않는다.
  await expect(recordSheet.input.keypad).toBeVisible();
  await expect(recordSheet.input.foldCategoriesButton).toHaveCount(0);
  await expect(recordSheet.input.categoryManageLink).toHaveCount(0);
});

test('내 지출을 수정 시트에서 우리 집으로 옮기고, 알림에서 되돌린다', async ({
  home,
  partner,
  prep,
}) => {
  const bookId = await prep.createBook({ name: '우리 집', myName: '은홍' });
  await partner.prep.joinBook(await prep.bookInviteCode(bookId), '준호');
  await prep.addTransaction({
    amount: 9_000,
    merchant: '다이소',
    categoryId: await prep.categoryIdByName('생활'),
  });
  await prep.addTransaction({ amount: 4_000, merchant: '편의점' });

  await home.open();
  await home.waitReady();
  await expect(home.hero.monthSpent).toHaveText('13,000원');

  await home.today.row('다이소').click();
  await home.bookEdit.waitOpen();
  await expect(home.bookEdit.destinationPill('내 가계부')).toHaveAttribute('aria-pressed', 'true');
  await expect(home.bookEdit.categoryChip('편의점')).toBeVisible();
  await home.bookEdit.destinationPill('우리 집').click();

  // 옮기면 안 쓰이는 내 가계부 칸은 걷히고, 분류 칸은 우리 집 분류로 바뀐다.
  await expect(home.bookEdit.kindToggle).toHaveCount(0);
  await expect(home.bookEdit.paymentGroup).toHaveCount(0);
  await expect(home.bookEdit.excludeToggle).toHaveCount(0);
  await expect(home.bookEdit.categoryChip('편의점')).toHaveCount(0);
  // 같은 이름(「생활」)이 먼저 골라져 있다. 다른 것을 고르면 그 분류로 들어간다.
  await expect(home.bookEdit.categoryChip('생활')).toHaveAttribute('aria-pressed', 'true');
  await home.bookEdit.categoryChip('데이트').click();
  await expect(home.bookEdit.categoryChip('데이트')).toHaveAttribute('aria-pressed', 'true');

  await home.bookEdit.doneButton.click();
  await home.bookEdit.waitClosed();
  // 내 지출이 이제 준호에게도 보인다는 것까지 알림이 말한다.
  await expect(home.toast.withText('우리 집으로 옮겼어요. 준호도 볼 수 있어요')).toBeVisible();
  await expect(home.hero.monthSpent).toHaveText('4,000원');

  const date = (await prep.book(bookId)).categories.find((category) => category.name === '데이트');
  const [moved] = await prep.bookEntries(bookId);
  expect(moved?.category_id).toBe(date?.id);

  await test.step('알림의 되돌리기로 내 가계부에 돌아온다', async () => {
    await home.toast.undoButton.click();
    await expect(home.hero.monthSpent).toHaveText('13,000원');
    await expect(home.today.row('다이소')).toBeVisible();
    expect(await prep.bookEntries(bookId)).toEqual([]);
  });
});

test('옮긴 것은 우리 집 목록에 들어간다', async ({ home, prep }) => {
  await prep.createBook({ name: '우리 집' });
  await prep.addTransaction({ amount: 9_000, merchant: '다이소' });

  await home.open();
  await home.waitReady();
  await home.today.row('다이소').click();
  await home.bookEdit.waitOpen();
  await home.bookEdit.destinationPill('우리 집').click();
  await home.bookEdit.doneButton.click();
  await home.bookEdit.waitClosed();
  // 혼자 쓰는 가계부라 누가 보게 되는지는 말하지 않는다.
  await expect(home.toast.withText('우리 집으로 옮겼어요')).toBeVisible();
  await expect(home.toast.withText('볼 수 있어요')).toHaveCount(0);

  await home.book.switchTo('우리 집');
  await expect(home.book.recent.row('다이소')).toContainText('9,000원');
});

test('최근 같이 쓴 돈은 세 줄만 먼저 보이고, 모두 보기로 그 자리에서 펼친다', async ({
  home,
  partner,
  prep,
}) => {
  const bookId = await prep.createBook({ name: '우리 집', myName: '은홍' });
  await partner.prep.joinBook(await prep.bookInviteCode(bookId), '준호');
  for (const amount of [1_000, 2_000, 3_000, 4_000, 5_000, 6_000]) {
    await prep.addBookEntry(bookId, { amount, category: '장보기' });
  }

  await home.open();
  await home.waitReady();
  await home.book.switchTo('우리 집');
  // 세 줄이어야 토스 웹뷰 한 화면에서 아래 정산 카드까지 보인다. 좌표 판정은 shared-books-layout 에 있다.
  await expect(home.book.recent.rows).toHaveCount(3);
  await expect(home.book.moreButton).toHaveText('이번 달 6건 모두 보기');
  // 쓴 돈이 있는 달이라 정산 카드가 선다.
  await expect(home.book.settleCard).toBeVisible();

  await home.book.moreButton.click();
  await expect(home.book.recent.rows).toHaveCount(6);
  await expect(home.book.moreButton).toHaveCount(0);
  // 새 화면으로 가지 않았다. 여전히 공유 홈이다.
  await expect(home.book.chip).toHaveAccessibleName('보는 가계부 우리 집');
});

test('공유 가계부가 없는 사람의 홈과 기록 시트는 지금과 똑같다', async ({
  home,
  page,
  recordSheet,
}) => {
  // 목록을 받아 본 뒤에 없다고 말한다. 받기 전에는 무엇이든 없어 보인다.
  const listed = page.waitForResponse(
    (response) => response.url().endsWith('/api/v1/books') && response.request().method() === 'GET',
  );
  await home.open();
  await home.waitReady();
  await listed;

  await expect(home.book.chip).toHaveCount(0);
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.destination.group).toHaveCount(0);
  await expect(recordSheet.methodTabs).toHaveCount(4);
  await expect(recordSheet.kindChip('이체')).toBeEnabled();

  await recordSheet.input.enterAmount(4_000);
  await recordSheet.input.pickCategory('식비');
  await expect(recordSheet.feedback.savedLabel).toBeVisible();
  const saved = (await logsNamed(page, 'save_result')).at(-1);
  expect(saved?.params.book).toBe('mine');
});

test.describe('아이폰 세로 한 화면(390x664)', () => {
  test.use({ viewport: { width: 390, height: 664 } });

  test('「적을 곳」 은 첫 화면에만 서고, 어느 가계부에 적든 둘째 화면 키패드 맨 아래 줄까지 한 화면에 든다', async ({
    home,
    page,
    prep,
    recordSheet,
  }) => {
    // 공유 가계부가 없을 때의 둘째 화면.
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.openKeypad();
    await expect(recordSheet.input.numberKey('00')).toBeInViewport({ ratio: 1 });
    await expect(recordSheet.input.backspaceKey).toBeInViewport({ ratio: 1 });
    const before = await recordSheet.overflowY();
    await recordSheet.back();
    await page.keyboard.press('Escape');
    await recordSheet.waitClosed();

    await prep.createBook({ name: '우리 집' });
    await prep.createBook({ kind: 'family', name: '우리 가족' });
    await prep.createBook({ kind: 'room', name: '우리 방' });
    await page.reload();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await expect(recordSheet.destination.group).toBeVisible();
    // 첫 화면은 줄이 하나 늘어도 한 화면이다.
    expect(await recordSheet.overflowY()).toBe(0);

    // 내 가계부: 적을 곳 줄은 첫 화면에만 있어 둘째 화면은 공유 가계부가 없던 때보다 길어지지 않는다.
    await recordSheet.next();
    await expect(recordSheet.input.numberKey('00')).toBeInViewport({ ratio: 1 });
    const mine = await recordSheet.overflowY();
    expect(mine).toBeLessThanOrEqual(before);

    // 공유 가계부: 키패드 아래 줄 키까지 한 화면에 다 들고, 시트는 내 가계부에 적을 때보다 길지 않다.
    await recordSheet.back();
    await recordSheet.destination.pill('우리 방').click();
    await expect(recordSheet.methodTabs).toHaveCount(4);
    await recordSheet.next();
    await expect(recordSheet.input.numberKey('00')).toBeInViewport({ ratio: 1 });
    await expect(recordSheet.input.backspaceKey).toBeInViewport({ ratio: 1 });
    expect(await recordSheet.overflowY()).toBeLessThanOrEqual(mine);
  });
});

test.describe('토스 웹뷰 한 화면(390x746)', () => {
  test.use({ viewport: { width: 390, height: 746 } });

  test('공유 가계부에 적을 때 둘째 화면 키패드가 스크롤 없이 한 화면에 든다', async ({
    home,
    prep,
    recordSheet,
  }) => {
    await prep.createBook({ name: '우리 집' });
    await prep.createBook({ kind: 'family', name: '우리 가족' });
    await prep.createBook({ kind: 'room', name: '우리 방' });

    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.destination.pill('우리 방').click();
    await expect(recordSheet.methodTabs).toHaveCount(4);
    expect(await recordSheet.overflowY()).toBe(0);

    await recordSheet.next();
    await expect(recordSheet.input.numberKey('00')).toBeInViewport({ ratio: 1 });
    await expect(recordSheet.input.backspaceKey).toBeInViewport({ ratio: 1 });
    expect(await recordSheet.overflowY()).toBe(0);
  });

  /*
    내 가계부 키패드. 분류 넉 줄이 서도 맨 아래 줄 키(00, 0, 지우기)까지 한 화면에 든다.
    금액 위아래에 여백을 준 만큼 시트가 조금 더 올라온다(92dvh).
  */
  test('내 가계부에 적을 때도 금액 여백을 두고 키패드 맨 아래 줄까지 한 화면에 든다', async ({
    home,
    prep,
    recordSheet,
  }) => {
    await prep.createBook({ name: '데이트통장' });

    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await expect(recordSheet.destination.pill('내 가계부')).toHaveAttribute('aria-pressed', 'true');
    await recordSheet.next();

    await expect(recordSheet.input.numberKey('00')).toBeInViewport({ ratio: 1 });
    await expect(recordSheet.input.numberKey('0')).toBeInViewport({ ratio: 1 });
    await expect(recordSheet.input.backspaceKey).toBeInViewport({ ratio: 1 });
    expect(await recordSheet.overflowY()).toBe(0);
    expect(await recordSheet.horizontalScrollers()).toEqual([]);
  });
});

test.describe('폴드 겉화면 폭(344)', () => {
  test.use({ viewport: { width: 344, height: 882 } });

  test('긴 이름의 가계부가 셋이어도 「적을 곳」 줄이 한 줄에 선다', async ({
    home,
    prep,
    recordSheet,
  }) => {
    await prep.createBook({ name: '우리 동네 조기축구회' });
    await prep.createBook({ kind: 'trip', name: '제주도 한 달 살기 여행' });
    await prep.createBook({ kind: 'room', name: '성수동 셰어하우스' });

    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();

    await expect(recordSheet.destination.pills).toHaveCount(3);
    expect(await recordSheet.horizontalScrollers()).toEqual([]);
    const tops = await recordSheet.destination.pills.evaluateAll((pills) =>
      pills.map((pill) => Math.round(pill.getBoundingClientRect().top)),
    );
    expect(new Set(tops).size, '알약이 두 줄로 넘어갔다').toBe(1);
    await expect(recordSheet.destination.otherButton).toBeInViewport({ ratio: 1 });
  });
});
