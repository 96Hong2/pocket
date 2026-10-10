import { formatCurrency, shiftDay, toLedgerDate } from '../../src/shared/lib/format';
import { periodContaining } from '../../src/shared/lib/monthPeriod';
import { PrepApi } from '../support/api';
import { logsNamed, pressSystemBack } from '../support/aitMock';
import { expect, test as base } from '../support/fixtures';
import { shotBothWidths } from '../support/shots';

/**
 * 공유 가계부의 시작일, 회비(각자 입금·나중에 정산과 비율), 입금, 멤버 상태와 멤버 내역.
 *
 * 이 자리가 지키는 것.
 * - 설정의 「시작일」 을 25일로 바꾸면 홈의 달 이름과 숫자, 정산의 기간이 그 날로 끊긴다.
 * - 「회비」 시트에서 방식을 고르고 비율을 10% 단위로 정한다. 둘이면 한쪽을 움직이면 다른 쪽이
 *   따라오고, 셋 이상이면 합이 100% 가 아닐 때 저장을 막는다. 비율로 나눈 정산은 「보내면 돼요」 다.
 * - 각자 입금 가계부는 홈에서 입금을 적고, 이번 기간에 넣은 사람 줄에 「입금완료」 가 선다.
 *   나중에 정산 가계부는 정산을 끝내면 「정산완료」 다. 아직인 사람에게는 아무것도 안 붙는다.
 * - 멤버 줄을 누구나 눌러 그 사람의 지난 지출과 입금을 본다. 관리자만 그 안에서 내보낸다.
 *
 * 배경은 API 로 심고, 확인하려는 동작은 화면으로 한다.
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

// 사람 둘의 화면을 오가고 두 폭 사진까지 찍는 테스트가 많다. 기본 30초로는 모자라다.
test.describe.configure({ timeout: 120_000 });

/** 25일에 시작하는 기간의 이름 달. 25일부터는 다음 달 이름이다. 화면 코드와 따로 센다. */
function nameMonthFrom25(today: string): number {
  const month = Number(today.slice(5, 7));
  return Number(today.slice(8, 10)) >= 25 ? (month % 12) + 1 : month;
}

test('시작일을 25일로 바꾸면 홈의 달 이름과 숫자, 정산 기간이 25일로 끊긴다', async ({
  books,
  home,
  page,
  people,
  prep,
}) => {
  const bookId = await prep.createBook({ name: '우리 집', myName: '은홍' });
  await (await people('junho')).joinBook(await prep.bookInviteCode(bookId), '준호');
  const today = toLedgerDate(new Date());
  const name = nameMonthFrom25(today);
  const day = Number(today.slice(8, 10));
  /*
    시작일 1 과 25 가 다른 답을 내는 날 하나를 심는다.
    오늘이 25일 전이면 전달 25일(새 기간에 든다, 달력 월에는 안 든다),
    25일부터면 이번 달 24일(새 기간에는 안 든다, 달력 월에는 든다).
  */
  const edge = day < 25 ? periodContaining(today, 25).start : `${today.slice(0, 8)}24`;
  const edgeCounts = day < 25;
  await prep.addBookEntry(bookId, { amount: 10_000, category: '장보기', on: today });
  await prep.addBookEntry(bookId, { amount: 7_000, category: '외식·배달', on: edge });

  await books.openSettings(bookId);
  await books.settings.waitReady();
  await expect(books.settings.startDayRow).toContainText('매달 1일');
  await books.settings.startDayRow.click();
  await books.settings.startDay.waitOpen();
  await books.settings.startDay.day(25).click();
  await expect(books.settings.startDay.preview).toHaveText(
    new RegExp(`^${name}월은 \\d+월 25일부터 \\d+월 24일까지예요$`),
  );
  await shotBothWidths(page, 'book_start_day_sheet');
  await books.settings.startDay.saveButton.click();
  await books.settings.startDay.waitClosed();
  await expect(books.toast('바꿨어요')).toBeVisible();
  await expect(books.settings.startDayRow).toContainText('매달 25일');
  expect((await prep.book(bookId)).month_start_day).toBe(25);
  // 로그는 화면을 옮기기 전에 읽는다. 주소를 다시 열면 목이 모은 로그가 비워진다.
  const logs = await logsNamed(page, 'book_changed');
  expect(logs.map((log) => [log.params.action, log.params.day, log.params.from_day])).toEqual([
    ['start_day_changed', 25, 1],
  ]);

  await home.open();
  await home.waitReady();
  await home.book.switchTo('우리 집');
  await expect(page.getByText(`${name}월에 쓴 돈`, { exact: true })).toBeVisible();
  await expect(home.book.heroAmount).toHaveText(formatCurrency(edgeCounts ? 17_000 : 10_000));

  await books.openSettle(bookId);
  await books.settle.waitReady();
  await expect(books.settle.line(`같이 쓴 돈 ${formatCurrency(edgeCounts ? 17_000 : 10_000)}`)).toBeVisible();
  await books.settle.doneButton.click();
  await expect(books.settle.resultLine(`${name}월 정산을 끝냈어요`)).toBeVisible();
});

test('회비 시트: 두 방식을 오가고, 각자 입금일 때만 한 달 회비 칸이 선다', async ({
  books,
  page,
  people,
  prep,
}) => {
  const bookId = await prep.createBook({ myName: '은홍' });
  await (await people('junho')).joinBook(await prep.bookInviteCode(bookId), '준호');

  await books.openSettings(bookId);
  await books.settings.waitReady();
  await expect(books.settings.duesRow).toContainText('나중에 정산, 똑같이');
  await books.settings.duesRow.click();
  const dues = books.settings.dues;
  await dues.waitOpen();
  await expect(dues.rule('나중에 정산')).toHaveAttribute('aria-checked', 'true');
  await expect(dues.equalButton).toHaveAttribute('aria-pressed', 'true');
  await expect(dues.slider('은홍')).toHaveAttribute('aria-valuetext', '은홍 50%');
  await expect(dues.duesAmount).toHaveCount(0);

  await dues.rule('각자 입금').click();
  await expect(dues.duesAmount).toBeVisible();
  await dues.duesAmount.fill('300000');
  await shotBothWidths(page, 'book_dues_sheet_none');
  await dues.rule('나중에 정산').click();
  await expect(dues.duesAmount).toHaveCount(0);
  await dues.rule('각자 입금').click();
  await dues.saveButton.click();
  await dues.waitClosed();
  await expect(books.toast('바꿨어요')).toBeVisible();
  await expect(books.settings.duesRow).toContainText('각자 입금, 똑같이');
  const saved = await prep.book(bookId);
  expect(saved.settle_rule).toBe('none');
  expect(Number(saved.dues_amount)).toBe(300_000);
  expect(saved.share_percents).toBeNull();
});

test('둘이면 한쪽 막대를 60% 로 옮기면 상대가 40% 로 따라오고, 정산은 「보내면 돼요」 다', async ({
  books,
  home,
  page,
  people,
  prep,
}) => {
  const bookId = await prep.createBook({ name: '우리 집', myName: '은홍' });
  await (await people('junho')).joinBook(await prep.bookInviteCode(bookId), '준호');
  // 은홍이 100,000 을 다 냈다. 6:4 면 준호 몫이 40,000 이다.
  await prep.addBookEntry(bookId, { amount: 100_000, category: '장보기' });

  await books.openSettings(bookId);
  await books.settings.waitReady();
  await books.settings.duesRow.click();
  const dues = books.settings.dues;
  await dues.waitOpen();
  await dues.setPercent('은홍', 60);
  await expect(dues.slider('준호')).toHaveValue('40');
  await expect(dues.slider('준호')).toHaveAttribute('aria-valuetext', '준호 40%');
  await expect(dues.equalButton).toHaveAttribute('aria-pressed', 'false');
  await expect(dues.sumNotice).toHaveCount(0);
  // 키보드로도 10% 씩 움직인다.
  await dues.slider('준호').focus();
  await page.keyboard.press('ArrowRight');
  await expect(dues.slider('은홍')).toHaveValue('50');
  await page.keyboard.press('ArrowLeft');
  await expect(dues.slider('은홍')).toHaveValue('60');
  await shotBothWidths(page, 'book_dues_sheet_ratio');
  await dues.saveButton.click();
  await dues.waitClosed();
  await expect(books.settings.duesRow).toContainText('나중에 정산, 6:4');
  const logs = await logsNamed(page, 'book_changed');
  expect(logs.map((log) => [log.params.action, log.params.ratio, log.params.members])).toEqual([
    ['dues_changed', true, '2'],
  ]);

  await books.openSettle(bookId);
  await books.settle.waitReady();
  await expect(books.settle.line('준호가 은홍에게 40,000원 보내면 돼요')).toBeVisible();
  await expect(books.settle.line(/보내면 반반이에요/)).toHaveCount(0);

  await home.open();
  await home.waitReady();
  await home.book.switchTo('우리 집');
  await expect(home.book.settleCard).toContainText('준호가 은홍에게 40,000원 보내면 돼요');

  await test.step('「똑같이」 로 돌리면 비율이 지워지고 반반 문장으로 돌아온다', async () => {
    await books.openSettings(bookId);
    await books.settings.waitReady();
    await books.settings.duesRow.click();
    await dues.waitOpen();
    await expect(dues.slider('은홍')).toHaveValue('60');
    await dues.equalButton.click();
    await expect(dues.slider('은홍')).toHaveValue('50');
    await dues.saveButton.click();
    await dues.waitClosed();
    await expect(books.settings.duesRow).toContainText('나중에 정산, 똑같이');
    expect((await prep.book(bookId)).share_percents).toBeNull();
    const again = await logsNamed(page, 'book_changed');
    expect(again.map((log) => [log.params.action, log.params.ratio])).toEqual([
      ['dues_changed', false],
    ]);
    await books.openSettle(bookId);
    await expect(books.settle.line('준호가 은홍에게 50,000원 보내면 반반이에요')).toBeVisible();
  });
});

test('셋이면 막대가 따로 움직이고 합이 100% 가 아니면 저장이 막힌다', async ({
  books,
  people,
  prep,
}) => {
  const bookId = await prep.createBook({ kind: 'room', name: '우리 방', myName: '은홍' });
  const code = await prep.bookInviteCode(bookId);
  await (await people('junho')).joinBook(code, '준호');
  await (await people('seoyeon')).joinBook(code, '서연');

  await books.openSettings(bookId);
  await books.settings.waitReady();
  await books.settings.duesRow.click();
  const dues = books.settings.dues;
  await dues.waitOpen();
  await expect(dues.sliders).toHaveCount(3);
  // 똑같이면 셋이 33% 씩이다. 막대 값이 아니라 읽는 값으로 본다.
  await expect(dues.slider('서연')).toHaveAttribute('aria-valuetext', '서연 33%');

  await dues.setPercent('은홍', 50);
  // 나머지는 10 단위로 맞춘 몫 30, 30 에서 시작해 합이 110 이다. 따라오지 않는다.
  await expect(dues.slider('준호')).toHaveValue('30');
  await expect(dues.sumNotice).toHaveText('합이 100%가 되게 맞춰 주세요(지금 110%)');
  await expect(dues.saveButton).toBeDisabled();

  await dues.setPercent('준호', 20);
  await expect(dues.sumNotice).toHaveCount(0);
  await expect(dues.saveButton).toBeEnabled();

  await dues.setPercent('서연', 10);
  await expect(dues.sumNotice).toHaveText('합이 100%가 되게 맞춰 주세요(지금 80%)');
  await dues.equalButton.click();
  await expect(dues.sumNotice).toHaveCount(0);
  await expect(dues.saveButton).toBeEnabled();

  await dues.setPercent('은홍', 50);
  await dues.setPercent('준호', 20);
  await dues.saveButton.click();
  await dues.waitClosed();
  await expect(books.settings.duesRow).toContainText('나중에 정산, 비율');
  const saved = await prep.book(bookId);
  const byName = Object.fromEntries(
    saved.members.map((member) => [member.name, saved.share_percents?.[member.id]]),
  );
  expect(byName).toEqual({ 은홍: 50, 준호: 20, 서연: 30 });
});

test('각자 입금 가계부는 홈에서 입금을 적고, 넣은 사람에게 「입금완료」 가 선다', async ({
  books,
  home,
  page,
  people,
  prep,
}) => {
  const bookId = await prep.createBook({ name: '우리 집', myName: '은홍', settleRule: 'none' });
  await (await people('junho')).joinBook(await prep.bookInviteCode(bookId), '준호');

  await home.open();
  await home.waitReady();
  await home.book.switchTo('우리 집');
  await expect(home.book.heroAmount).toHaveText('0원');
  await home.book.depositButton.click();
  const deposit = home.book.deposit;
  await deposit.waitOpen();
  await expect(deposit.payer('은홍')).toHaveAttribute('aria-pressed', 'true');
  await deposit.amount.fill('300000');
  await deposit.memo.fill('10월 회비');
  await shotBothWidths(page, 'book_deposit_sheet');
  await deposit.saveButton.click();
  await deposit.waitClosed();
  await expect(home.toast.withText('입금을 적었어요')).toBeVisible();
  const logs = await logsNamed(page, 'book_changed');
  expect(logs.map((log) => [log.params.action, log.params.kind])).toEqual([
    ['deposit_added', 'couple'],
  ]);

  const row = home.book.recent.row('10월 회비');
  await expect(row).toContainText('은홍 넣음');
  await expect(row).toContainText('+300,000원');
  // 입금은 쓴 돈이 아니다. 맨 위 숫자는 그대로다.
  await expect(home.book.heroAmount).toHaveText('0원');
  await shotBothWidths(page, 'book_home_deposit_row', row);

  await test.step('입금 줄을 누르면 입금 모양의 기록 고치기가 열린다', async () => {
    await row.click();
    await home.bookEdit.waitOpen();
    await expect(home.bookEdit.depositPayerGroup).toBeVisible();
    await expect(home.bookEdit.payerGroup).toHaveCount(0);
    await expect(home.bookEdit.categoryGroup).toHaveCount(0);
    await expect(home.bookEdit.destination).toHaveCount(0);
    await expect(home.bookEdit.memo).toHaveValue('10월 회비');
    await pressSystemBack(page);
    await home.bookEdit.waitClosed();
  });

  await books.openSettings(bookId);
  await books.settings.waitReady();
  await expect(books.settings.memberChip('은홍', '입금완료')).toBeVisible();
  // 아직 안 넣은 사람에게는 아무것도 안 붙는다.
  await expect(books.settings.member('준호').getByText(/완료$/)).toHaveCount(0);
  await shotBothWidths(page, 'book_settings_members_done');
});

test('나중에 정산 가계부는 정산을 끝내면 멤버 모두에게 「정산완료」 가 선다', async ({
  books,
  people,
  prep,
}) => {
  const bookId = await prep.createBook({ myName: '은홍' });
  const junho = await people('junho');
  await junho.joinBook(await prep.bookInviteCode(bookId), '준호');
  await prep.addBookEntry(bookId, { amount: 30_000, category: '장보기' });
  await junho.addBookEntry(bookId, { amount: 10_000, category: '장보기' });

  await books.openSettings(bookId);
  await books.settings.waitReady();
  await expect(books.settings.member('은홍')).toBeVisible();
  await expect(books.settings.memberChip('은홍', '정산완료')).toHaveCount(0);
  // 각자 입금 가계부가 아니라 입금 적기가 없다.
  await expect(books.settings.memberChip('준호', '입금완료')).toHaveCount(0);

  await books.openSettle(bookId);
  await books.settle.waitReady();
  await books.settle.doneButton.click();
  await expect(books.settle.undoButton).toBeVisible();

  await books.openSettings(bookId);
  await books.settings.waitReady();
  await expect(books.settings.memberChip('은홍', '정산완료')).toBeVisible();
  await expect(books.settings.memberChip('준호', '정산완료')).toBeVisible();
});

test('멤버를 누르면 그 사람의 입금과 지출이 날짜로 묶여 서고, 「더 보기」 로 앞선 날을 잇는다', async ({
  books,
  home,
  page,
  partner,
  prep,
}) => {
  const bookId = await prep.createBook({ name: '우리 집', myName: '은홍', settleRule: 'none' });
  await partner.prep.joinBook(await prep.bookInviteCode(bookId), '준호');
  const today = toLedgerDate(new Date());
  await partner.prep.addBookDeposit(bookId, { amount: 300_000, title: '회비' });
  // 하루에 하나씩 54 날. 첫 쪽(50줄)에 다 안 든다.
  for (let index = 1; index <= 54; index += 1) {
    await partner.prep.addBookEntry(bookId, {
      amount: 1_000,
      category: '장보기',
      title: `장보기 ${index}`,
      on: shiftDay(today, -index),
    });
  }
  // 은홍이 낸 것은 준호 내역에 없다.
  await prep.addBookEntry(bookId, { amount: 9_000, category: '장보기', title: '은홍 장보기' });

  await books.openSettings(bookId);
  await books.settings.waitReady();
  await books.settings.memberButton('준호').click();
  const history = books.settings.history('준호');
  await history.waitOpen();
  await expect(history.total('넣은 돈')).toContainText('300,000원');
  await expect(history.total('낸 돈')).toContainText('54,000원');
  await expect(history.row('회비')).toContainText('준호 넣음');
  await expect(history.row('은홍 장보기')).toHaveCount(0);
  await expect(history.rows).toHaveCount(50);
  await shotBothWidths(page, 'book_member_history');
  await history.moreButton.click();
  await expect(history.rows).toHaveCount(55);
  await expect(history.moreButton).toHaveCount(0);
  await expect(history.row('장보기 54')).toBeVisible();
  // 관리자가 남을 열었으니 맨 아래 내보내기가 있다.
  await expect(history.kickButton).toBeVisible();

  await test.step('줄을 누르면 기록 고치기가 열리고, 뒤로가기는 그것만 닫는다', async () => {
    await history.row('장보기 7').click();
    await home.bookEdit.waitOpen();
    await expect(home.bookEdit.payer('준호')).toHaveAttribute('aria-pressed', 'true');
    await pressSystemBack(page);
    await home.bookEdit.waitClosed();
    await expect(history.dialog).toBeVisible();
    await pressSystemBack(page);
    await history.waitClosed();
  });

  await test.step('멤버도 누구 줄이든 눌러 내역을 보지만 내보내기는 없다', async () => {
    await partner.books.openSettings(bookId);
    await partner.books.settings.waitReady();
    await partner.books.settings.memberButton('은홍').click();
    const theirs = partner.books.settings.history('은홍');
    await theirs.waitOpen();
    await expect(theirs.row('은홍 장보기')).toBeVisible();
    await expect(theirs.kickButton).toHaveCount(0);
  });
});
