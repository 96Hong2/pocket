import type { Page } from '@playwright/test';

import { formatCurrency, toLedgerDate } from '../../src/shared/lib/format';
import { logsNamed } from '../support/aitMock';
import { CAPTURE_DATA_URI, seedMockImages } from '../support/deviceMock';
import { expect, test } from '../support/fixtures';

/**
 * 공유 가계부에도 내 가계부와 같은 길로 적는다: 줄글·캡처·영수증, 새 분류, 옮기기 되돌리기.
 *
 * 지키는 것:
 * - 적을 곳이 공유 가계부여도 방법 탭 넷이 선다. 수입·이체·결제 수단은 서지 않는다.
 * - 읽은 것 중 지출만 그 가계부에 들어간다. 수입·환불 줄은 꺼진 채 흐리고 이유가 적혀 있다.
 * - 검토하는 동안에는 적을 곳을 못 바꾼다. 읽을 때 고른 가계부에 묶여 있다.
 * - 새 분류는 그 가계부 분류가 되어 같이 쓰는 사람 화면에도 선다.
 * - 옮기기를 되돌리면 새로 만들지 않고 옮기기 전과 똑같이 돌아온다(태그, 결제 수단, 낸 사람).
 *
 * 줄글·캡처는 스텁 모델이 읽는다. 공유 모드에서 스텁이 고르는 분류는 백엔드 테스트가 정해 둔 값이다.
 */

/** 이름을 따로 안 주고 만든 연인·부부 가계부의 이름. */
const BOOK = '둘이 쓰는 돈';

/** 옮기기 되돌림은 `undo_move` 로 남고 옮김(`move`)은 한 번뿐이다. 되돌린 만큼 옮김이 부풀면 안 된다. */
async function expectUndoMoveLogged(page: Page, to: 'mine' | 'shared'): Promise<void> {
  const changed = (await logsNamed(page, 'record_changed')).map((log) => log.params);
  expect(changed.filter((params) => params.action === 'move')).toHaveLength(1);
  expect(changed.at(-1)).toMatchObject({ action: 'undo_move', to, book: 'shared' });
}

/** 스텁이 다섯 건으로 읽는 한 줄. 넷이 지출이고 「용돈」 은 수입이다. */
const FIVE_ITEMS = '외식 30000 장보기 45000 데이트 영화 20000 택시 9000 용돈 50000';

function dayOf(daysAgo: number): string {
  const at = new Date();
  at.setDate(at.getDate() - daysAgo);
  return toLedgerDate(at);
}

test('공유 가계부에서 줄글로 적으면 검토한 지출만 그 가계부에 들어가고 내 가계부는 그대로다', async ({
  home,
  page,
  partner,
  prep,
  recordSheet,
}) => {
  const bookId = await prep.createBook({ myName: '은홍' });
  await partner.prep.joinBook(await prep.bookInviteCode(bookId), '준호');
  await prep.addTransaction({ amount: 5_000, merchant: '편의점' });

  await home.open();
  await home.waitReady();
  await home.book.switchTo(BOOK);
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await test.step('방법 카드 넷이 서고, 종류는 지출만 켜진다', async () => {
    await expect(recordSheet.destination.pill(BOOK)).toHaveAttribute('aria-pressed', 'true');
    await expect(recordSheet.methodTabs).toHaveCount(4);
    // 공유 가계부는 지출만 받는다. 칩은 셋 다 서되 지출만 켜지고 나머지는 흐리다.
    await expect(recordSheet.kindChip('지출')).toHaveAttribute('aria-checked', 'true');
    await expect(recordSheet.kindChip('수입')).toBeDisabled();
    await expect(recordSheet.kindChip('이체')).toBeDisabled();
  });

  await test.step('읽으면 그 가계부 분류가 붙고, 수입 줄은 꺼진 채 흐리다', async () => {
    await recordSheet.chooseWay('줄글');
    await recordSheet.nl.analyze(FIVE_ITEMS);
    await expect(recordSheet.nl.rows).toHaveCount(5);

    await expect(recordSheet.nl.categoryButton('외식')).toHaveAccessibleName(
      '분류 외식·배달, 바꾸기',
    );
    await expect(recordSheet.nl.categoryButton('데이트 영화')).toHaveAccessibleName(
      '분류 데이트, 바꾸기',
    );
    // 지출·수입을 오가는 ⇄ 는 공유 가계부에 없다.
    await expect(recordSheet.nl.kindButton('외식')).toHaveCount(0);

    await expect(recordSheet.nl.checkbox('용돈')).not.toBeChecked();
    await expect(recordSheet.nl.checkbox('용돈')).toBeDisabled();
    await expect(recordSheet.nl.lockedNote('용돈')).toBeVisible();
    await expect(recordSheet.nl.lockedNote('택시')).toHaveCount(0);

    await expect(recordSheet.nl.saveButton).toHaveText(`4건 저장 · ${formatCurrency(104_000)}`);
  });

  await test.step('검토하는 동안 적을 곳을 바꾸려면 읽어 온 것을 먼저 버려야 한다', async () => {
    // 적을 곳은 첫 화면에 있다. 읽어 둔 것은 읽을 때 고른 가계부에 묶여 있어 ‹ 가 먼저 묻는다.
    await recordSheet.back();
    await expect(recordSheet.panelLeave.text).toHaveText('읽어 온 5건이 사라져요');
    await recordSheet.panelLeave.stayButton.click();
    await expect(recordSheet.destination.group).toBeHidden();
    await expect(recordSheet.nl.rows).toHaveCount(5);
  });

  await test.step('줄을 펴면 종류·결제 수단 없이 고치고, 새 분류는 그 가계부 분류가 된다', async () => {
    await recordSheet.nl.openEdit('택시');
    await expect(recordSheet.nl.form.typeTab('지출')).toHaveCount(0);
    await expect(recordSheet.nl.form.paymentGroup).toHaveCount(0);

    await recordSheet.nl.form.openNewCategory();
    const compose = recordSheet.nl.form.compose;
    await expect(compose.title).toBeVisible();
    // 공유 분류는 기본 아이콘만 받는다. 사진·이모지 탭도, 색도 없다.
    await expect(page.getByRole('radiogroup', { name: '아이콘 고르는 방법' })).toHaveCount(0);
    await compose.nameField.fill('교통');
    await compose.pickIcon('coins');
    await expect(compose.colorGroup).toHaveCount(0);
    await compose.saveButton.click();
    await expect(compose.title).toHaveCount(0);

    await expect(recordSheet.nl.form.categoryButton).toHaveAccessibleName('분류 교통, 바꾸기');
    // 분류 없이 읽힌 줄에 분류를 골랐지만 공유 가계부는 상호를 기억하지 않는다. 묻지도 않는다.
    await expect(recordSheet.nl.rulePrompt('택시')).toHaveCount(0);
    await recordSheet.nl.form.doneButton.click();
    await expect(recordSheet.nl.categoryButton('택시')).toHaveAccessibleName('분류 교통, 바꾸기');
    await expect(recordSheet.nl.rulePrompt('택시')).toHaveCount(0);
  });

  await test.step('저장하면 공유 가계부 말투로 말한다', async () => {
    await recordSheet.nl.saveButton.click();
    await expect(recordSheet.nl.savedInBook(BOOK)).toHaveText(`${BOOK}에 4건 적었어요`);
    await expect(recordSheet.nl.panel).toContainText(
      `이번 달 같이 쓴 돈 ${formatCurrency(104_000)}`,
    );
    await expect(recordSheet.nl.panel).toContainText('준호도 바로 볼 수 있어요');
    // 내 가계부의 남은 예산 문구는 섞이지 않는다.
    await expect(recordSheet.nl.panel).not.toContainText('남은 예산');

    const saved = (await logsNamed(page, 'save_result')).at(-1);
    expect(saved?.params.method).toBe('text');
    expect(saved?.params.book).toBe('shared');

    await recordSheet.nl.confirmButton.click();
    await recordSheet.waitClosed();
  });

  await test.step('최근 같이 쓴 돈에 들어가고, 내 가계부 합계는 그대로다', async () => {
    await expect(home.book.moreButton).toHaveText('이번 달 4건 모두 보기');
    await home.book.moreButton.click();
    await expect(home.book.recent.rows).toHaveCount(4);
    await expect(home.book.recent.row('택시')).toContainText('9,000원');
    await expect(home.book.recent.row('용돈')).toHaveCount(0);

    const entries = await prep.bookEntries(bookId);
    const book = await prep.book(bookId);
    const nameOf = (id: string | null) => book.categories.find((c) => c.id === id)?.name ?? null;
    expect(
      entries.map((entry) => [entry.title, entry.amount, nameOf(entry.category_id)]).sort(),
    ).toEqual(
      [
        ['데이트 영화', '20000', '데이트'],
        ['외식', '30000', '외식·배달'],
        ['장보기', '45000', '장보기'],
        ['택시', '9000', '교통'],
      ].sort(),
    );

    await home.book.switchTo('내 가계부');
    await expect(home.hero.monthSpent).toHaveText('5,000원');
  });
});

test('공유 가계부에서 캡처로 읽으면 준호가 먼저 적은 것은 이미 있어요로 꺼지고, 환불 줄은 못 켠다', async ({
  home,
  page,
  partner,
  prep,
  recordSheet,
}) => {
  const bookId = await prep.createBook({ myName: '은홍' });
  await partner.prep.joinBook(await prep.bookInviteCode(bookId), '준호');
  // 준호가 오늘 스타벅스를 먼저 적었다. 스텁 첫 줄과 같은 날·같은 금액·같은 상호다.
  await partner.prep.addBookEntry(bookId, { amount: 4_500, title: '스타벅스' });
  // 내 가계부의 GS25 는 공유 쪽 「이미 있어요」 판정에 안 들어간다.
  await prep.addTransaction({ amount: 3_200, merchant: 'GS25' });
  await seedMockImages(CAPTURE_DATA_URI)(page);

  await home.open();
  await home.waitReady();
  await home.book.switchTo(BOOK);
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.chooseWay('캡처');
  await recordSheet.capture.pick();
  await expect(recordSheet.capture.rows).toHaveCount(6);

  await expect(recordSheet.capture.chip('스타벅스', '이미 있어요')).toBeVisible();
  await expect(recordSheet.capture.checkbox('스타벅스')).not.toBeChecked();
  await expect(recordSheet.capture.chip('GS25', '이미 있어요')).toHaveCount(0);
  await expect(recordSheet.capture.checkbox('GS25')).toBeChecked();

  // 카드 캐시백은 환불이라 공유 가계부에는 못 적는다. 「수입으로 바꾸기」 도 없다.
  await expect(recordSheet.capture.checkbox('MY 카드 캐시백')).toBeDisabled();
  await expect(recordSheet.capture.lockedNote('MY 카드 캐시백')).toBeVisible();
  await expect(recordSheet.capture.refundToIncome('MY 카드 캐시백')).toHaveCount(0);
  // 확신이 낮은 지출은 꺼진 채 오지만 켤 수 있다.
  await expect(recordSheet.capture.checkbox('카카오T')).toBeEnabled();
  await expect(recordSheet.capture.lockedNote('카카오T')).toHaveCount(0);

  // GS25 3,200 + 김밥천국 8,000(어제) + 쿠팡 32,900(그저께)
  const selected = [
    { amount: 3_200, day: dayOf(0) },
    { amount: 8_000, day: dayOf(1) },
    { amount: 32_900, day: dayOf(2) },
  ];
  const total = selected.reduce((sum, row) => sum + row.amount, 0);
  await expect(recordSheet.capture.saveButton).toHaveText(`3건 저장 · ${formatCurrency(total)}`);

  await recordSheet.capture.saveButton.click();
  await expect(recordSheet.capture.savedInBook(BOOK)).toHaveText(`${BOOK}에 3건 적었어요`);
  // 그 달 같이 쓴 돈은 먼저 적힌 스타벅스까지 센다. 달이 넘어간 줄은 빠진다.
  const month = dayOf(0).slice(0, 7);
  const spent =
    4_500 +
    selected.filter((row) => row.day.slice(0, 7) === month).reduce((s, r) => s + r.amount, 0);
  await expect(recordSheet.capture.panel).toContainText(
    `이번 달 같이 쓴 돈 ${formatCurrency(spent)}`,
  );
  await recordSheet.capture.confirmButton.click();
  await recordSheet.waitClosed();

  const titles = (await prep.bookEntries(bookId)).map((entry) => entry.title).sort();
  expect(titles).toEqual(['GS25', '김밥천국', '스타벅스', '쿠팡'].sort());
  expect((await logsNamed(page, 'save_result')).at(-1)?.params.book).toBe('shared');
});

test('공유 가계부 키패드에서 만든 새 분류가 바로 골라지고 준호 화면에도 선다', async ({
  home,
  page,
  partner,
  prep,
  recordSheet,
}) => {
  const bookId = await prep.createBook({ myName: '은홍' });
  await partner.prep.joinBook(await prep.bookInviteCode(bookId), '준호');

  await home.open();
  await home.waitReady();
  await home.book.switchTo(BOOK);
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await test.step('새 분류는 이름과 기본 아이콘만 받는다', async () => {
    await recordSheet.input.enterAmount(15_000);
    await recordSheet.input.openNewCategory();
    const form = recordSheet.input.newCategoryForm;
    await expect(form.title).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: '아이콘 고르는 방법' })).toHaveCount(0);
    await form.create('반려동물', 'paw');
    await expect(form.title).toHaveCount(0);
    // 카테고리 관리 칩은 공유 가계부에 없다. 공유 분류는 관리 화면이 없다.
    await expect(recordSheet.input.categoryManageLink).toHaveCount(0);
    await expect(recordSheet.input.pickedCategory).toContainText('반려동물');
  });

  await test.step('저장하면 공유 가계부에 그 분류로 적힌다', async () => {
    await recordSheet.input.saveButton.click();
    await expect(recordSheet.bookFeedback.savedLabel(BOOK)).toBeVisible();
    const [entry] = await prep.bookEntries(bookId);
    const book = await prep.book(bookId);
    expect(book.categories.find((c) => c.id === entry?.category_id)?.name).toBe('반려동물');
    // 새 분류는 「기타」 바로 앞에 선다.
    expect(book.categories.map((c) => c.name).slice(-2)).toEqual(['반려동물', '기타']);
  });

  await test.step('저장 뒤 화면에서 옮겼다가 되돌리면 그대로 돌아온다', async () => {
    await recordSheet.bookFeedback.moveOutButton.click();
    await expect(recordSheet.bookFeedback.movedLabel).toBeVisible();
    await recordSheet.bookFeedback.undoMoveButton.click();
    await expect(recordSheet.bookFeedback.savedLabel(BOOK)).toBeVisible();
    await expect(recordSheet.bookFeedback.payer('은홍')).toHaveAttribute('aria-pressed', 'true');
    expect(await prep.bookEntries(bookId)).toHaveLength(1);
    await expectUndoMoveLogged(page, 'shared');
    await recordSheet.bookFeedback.confirmButton.click();
    await recordSheet.waitClosed();
  });

  await test.step('준호가 새로 열면 그 분류가 기록 시트에 서 있다', async () => {
    await partner.home.open();
    await partner.home.waitReady();
    await partner.home.book.switchTo(BOOK);
    await expect(partner.home.book.recent.row('반려동물')).toContainText('15,000원');
    await partner.home.recordButton.click();
    await partner.recordSheet.waitOpen();
    await partner.recordSheet.openKeypad();
    await expect(partner.recordSheet.input.categoryChip('반려동물')).toBeVisible();
  });
});

test('내 가계부로 되돌리면 옮기기 전 태그와 결제 수단이 그대로다', async ({ home, page, prep }) => {
  const bookId = await prep.createBook();
  const tagId = await prep.addTag('생일선물');
  await prep.addTransaction({
    amount: 9_000,
    merchant: '다이소',
    tagId,
    paymentMethod: 'credit',
  });

  await home.open();
  await home.waitReady();
  await home.today.row('다이소').click();
  await home.bookEdit.waitOpen();
  await home.bookEdit.destinationPill(BOOK).click();
  await home.bookEdit.doneButton.click();
  await home.bookEdit.waitClosed();
  await expect(home.toast.withText(`${BOOK}으로 옮겼어요`)).toBeVisible();
  await expect(home.today.row('다이소')).toHaveCount(0);

  await home.toast.undoButton.click();
  await expect(home.toast.withText('내 가계부로 되돌렸어요')).toBeVisible();
  await expect(home.today.row('다이소')).toBeVisible();
  expect(await prep.bookEntries(bookId)).toEqual([]);
  await expectUndoMoveLogged(page, 'mine');

  await home.today.row('다이소').click();
  await home.edit.waitOpen();
  await expect(home.edit.tagChip('생일선물')).toHaveAttribute('aria-pressed', 'true');
  await expect(home.edit.paymentButton('신용카드')).toHaveAttribute('aria-pressed', 'true');
});

test('공유 가계부로 되돌리면 원래 낸 사람과 분류가 그대로다', async ({
  home,
  page,
  partner,
  prep,
}) => {
  const bookId = await prep.createBook({ myName: '은홍' });
  await partner.prep.joinBook(await prep.bookInviteCode(bookId), '준호');
  const junho = (await prep.book(bookId)).members.find((member) => member.name === '준호');
  expect(junho).toBeDefined();
  await prep.addBookEntry(bookId, {
    amount: 21_000,
    category: '장보기',
    paidByMemberId: junho?.id,
  });

  await home.open();
  await home.waitReady();
  await home.book.switchTo(BOOK);
  await home.book.recent.row('장보기').click();
  await home.bookEdit.waitOpen();
  await expect(home.bookEdit.payer('준호')).toHaveAttribute('aria-pressed', 'true');
  await home.bookEdit.destinationPill('내 가계부').click();
  await home.bookEdit.saveButton.click();
  await home.bookEdit.waitClosed();
  await expect(home.toast.withText('내 가계부로 옮겼어요')).toBeVisible();
  await expect(home.book.recent.row('장보기')).toHaveCount(0);

  await home.toast.undoButton.click();
  await expect(home.book.recent.row('장보기')).toBeVisible();
  const [entry] = await prep.bookEntries(bookId);
  expect(entry?.paid_by_member_id).toBe(junho?.id);
  await expectUndoMoveLogged(page, 'shared');

  await home.book.recent.row('장보기').click();
  await home.bookEdit.waitOpen();
  await expect(home.bookEdit.payer('준호')).toHaveAttribute('aria-pressed', 'true');
  await expect(home.bookEdit.categoryChip('장보기')).toHaveAttribute('aria-pressed', 'true');
});

/**
 * 공유 기록을 내 가계부로 옮길 때 분류 칸이 내 분류로 바뀐다.
 *
 * 공유 분류가 그대로 서 있으면 거기서 「데이트」 를 골라도 옮긴 뒤에는 「기타」 로 바뀌어 있었다.
 * 옮긴 뒤 뜨는 「되돌리기」 알림이 가계부 고르기 창의 「내 가계부」 줄을 덮어, 그 줄을 누른
 * 손가락이 되돌리기를 눌렀다. 옮긴 기록이 내 가계부에서 사라진 것처럼 보인 까닭이다(운영 로그로 확인).
 */
test('공유 기록을 내 가계부로 옮기면 분류 칸이 내 분류로 바뀌고, 고르기 창을 열면 알림이 걷힌다', async ({
  home,
  page,
  partner,
  prep,
}) => {
  const bookId = await prep.createBook({ myName: '은홍' });
  await partner.prep.joinBook(await prep.bookInviteCode(bookId), '준호');
  await prep.addBookEntry(bookId, { amount: 15_000, category: '생활', title: '영화' });

  await home.open();
  await home.waitReady();
  await home.book.switchTo(BOOK);
  await home.book.recent.row('영화').click();
  await home.bookEdit.waitOpen();
  await expect(home.bookEdit.categoryChip('데이트')).toBeVisible();
  await expect(home.bookEdit.payerGroup).toBeVisible();

  await home.bookEdit.destinationPill('내 가계부').click();
  // 공유 분류는 걷히고 내 분류가 선다. 같은 이름(「생활」)이 먼저 골라져 있다. 낸 사람 줄도 걷힌다.
  await expect(home.bookEdit.categoryChip('데이트')).toHaveCount(0);
  await expect(home.bookEdit.categoryChip('생활')).toHaveAttribute('aria-pressed', 'true');
  await expect(home.bookEdit.payerGroup).toHaveCount(0);
  await home.bookEdit.categoryChip('여가·취미').click();
  await expect(home.bookEdit.categoryChip('여가·취미')).toHaveAttribute('aria-pressed', 'true');

  // 다시 공유 가계부를 고르면 공유 분류와 낸 사람이 옮기기 전 그대로 돌아온다.
  await home.bookEdit.destinationPill(BOOK).click();
  await expect(home.bookEdit.categoryChip('생활')).toHaveAttribute('aria-pressed', 'true');
  await expect(home.bookEdit.payerGroup).toBeVisible();
  await home.bookEdit.destinationPill('내 가계부').click();
  await expect(home.bookEdit.categoryChip('여가·취미')).toHaveAttribute('aria-pressed', 'true');

  await home.bookEdit.saveButton.click();
  await home.bookEdit.waitClosed();
  await expect(home.toast.withText('내 가계부로 옮겼어요')).toBeVisible();

  await test.step('고르기 창을 열면 앞서 뜬 알림이 걷혀 「내 가계부」 줄을 덮지 않는다', async () => {
    // 알림과 같은 순간에 뜬 창은 알림을 안 걷는다. 사람이 칩을 누르는 데 걸리는 틈을 둔다.
    await page.waitForTimeout(400);
    await home.book.chip.click();
    await expect(home.book.picker).toBeVisible();
    await expect(home.toast.withText('내 가계부로 옮겼어요')).toHaveCount(0);
    await expect(home.toast.undoButton).toHaveCount(0);
    await home.book.pickerRow('내 가계부').click();
    await expect(home.book.picker).toHaveCount(0);
  });

  // 되돌리기가 눌리지 않았다. 옮긴 기록이 내 가계부에 고른 분류로 서 있다.
  await expect(home.today.row('영화')).toBeVisible();
  expect(await prep.bookEntries(bookId)).toEqual([]);
  await home.today.row('영화').click();
  await expect(home.edit.categoryChip('여가·취미')).toHaveAttribute('aria-pressed', 'true');
  expect((await logsNamed(page, 'record_changed')).map((log) => log.params.action)).not.toContain(
    'undo_move',
  );
});

test('공유 기록 수정 시트에서 만든 새 분류가 골라지고, 저장하면 그 분류로 바뀐다', async ({
  home,
  partner,
  prep,
}) => {
  const bookId = await prep.createBook({ myName: '은홍' });
  await partner.prep.joinBook(await prep.bookInviteCode(bookId), '준호');
  await prep.addBookEntry(bookId, { amount: 12_000, category: '생활', title: '약국' });

  await home.open();
  await home.waitReady();
  await home.book.switchTo(BOOK);
  await home.book.recent.row('약국').click();
  await home.bookEdit.waitOpen();

  await home.bookEdit.openNewCategory();
  const compose = home.bookEdit.compose;
  await expect(compose.title).toBeVisible();
  await compose.nameField.fill('병원·약');
  await compose.pickIcon('paw');
  await home.bookEdit.composeSaveButton.click();
  await expect(compose.title).toHaveCount(0);

  // 고치던 시트는 그대로 남고, 만든 분류가 골라져 있다. 관리 화면으로 가라는 줄은 없다.
  await expect(home.bookEdit.categoryChip('병원·약')).toHaveAttribute('aria-pressed', 'true');
  await expect(home.bookEdit.dialog).not.toContainText('카테고리 관리');
  await home.bookEdit.saveButton.click();
  await home.bookEdit.waitClosed();

  const [entry] = await prep.bookEntries(bookId);
  const book = await prep.book(bookId);
  expect(book.categories.find((c) => c.id === entry?.category_id)?.name).toBe('병원·약');

  // 준호에게도 같은 분류로 보인다.
  await partner.home.open();
  await partner.home.waitReady();
  await partner.home.book.switchTo(BOOK);
  await partner.home.book.recent.row('약국').click();
  await partner.home.bookEdit.waitOpen();
  await expect(partner.home.bookEdit.categoryChip('병원·약')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
