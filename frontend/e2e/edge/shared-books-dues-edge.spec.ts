import { formatCurrency, shiftDay, toLedgerDate } from '../../src/shared/lib/format';
import { PrepApi } from '../support/api';
import { pressSystemBack } from '../support/aitMock';
import { expect, test as base } from '../support/fixtures';

/**
 * 공유 가계부 회비와 시작일을 험하게 다뤘을 때, 그리고 카테고리 지우기 확인 창.
 *
 * 기본 동작은 `specs/shared-books-dues.spec.ts` 가 지킨다. 여기서 보는 것은 경계다.
 * 비율 0% 와 100%, 사람이 들어온 뒤 비율, 시작일 28일과 1일, 입금이 쓴 돈에 섞이지 않는 것,
 * 입금을 모르는 옛 화면, 나갔다 다시 들어온 사람의 내역, 지우기 확인에서 물러나기와 뒤로가기.
 */

const test = base.extend<{ people: (tag: string) => Promise<PrepApi> }>({
  people: async ({ anonKey }, use) => {
    const made: PrepApi[] = [];
    await use(async (tag) => {
      const api = await PrepApi.create(`${anonKey}-${tag}`);
      made.push(api);
      return api;
    });
    await Promise.all(made.map((api) => api.dispose()));
  },
});

test.describe.configure({ timeout: 90_000 });

/** 그 달의 마지막 날. 날짜 계산은 문자열과 UTC 로만 한다. */
function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

test('비율 0% 와 100%: 한 사람이 다 맡으면 줄은 「0:10」 이고 그 사람이 낸 만큼 받는다', async ({
  books,
  people,
  prep,
}) => {
  const bookId = await prep.createBook({ myName: '은홍' });
  await (await people('junho')).joinBook(await prep.bookInviteCode(bookId), '준호');
  await prep.addBookEntry(bookId, { amount: 10_000, category: '장보기' });

  await books.openSettings(bookId);
  await books.settings.waitReady();
  await books.settings.duesRow.click();
  const dues = books.settings.dues;
  await dues.waitOpen();
  await dues.setPercent('은홍', 0);
  await expect(dues.slider('준호')).toHaveValue('100');
  await expect(dues.slider('은홍')).toHaveAttribute('aria-valuetext', '은홍 0%');
  await dues.saveButton.click();
  await dues.waitClosed();
  await expect(books.settings.duesRow).toContainText('나중에 정산, 0:10');

  // 은홍 몫은 0원, 준호 몫이 10,000원이다. 은홍이 낸 10,000원을 준호가 보낸다.
  await books.openSettle(bookId);
  await books.settle.waitReady();
  await expect(books.settle.line('준호가 은홍에게 10,000원 보내면 돼요')).toBeVisible();
});

test('비율을 정한 뒤 누가 들어오면 「똑같이」 로 돌아간다', async ({ books, people, prep }) => {
  const bookId = await prep.createBook({ kind: 'room', name: '우리 방', myName: '은홍' });
  const code = await prep.bookInviteCode(bookId);
  await (await people('junho')).joinBook(code, '준호');
  await prep.setBookShares(bookId, { 은홍: 70, 준호: 30 });
  expect((await prep.book(bookId)).share_percents).not.toBeNull();

  await (await people('seoyeon')).joinBook(code, '서연');
  expect((await prep.book(bookId)).share_percents).toBeNull();

  await books.openSettings(bookId);
  await books.settings.waitReady();
  await expect(books.settings.duesRow).toContainText('나중에 정산, 똑같이');
  await books.settings.duesRow.click();
  await books.settings.dues.waitOpen();
  await expect(books.settings.dues.sliders).toHaveCount(3);
  await expect(books.settings.dues.equalButton).toHaveAttribute('aria-pressed', 'true');
});

test('시작일 28일과 1일: 미리보기가 그 날로 끊고 저장한 값이 줄에 선다', async ({
  books,
  prep,
}) => {
  const bookId = await prep.createBook({ myName: '은홍' });
  const today = toLedgerDate(new Date());
  const [year, month, day] = today.split('-').map(Number);

  await books.openSettings(bookId);
  await books.settings.waitReady();
  await books.settings.startDayRow.click();
  const sheet = books.settings.startDay;
  await sheet.waitOpen();

  // 28일에 시작하면 이름은 끝나는 달이다. 화면 코드와 따로 센다.
  await sheet.day(28).click();
  const startMonth = day >= 28 ? month : month === 1 ? 12 : month - 1;
  const endMonth = startMonth === 12 ? 1 : startMonth + 1;
  await expect(sheet.preview).toHaveText(
    `${endMonth}월은 ${startMonth}월 28일부터 ${endMonth}월 27일까지예요`,
  );
  await sheet.saveButton.click();
  await sheet.waitClosed();
  await expect(books.settings.startDayRow).toContainText('매달 28일');

  await books.settings.startDayRow.click();
  await sheet.waitOpen();
  await expect(sheet.day(28)).toHaveAttribute('aria-pressed', 'true');
  await sheet.day(1).click();
  await expect(sheet.preview).toHaveText(
    `${month}월은 ${month}월 1일부터 ${lastDay(year, month)}일까지예요`,
  );
  await sheet.saveButton.click();
  await sheet.waitClosed();
  await expect(books.settings.startDayRow).toContainText('매달 1일');
  expect((await prep.book(bookId)).month_start_day).toBe(1);
});

test('입금은 쓴 돈과 정산에 들지 않는다. 나중에 정산 가계부에 남은 입금도 목록에만 선다', async ({
  books,
  home,
  prep,
  people,
}) => {
  const bookId = await prep.createBook({ name: '우리 집', myName: '은홍' });
  await (await people('junho')).joinBook(await prep.bookInviteCode(bookId), '준호');
  await prep.addBookDeposit(bookId, { amount: 500_000, title: '모아 둔 돈' });
  await prep.addBookEntry(bookId, { amount: 10_000, category: '장보기' });

  await home.open();
  await home.waitReady();
  await home.book.switchTo('우리 집');
  await expect(home.book.heroAmount).toHaveText('10,000원');
  await expect(home.book.recent.row('모아 둔 돈')).toContainText('+500,000원');
  // 나중에 정산 가계부에는 입금 적기 버튼이 없다.
  await expect(home.book.depositButton).toHaveCount(0);
  await expect(home.book.settleCard).toContainText('준호가 은홍에게 5,000원 보내면 반반이에요');

  await books.openSettle(bookId);
  await books.settle.waitReady();
  await expect(books.settle.line(`같이 쓴 돈 ${formatCurrency(10_000)}`)).toBeVisible();
  await expect(books.settle.paidRow('은홍이 낸 돈')).toContainText('10,000원');
});

test('입금을 모르는 옛 화면이 묻는 목록에는 입금이 안 온다', async ({ prep }) => {
  const bookId = await prep.createBook({ myName: '은홍', settleRule: 'none' });
  await prep.addBookDeposit(bookId, { amount: 300_000 });
  await prep.addBookEntry(bookId, { amount: 8_000, category: '장보기' });

  const old = await prep.bookEntries(bookId);
  expect(old.map((entry) => entry.kind)).toEqual(['expense']);
  const fresh = await prep.bookEntries(bookId, { includeDeposits: true });
  expect(fresh.map((entry) => entry.kind).sort()).toEqual(['deposit', 'expense']);
});

test('나갔다 다시 들어온 사람의 내역에는 나가기 전 기록도 선다', async ({
  books,
  people,
  prep,
}) => {
  const bookId = await prep.createBook({ kind: 'room', name: '우리 방', myName: '은홍' });
  const junho = await people('junho');
  await junho.joinBook(await prep.bookInviteCode(bookId), '준호');
  const today = toLedgerDate(new Date());
  await junho.addBookEntry(bookId, {
    amount: 4_000,
    category: '장보기',
    title: '나가기 전',
    on: shiftDay(today, -2),
  });
  await junho.leaveBook(bookId);
  await junho.joinBook(await prep.bookInviteCode(bookId), '준호');
  await junho.addBookEntry(bookId, { amount: 6_000, category: '장보기', title: '다시 와서' });

  await books.openSettings(bookId);
  await books.settings.waitReady();
  await books.settings.memberButton('준호').click();
  const history = books.settings.history('준호');
  await history.waitOpen();
  await expect(history.row('나가기 전')).toBeVisible();
  await expect(history.row('다시 와서')).toBeVisible();
  await expect(history.total('낸 돈')).toContainText('10,000원');
});

test('카테고리 예산 지우기: 확인 창에서 물러나면 남고, 뒤로가기는 창만 닫고, 지우면 빠진다', async ({
  manage,
  page,
  prep,
}) => {
  const food = await prep.categoryIdByName('식비');
  await prep.setBudget(600_000);
  await prep.setCategoryBudget(food, 200_000);

  await manage.open();
  await manage.waitReady();
  await manage.categories.openEdit('식비');
  const sheet = manage.categories.sheet;

  await sheet.deleteButton.click();
  await expect(sheet.deleteConfirm).toBeVisible();
  await sheet.keepButton.click();
  await expect(sheet.deleteConfirm).toHaveCount(0);
  await expect(sheet.amountField).toHaveValue('200,000');

  await sheet.deleteButton.click();
  await expect(sheet.deleteConfirm).toBeVisible();
  await pressSystemBack(page);
  await expect(sheet.deleteConfirm).toHaveCount(0);
  await expect(sheet.amountField).toBeVisible();

  await sheet.deleteButton.click();
  await sheet.confirmDeleteButton.click();
  await sheet.waitClosed();
  await expect(manage.categories.row('식비')).toHaveCount(0);
});

test('카테고리 고치기 지우기: 확인 창이 떠 있을 때 뒤로가기는 창만 닫는다', async ({
  categories,
  page,
  prep,
}) => {
  await prep.addCategory('반려동물');
  await categories.open();
  await categories.waitReady();
  await categories.openEdit('반려동물');

  await categories.sheet.deleteButton.click();
  await expect(categories.sheet.confirmArea).toBeVisible();
  await pressSystemBack(page);
  await expect(categories.sheet.confirmArea).toHaveCount(0);
  await expect(categories.sheet.deleteButton).toBeVisible();

  await categories.sheet.deleteButton.click();
  await categories.sheet.confirmDeleteButton.click();
  await categories.sheet.waitClosed();
  await expect(categories.editButton('반려동물')).toHaveCount(0);
});
