import { formatCurrency, toLedgerDate } from '../../../src/shared/lib/format';
import { PrepApi, thisMonth } from '../../support/api';
import { expect, test } from '../support/director';

/**
 * 같이 쓰는 가계부 두 장면. 61 은 만드는 사람(은홍), 62 는 링크를 받은 사람(준호)이다.
 *
 * 녹화되는 창은 하나라, 상대의 몫(합류, 먼저 적어 둔 기록)은 다른 익명키의 PrepApi 로 심는다.
 * 확인하려는 동작(만들기, 합류, 같이 적기, 정산 보기, 칩으로 고르기)은 전부 화면으로 한다.
 *
 * 공유창은 웹 페이지 바깥이라 영상에 안 찍힌다(fixtures 가 받아 둔다). 그래서 자막에서
 * 공유창이 뜬다고 말하지 않는다.
 */

/** 이번 달 월급. 홈 맨 위 「이번 달 남은 돈」 이 음수로 서지 않게 심는다. */
async function seedSalary(prep: PrepApi): Promise<void> {
  await prep.addTransaction({
    amount: 3_200_000,
    type: 'income',
    merchant: '월급',
    categoryId: await prep.categoryIdByName('월급'),
    on: `${thisMonth()}-01`,
  });
}

/** 오늘부터 며칠 전인 가계부 날짜. 이번 달 안에 머무를 만큼만 쓴다. */
function daysBefore(days: number): string {
  return toLedgerDate(new Date(Date.now() - days * 86_400_000));
}

const BOOK = '둘이 쓰는 돈';

test('61 같이 쓰는 가계부를 만들고 초대한다', async ({
  anonKey,
  appShell,
  books,
  demo,
  home,
  manage,
  prep,
}) => {
  // 혼자 써 온 사람이다. 내 가계부에 오늘 기록이 있어 다시 열면 내 가계부부터 뜬다.
  await seedSalary(prep);
  await prep.addExpense({ amount: 4_500, daysAgo: 0, categoryId: await prep.categoryIdByName('카페·간식') });
  await prep.addTransaction({ amount: 8_000, merchant: '김밥천국', categoryId: await prep.categoryIdByName('식비') });

  await home.open();
  await home.waitReady();
  await demo.open('같이 쓰는 가계부 만들기', '누구와 쓰는지 고르고 내 이름만 적으면 초대까지 한 번에');

  await demo.step('관리 탭 맨 위 카드가 같이 쓰는 가계부 입구다');
  await appShell.goToTab('관리');
  await manage.waitReady();
  await expect(manage.booksEntry).toBeInViewport({ ratio: 1 });
  await demo.beat(2);

  await demo.step('들어가서 같이 쓸 가계부 만들기를 누른다');
  await manage.openBooks();
  await books.list.waitReady();
  await books.list.createButton.click();
  await expect(books.create.kindTitle).toBeVisible();
  await demo.beat();

  await demo.step('누구와 같이 쓰나요. 넷 중 하나를 고른다');
  for (const kind of ['연인·부부', '가족', '여행·모임', '룸메이트']) {
    await expect(books.create.kindButton(kind)).toBeVisible();
  }
  await demo.beat(2);

  await demo.step('연인·부부를 고르면 이름과 돈 나누기가 채워져 있다');
  await books.create.kindButton('연인·부부').click();
  await expect(books.create.stepTitle('연인·부부')).toBeVisible();
  await expect(books.create.bookName).toHaveValue(BOOK);
  await expect(books.create.settleOption('반반')).toHaveAttribute('aria-checked', 'true');
  await demo.beat(2);

  await demo.step('내 이름만 적고 만들고 초대하기를 누른다');
  await books.create.myName.fill('은홍');
  await books.create.submitButton.click();
  await expect(books.homeChip(BOOK)).toBeVisible();
  await demo.beat();

  await demo.step('초대 링크를 보내면 그 가계부 홈이다. 들어오면 여기서 알려 준다');
  await expect(home.book.cards.inviteSent).toContainText('초대장을 보냈어요');
  await demo.beat(2);

  // 준호는 링크를 받아 들어온 사람이다. 합류 화면은 62 가 찍는다.
  const [book] = await prep.books();
  const junho = await PrepApi.create(`${anonKey}-junho`);
  try {
    await junho.joinBook(await prep.bookInviteCode(book.id), '준호');
    await junho.addBookEntry(book.id, { amount: 46_000, title: '주말 장보기', category: '장보기' });
  } finally {
    await junho.dispose();
  }

  await demo.step('준호가 들어와 장보기를 적었다. 앱을 다시 연다');
  await home.open();
  await home.waitReady();
  await expect(home.book.chip).toHaveAccessibleName('보는 가계부 내 가계부');
  await demo.beat(2);

  await demo.step('내 기록이 있으니 내 가계부부터 뜬다. 맨 위 칩으로 둘이 쓰는 돈을 고른다');
  await home.book.chip.click();
  await expect(home.book.picker).toBeVisible();
  await demo.beat(2);
  await home.book.pickerRow(BOOK).click();
  await expect(home.book.chip).toHaveAccessibleName(`보는 가계부 ${BOOK}`);
  await demo.beat();

  await demo.step('준호가 적은 줄이 최근 같이 쓴 돈에 들어와 있다');
  await expect(home.book.recent.row('주말 장보기')).toContainText('준호');
  await expect(home.book.recent.row('주말 장보기')).toContainText(formatCurrency(46_000));
  await demo.beat(3);

  await demo.step('오른쪽 위 얼굴을 누르면 가계부 설정이다. 멤버가 둘이 됐다');
  await home.book.faces.click();
  await books.settings.waitReady();
  await expect(books.settings.membersLabel).toHaveText('멤버 2명');
  await expect(books.settings.member('준호')).toBeVisible();
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('62 초대 링크로 들어와 같이 적고 정산을 본다', async ({
  anonKey,
  appShell,
  books,
  demo,
  home,
  prep,
  recordSheet,
}) => {
  // 링크를 보낸 은홍의 가계부. 이번 달 둘이 쓴 돈 두 줄을 은홍이 먼저 적어 뒀다.
  const eunhong = await PrepApi.create(`${anonKey}-eunhong`);
  let code = '';
  try {
    const bookId = await eunhong.createBook({ name: BOOK, myName: '은홍' });
    await eunhong.addBookEntry(bookId, { amount: 46_000, title: '주말 장보기', category: '장보기', on: daysBefore(2) });
    await eunhong.addBookEntry(bookId, { amount: 28_000, title: '영화 두 장', category: '데이트', on: daysBefore(1) });
    code = await eunhong.bookInviteCode(bookId);
  } finally {
    await eunhong.dispose();
  }
  // 받은 사람(준호)의 내 가계부. 합류해도 이 기록은 은홍에게 안 보인다.
  await seedSalary(prep);
  await prep.addTransaction({ amount: 4_500, merchant: '스타벅스', categoryId: await prep.categoryIdByName('카페·간식') });
  await prep.addTransaction({ amount: 8_000, merchant: '김밥천국', categoryId: await prep.categoryIdByName('식비') });

  await home.open();
  await home.waitReady();
  await demo.open('초대받아 같이 적기', '링크로 들어와 같이 적고, 정산을 보고, 칩으로 가계부를 오간다');

  await demo.step('은홍이 보낸 초대 링크를 누르면 이 화면이 열린다');
  await books.openJoin(code);
  await expect(books.join.title).toHaveText(`은홍님이 「${BOOK}」에 초대했어요`);
  await demo.beat(2);

  await demo.step('내 가계부 기록은 은홍에게 보이지 않는다고 먼저 말한다');
  await expect(books.join.lockLine).toHaveText('내 가계부 기록은 은홍님에게 보이지 않아요');
  await demo.beat(2);

  await demo.step('여기서 부를 내 이름을 적고 같이 쓰기를 누른다');
  await books.join.nameInput.fill('준호');
  await books.join.joinButton.click();
  await expect(books.homeChip(BOOK)).toBeVisible();
  await demo.beat();

  await demo.step('은홍이 먼저 적은 두 줄이 보인다');
  await expect(home.book.recent.row('주말 장보기')).toContainText('은홍');
  await expect(home.book.recent.row('영화 두 장')).toBeVisible();
  await demo.beat(2);

  await demo.step('기록하기를 누르면 적을 곳이 둘이 쓰는 돈으로 골라져 있다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.destination.pill(BOOK)).toHaveAttribute('aria-pressed', 'true');
  await demo.beat(2);

  await demo.step('치킨 배달 23,000원을 외식·배달로 적는다');
  await recordSheet.openKeypad();
  await recordSheet.input.enterAmount(23_000);
  await demo.beat();
  await recordSheet.input.pickCategory('외식·배달');
  await expect(recordSheet.bookFeedback.savedLabel(BOOK)).toBeVisible();
  await demo.beat();

  await demo.step('은홍도 바로 본다. 낸 사람은 나로 골라져 있다');
  await expect(recordSheet.bookFeedback.card).toContainText('은홍도 바로 볼 수 있어요');
  await expect(recordSheet.bookFeedback.payer('준호')).toHaveAttribute('aria-pressed', 'true');
  await demo.beat(2);
  await recordSheet.bookFeedback.confirmButton.click();
  await recordSheet.waitClosed();

  // 46,000 + 28,000 + 23,000 = 97,000 의 반은 48,500. 준호가 낸 23,000 을 빼면 25,500.
  await demo.step('정산 한 줄이 누가 누구에게 얼마를 보내면 반반인지 말한다');
  await expect(home.book.recent.row('외식·배달')).toContainText('준호');
  await expect(home.book.settleCard).toContainText(`준호가 은홍에게 ${formatCurrency(25_500)} 보내면 반반이에요`);
  await home.book.settleCard.scrollIntoViewIfNeeded();
  await demo.beat(2);

  await demo.step('누르면 정산 화면에서 누가 얼마를 냈는지 함께 본다');
  await home.book.settleCard.click();
  await books.settle.waitReady();
  await expect(books.settle.result).toContainText(formatCurrency(25_500));
  await demo.beat(3);

  await demo.step('홈으로 돌아와 맨 위 칩에서 내 가계부를 고른다');
  await appShell.pressBack();
  await expect(home.book.chip).toHaveAccessibleName(`보는 가계부 ${BOOK}`);
  await home.book.chip.click();
  await expect(home.book.picker).toBeVisible();
  await demo.beat(2);
  await home.book.pickerRow('내 가계부').click();
  await expect(home.book.chip).toHaveAccessibleName('보는 가계부 내 가계부');
  await demo.beat();

  await demo.step('내 가계부에는 내가 쓴 돈만 있다');
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(12_500));
  await expect(home.today.row('스타벅스')).toBeVisible();
  await demo.beat(2);

  await demo.clearStep();
  await demo.beat(2);
});
