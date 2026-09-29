import { SHARE_PATH } from '../../src/features/share/shareLink';
import { toLedgerDate } from '../../src/shared/lib/format';
import { ManageScreen } from '../screens/ManageScreen';
import { PrepApi } from '../support/api';
import { logsNamed, pressSystemBack, readShares } from '../support/aitMock';
import { expect, test as base } from '../support/fixtures';

/**
 * 같이 쓰는 가계부의 입구와 관리: 만들기, 초대, 합류, 설정, 정산.
 *
 * 이 자리가 지키는 것.
 * - **만들기는 결정 둘, 화면 하나.** 유형 카드를 누르면 같은 화면 안에서 다음 단계이고
 *   「만들고 초대하기」 한 번에 공유창까지 간다. 보내는 글에 금액이 없다.
 * - **초대받은 사람은 처음 안내보다 초대 화면을 먼저 본다.** 들어온 뒤에도 안내가 안 뜬다.
 * - 링크로 막 들어온 사람이 설명 없이 첫 공동 지출을 적고, 만든 사람 화면에 들어온다.
 * - 못 쓰는 링크(닫힘, 다 참, 모르는 코드)는 한 문장과 버튼 하나로 끝난다.
 * - 완료하기와 지우기는 알림에서 되돌린다. 지우기·나가기·내보내기는 한 번 묻는다.
 * - 이 화면들에는 광고가 없다.
 *
 * 배경(다른 사람의 가계부, 합류한 멤버, 기록)은 API 로 심고, 확인하려는 동작은 화면으로 한다.
 */

/** 이 테스트만의 다른 사람들. 익명키가 달라 서버에서 다른 사용자다. 끝나면 닫는다. */
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

/** `12,000원` 같은 금액 표기. 초대 글 어디에도 있으면 안 된다. */
const MONEY = /[\d,]+\s*원/;

/** 초대 링크(`intoss://pocket-ledger/join?c=…`)를 앱 안 경로로. 브라우저는 토스 링크를 못 연다. */
function appPath(deepLink: string): string {
  return deepLink.replace(SHARE_PATH, '');
}

test.describe('초대받은 사람이 처음 여는 앱', () => {
  // 기본 page 가 초대받는 사람이다. 처음 여는 앱이라 안내를 막아 두지 않는다.
  test.use({ showOnboarding: true });

  test('관리 탭에서 만든 연인 가계부에 상대가 안내 없이 들어와 첫 공동 지출을 적는다', async ({
    page,
    partner,
    books,
    home,
    recordSheet,
  }) => {
    test.setTimeout(180_000);
    // 만드는 사람은 두 번째 창이다. 이 사람은 앱을 써 온 사람이라 안내가 이미 닫혀 있다.
    const owner = partner;
    const manage = new ManageScreen(owner.page);

    await test.step('관리 탭에서 들어가 유형 카드 하나, 이름 하나, 버튼 하나로 만든다', async () => {
      await manage.open();
      await manage.waitReady();
      // 입구는 아래 목록이 아니라 맨 위 카드다. 관리 탭을 열자마자 내리지 않고 보인다.
      await expect(manage.booksEntry).toBeInViewport({ ratio: 1 });
      await expect(manage.subScreenRow('같이 쓰는 가계부')).toHaveCount(0);
      await manage.openBooks();
      await owner.books.list.waitReady();
      await expect(owner.books.list.emptyLine).toBeVisible();
      await owner.books.list.createButton.click();

      await expect(owner.books.create.kindTitle).toBeVisible();
      await owner.books.create.kindButton('연인·부부').click();

      // 이름과 돈 나누기는 이미 채워져 있다. 채울 것은 내 이름 하나다.
      // 제목은 유형으로 고정이고, 가계부 이름은 숨기지 않고 맨 위 칸에 채워 둔다.
      await expect(owner.books.create.stepTitle('연인·부부')).toBeVisible();
      await expect(owner.books.create.bookName).toHaveValue('둘이 쓰는 돈');
      await expect(owner.books.create.settleOption('반반')).toHaveAttribute('aria-checked', 'true');
      await expect(owner.books.create.submitButton).toBeDisabled();
      await owner.books.create.myName.fill('은홍');
      await owner.books.create.submitButton.click();
    });

    const [sent] = await test.step('공유창까지 가고, 글에는 금액이 없다', async () => {
      await expect.poll(() => readShares(owner.page)).toHaveLength(1);
      const shares = await readShares(owner.page);
      expect(shares[0].path).toContain('/join?c=');
      expect(shares[0].message).toContain('은홍님이');
      expect(shares[0].message).not.toMatch(MONEY);
      return shares;
    });

    await test.step('공유창에서 돌아오면 그 가계부 홈이다', async () => {
      await expect(owner.books.homeChip('둘이 쓰는 돈')).toBeVisible();
      // 알림은 띄우지 않는다. 카드가 같은 말을 한다.
      await expect(owner.books.toast('초대장을 보냈어요')).toHaveCount(0);
      // 보냈으니 「아직 혼자예요 [초대장 보내기]」 가 아니라 기다리면 된다는 말이 선다.
      await expect(owner.home.book.cards.inviteSent).toContainText(
        '초대장을 보냈어요. 들어오면 여기서 알려 드려요',
      );
      await expect(owner.home.book.cards.resendButton).toBeVisible();
      await expect(owner.home.book.cards.alone).toHaveCount(0);
      // 기록이 없는 달에는 예산부터 묻지 않는다.
      await expect(owner.home.book.heroAmount).toHaveText('0원');
      await expect(owner.home.book.setBudgetButton).toHaveCount(0);
      // 혼자일 때 얼굴이 하나뿐이어도 설정으로 가는 자리는 손가락 하나(44px)만큼 있다.
      const faces = await owner.home.book.faces.boundingBox();
      expect(faces?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(faces?.height ?? 0).toBeGreaterThanOrEqual(44);

      // 만들기는 한 화면이다. 두 단계가 같은 주소 안에서 바뀌고 화면 로그는 한 번만 찍힌다.
      // 첫 화면 로그는 개발 판의 StrictMode 가 두 번 찍어서, 이어진 같은 값은 하나로 센다.
      const screens = (await logsNamed(owner.page, 'screen_view')).map((log) => log.params.screen);
      const visited = screens.filter((screen, index) => screen !== screens[index - 1]);
      expect(visited).toEqual(['관리', '같이 쓰는 가계부', '가계부 만들기', '10초 가계부']);
      const made = await logsNamed(owner.page, 'book_changed');
      expect(made.map((log) => log.params)).toEqual([
        expect.objectContaining({ action: 'created', kind: 'couple' }),
      ]);
      const invited = await logsNamed(owner.page, 'book_invite_result');
      expect(invited.map((log) => [log.params.where, log.params.result])).toEqual([
        ['create', 'ok'],
      ]);
    });

    await test.step('받은 사람은 처음 안내보다 초대 화면을 먼저 본다', async () => {
      await page.goto(appPath(sent.path));
      await expect(books.join.title).toHaveText('은홍님이 「둘이 쓰는 돈」에 초대했어요');
      await expect(books.join.lockLine).toHaveText('내 가계부 기록은 은홍님에게 보이지 않아요');
      await expect(books.onboarding).toHaveCount(0);
      await expect(books.join.joinButton).toBeDisabled();
    });

    await test.step('이름 하나 적고 같이 쓰기를 누르면 공유 홈이다', async () => {
      await books.join.nameInput.fill('준호');
      // 홈으로 넘어가는 그 순간에 「처음 안내를 봤다」 가 이미 적혀 있어야 한다. 넘어간 뒤에
      // 읽으면 안내를 띄운 문지기가 같은 값을 적어 버려 빠진 것을 못 잡는다.
      await page.evaluate(() => {
        const seen: [string, string | null][] = [];
        (window as unknown as { __seenAtNav: typeof seen }).__seenAtNav = seen;
        const replace = history.replaceState.bind(history);
        history.replaceState = (data, unused, url) => {
          seen.push([String(url ?? ''), localStorage.getItem('__ait_storage:onboarding-seen')]);
          replace(data, unused, url);
        };
      });
      await books.join.joinButton.click();
      await expect(books.homeChip('둘이 쓰는 돈')).toBeVisible();
      await expect(books.onboarding).toHaveCount(0);
      const navigations = await page.evaluate(
        () => (window as unknown as { __seenAtNav: [string, string | null][] }).__seenAtNav,
      );
      const toHome = navigations.filter(([url]) => new URL(url, 'http://x').pathname === '/');
      expect(toHome.map(([, seen]) => seen)).toEqual(['1']);

      const joined = await logsNamed(page, 'book_join_result');
      expect(joined.map((log) => log.params)).toEqual([
        expect.objectContaining({
          result: 'joined',
          kind: 'couple',
          members: '2',
          first_open: true,
        }),
      ]);
      // 이름·코드는 로그에 싣지 않는다.
      expect(JSON.stringify(joined)).not.toContain('준호');
      expect(JSON.stringify(joined)).not.toContain(appPath(sent.path).split('c=')[1].split('&')[0]);
    });

    await test.step('처음 한 번 어디에 적을지 고른다는 안내가 뜨고, 알겠어요로 닫힌다', async () => {
      await expect(home.book.cards.intro).toBeVisible();
      await expect(home.book.cards.intro).toContainText(
        '기록할 때 「내 가계부」와 「둘이 쓰는 돈」 중 한 곳을 골라요',
      );
      await home.book.cards.introOkButton.click();
      await expect(home.book.cards.intro).toHaveCount(0);
    });

    await test.step('기록하기를 누르면 둘이 쓰는 돈이 골라져 있고, 32,000원 장보기를 적는다', async () => {
      await home.recordButton.click();
      await recordSheet.waitOpen();
      await expect(recordSheet.destination.pill('둘이 쓰는 돈')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await recordSheet.input.enterAmount(32_000);
      await recordSheet.input.pickCategory('장보기');

      await expect(recordSheet.bookFeedback.savedLabel('둘이 쓰는 돈')).toBeVisible();
      await expect(recordSheet.bookFeedback.card).toContainText('은홍도 바로 볼 수 있어요');
      await expect(recordSheet.bookFeedback.payer('준호')).toHaveAttribute('aria-pressed', 'true');
      await recordSheet.bookFeedback.confirmButton.click();
      await recordSheet.waitClosed();
      await expect(home.book.recent.row('장보기')).toContainText('준호');
    });

    await test.step('만든 사람 화면에 새로 고침 없이 들어온다', async () => {
      // 다시 읽는 주기가 30초다. 한 번 놓쳐도 다음 번에 들어와야 한다.
      await expect
        .poll(() => owner.home.book.recent.row('장보기').count(), { timeout: 40_000 })
        .toBe(1);
      await expect(owner.home.book.recent.row('장보기')).toContainText('준호');
      await expect(owner.home.book.recent.row('장보기')).toContainText('32,000원');
    });

    await test.step('다시 열면 공유 홈에서 시작하고, 안내들은 다시 안 뜬다', async () => {
      await page.reload();
      await home.waitReady();
      // 준호는 내 가계부에 적은 것이 없다. 보던 둘이 쓰는 돈에서 바로 시작해야 다음 기록도 둘이 쓰는 돈에 간다.
      await expect(home.book.chip).toHaveAccessibleName('보는 가계부 둘이 쓰는 돈');
      await expect(home.book.recent.row('장보기')).toBeVisible();
      await expect(home.book.cards.intro).toHaveCount(0);
      await expect(books.onboarding).toHaveCount(0);
    });
  });
});

test('가계부 이름은 채워진 채 맨 위에 서고, 처음 누르면 통째로 골라져 바로 덮어 쓴다', async ({
  books,
  page,
}) => {
  await books.openNew();
  await books.create.kindButton('여행·모임').click();

  await expect(books.create.stepTitle('여행·모임')).toBeVisible();
  await expect(books.create.bookName).toHaveValue('여행 경비');
  // 칸 순서는 가계부 이름, 내 이름, 돈 나누기다.
  const nameTop = (await books.create.bookName.boundingBox())?.y ?? 0;
  const myNameTop = (await books.create.myName.boundingBox())?.y ?? 0;
  const ruleTop = (await books.create.settleOption('똑같이 나눠요').boundingBox())?.y ?? 0;
  expect(nameTop).toBeLessThan(myNameTop);
  expect(myNameTop).toBeLessThan(ruleTop);

  await books.create.bookName.click();
  await page.keyboard.type('제주 여행');
  await expect(books.create.bookName).toHaveValue('제주 여행');
  // 제목은 칸에 적는 대로 흔들리지 않는다.
  await expect(books.create.stepTitle('여행·모임')).toBeVisible();

  // 두 번째로 누르면 커서만 선다. 고치려던 글자를 통째로 날리지 않는다.
  await books.create.myName.click();
  await books.create.bookName.click();
  await page.keyboard.type('도');
  expect(await books.create.bookName.inputValue()).toHaveLength('제주 여행도'.length);

  // 비우고 만들면 기본 이름으로 만든다.
  await books.create.bookName.fill('');
  await books.create.myName.fill('은홍');
  await books.create.submitButton.click();
  await expect(books.homeChip('여행 경비')).toBeVisible();
});

test.describe('못 쓰는 초대 링크', () => {
  // 모르는 코드와 닫힌 링크는 서버가 404·409 로 답한다. 브라우저가 그것을 콘솔에 적는다.
  test.use({ consoleErrorAllowList: [/Failed to load resource[\s\S]*(404|409)/] });

  test('연인 가계부 링크는 한 사람이 들어오면 닫힌다', async ({ books, people, page }) => {
    const owner = await people('owner');
    const bookId = await owner.createBook({ kind: 'couple', myName: '은홍' });
    const code = await owner.bookInviteCode(bookId);
    await (await people('first')).joinBook(code, '준호');

    await books.openJoin(code);
    await expect(books.join.title).toHaveText('열 수 없는 초대 링크예요');
    await expect(books.join.message('초대한 사람에게 새 링크를 부탁해 주세요')).toBeVisible();
    await expect(books.join.joinButton).toHaveCount(0);

    await books.join.openMineButton.click();
    await expect(page).toHaveURL(/\/$/);
    const logs = await logsNamed(page, 'book_join_result');
    expect(logs.map((log) => log.params.result)).toEqual(['closed']);
  });

  test('모르는 코드는 같은 한 문장이다', async ({ books, page }) => {
    await books.openJoin('AAAAAAAAAAAA');
    await expect(books.join.title).toHaveText('열 수 없는 초대 링크예요');
    await expect(books.join.openMineButton).toBeVisible();
    const logs = await logsNamed(page, 'book_join_result');
    expect(logs.map((log) => log.params.result)).toEqual(['invalid']);
  });

  test('10명이 찬 가계부는 다 찼다고 말한다', async ({ books, people, page }) => {
    const owner = await people('owner');
    const bookId = await owner.createBook({
      kind: 'family',
      name: '우리 가족',
      settleRule: 'none',
      myName: '엄마',
    });
    const code = await owner.bookInviteCode(bookId);
    for (let index = 1; index <= 9; index += 1) {
      await (await people(`m${index}`)).joinBook(code, `식구${index}`);
    }
    expect((await owner.book(bookId)).active_member_count).toBe(10);

    await books.openJoin(code);
    await expect(books.join.title).toHaveText('이 가계부는 10명이 다 찼어요');
    await expect(books.join.message('관리자에게 한 자리를 비워 달라고 해 주세요')).toBeVisible();
    await expect(books.join.openMineButton).toBeVisible();
    const logs = await logsNamed(page, 'book_join_result');
    expect(logs.map((log) => log.params)).toEqual([
      expect.objectContaining({ result: 'full', kind: 'family', members: '6-10' }),
    ]);
  });

  test('내가 보낸 링크를 열면 그 가계부 홈으로 간다', async ({ books, home, prep }) => {
    const bookId = await prep.createBook({ myName: '은홍' });
    const code = await prep.bookInviteCode(bookId);

    await books.openJoin(code);
    await expect(books.homeChip('둘이 쓰는 돈')).toBeVisible();
    await expect(books.toast('내가 보낸 초대장이에요')).toBeVisible();
    // 이 기기에서 초대장을 보낸 적이 없으니 아직 혼자라고 하고 보내기를 크게 세운다.
    await expect(home.book.cards.alone).toBeVisible();
    await expect(home.book.cards.aloneInviteButton).toBeVisible();
    await expect(home.book.cards.inviteSent).toHaveCount(0);
  });
});

test('정산은 PRD 숫자대로 한 문장이고, 끝내고 되돌릴 수 있다', async ({
  books,
  page,
  people,
  prep,
}) => {
  const bookId = await prep.createBook({ myName: '은홍' });
  const junho = await people('junho');
  await junho.joinBook(await prep.bookInviteCode(bookId), '준호');
  const today = toLedgerDate(new Date());
  // 은홍 304,900, 준호 279,900. 합계 584,800 이라 한 사람 몫은 292,400 이다.
  await prep.addBookEntry(bookId, { amount: 304_900, category: '장보기', on: today });
  await junho.addBookEntry(bookId, { amount: 279_900, category: '외식·배달', on: today });

  await books.openSettle(bookId);
  await books.settle.waitReady();
  await expect(books.settle.heading).toHaveText('둘이 쓰는 돈 정산');
  // 창 제목에는 가계부 이름을 싣지 않는다.
  await expect(page).toHaveTitle('정산');
  await expect(books.settle.line('준호가 은홍에게 12,500원 보내면 반반이에요')).toBeVisible();
  // 이름과 금액을 같은 줄에서 본다. 따로 찾으면 두 사람의 금액이 뒤바뀌어도 통과한다.
  await expect(books.settle.paidRow('낸 돈')).toHaveCount(2);
  await expect(books.settle.paidRow('은홍이 낸 돈')).toContainText('304,900원');
  await expect(books.settle.paidRow('준호가 낸 돈')).toContainText('279,900원');

  const month = `${Number(today.slice(5, 7))}월`;
  await books.settle.doneButton.click();
  // 끝냈으면 제목이 끝냈다는 말이다. 보내면 반반이라는 문장은 흐린 「계산한 금액」 으로 내려간다.
  await expect(books.settle.resultLine(`${month} 정산을 끝냈어요`)).toBeVisible();
  await expect(books.settle.resultLine('계산한 금액: 준호 → 은홍 12,500원')).toBeVisible();
  await expect(books.settle.resultLine('준호가 은홍에게 12,500원 보내면 반반이에요')).toHaveCount(
    0,
  );
  await expect(books.settle.doneLine).toHaveText(/^은홍이 .+에 끝냈어요$/);
  // 제목이 같은 말을 하므로 알림은 없다.
  await expect(books.toast(`${month} 정산을 끝냈어요`)).toHaveCount(0);
  await expect(books.settle.doneButton).toHaveCount(0);

  await books.settle.undoButton.click();
  await expect(books.settle.doneButton).toBeVisible();
  await expect(books.settle.resultLine(`${month} 정산을 끝냈어요`)).toHaveCount(0);
  await expect(books.settle.resultLine('준호가 은홍에게 12,500원 보내면 반반이에요')).toBeVisible();

  const logs = await logsNamed(page, 'settle_changed');
  expect(logs.map((log) => [log.params.action, log.params.rule, log.params.members])).toEqual([
    ['done', 'even', '2'],
    ['undone', 'even', '2'],
  ]);

  await test.step('끝낸 뒤 기록이 늘면 바뀌었다고 알리고 다시 끝내기를 세운다', async () => {
    await books.settle.doneButton.click();
    await expect(books.settle.resultLine(`${month} 정산을 끝냈어요`)).toBeVisible();
    // 은홍이 1,000원을 더 내면 몫이 292,900 이 되어 준호가 보낼 돈이 13,000원이다.
    await prep.addBookEntry(bookId, { amount: 1_000, category: '장보기', on: today });
    await page.reload();
    await books.settle.waitReady();
    await expect(books.settle.line('끝낸 뒤 바뀐 기록이 있어요')).toBeVisible();
    await expect(books.settle.line('준호가 은홍에게 13,000원 보내면 반반이에요')).toBeVisible();
    await expect(books.settle.redoButton).toBeVisible();
    await expect(books.settle.resultLine(`${month} 정산을 끝냈어요`)).toHaveCount(0);
  });
});

test('관리자가 바꾼 이름이 상대의 가계부 고르기 창에 보인다', async ({ books, partner, prep }) => {
  const bookId = await prep.createBook({ myName: '은홍' });
  await partner.prep.joinBook(await prep.bookInviteCode(bookId), '준호');

  await books.openSettings(bookId);
  await books.settings.waitReady();
  await books.settings.owner.renameButton.click();
  await books.settings.owner.renameInput.fill('우리 둘');
  await books.settings.owner.renameSaveButton.click();
  await expect(books.toast('이름을 바꿨어요')).toBeVisible();
  await expect(books.settings.openBookButton('우리 둘')).toBeVisible();

  await partner.home.open();
  await partner.books.homeChip('내 가계부').click();
  await expect(partner.books.pickerRow('우리 둘')).toBeVisible();
  await expect(partner.books.pickerRow('둘이 쓰는 돈')).toHaveCount(0);

  await test.step('연인 가계부에 둘이 다 차면 초대장 버튼 없이 「멤버 2명」 이다', async () => {
    await expect(books.settings.membersLabel).toHaveText('멤버 2명');
    await expect(books.settings.inviteButton).toHaveCount(0);
  });

  await test.step('홈의 멤버 얼굴로 연 설정에는 「우리 둘 열기」 가 없다', async () => {
    await partner.books.pickerRow('우리 둘').click();
    await expect(partner.books.homeChip('우리 둘')).toBeVisible();
    await partner.home.book.faces.click();
    await partner.books.settings.waitReady();
    await expect(partner.page).toHaveURL(/from=home/);
    await expect(partner.books.settings.leaveButton).toBeVisible();
    await expect(partner.books.settings.openBookButton('우리 둘')).toHaveCount(0);
  });
});

test('가계부 완료하기는 묻지 않고, 알림의 되돌리기가 다시 연다', async ({
  books,
  home,
  page,
  prep,
}) => {
  const bookId = await prep.createBook({ myName: '은홍' });

  await books.openSettings(bookId);
  await books.settings.waitReady();
  await books.settings.owner.endButton.click();
  await expect(books.confirm).toHaveCount(0);
  await expect(books.settings.owner.reopenButton).toBeVisible();

  await books.toastAction('가계부를 완료했어요').click();
  await expect(books.settings.owner.endButton).toBeVisible();
  expect((await prep.book(bookId)).ended).toBe(false);

  const logs = await logsNamed(page, 'book_changed');
  expect(logs.map((log) => log.params.action)).toEqual(['ended', 'reopened']);

  await test.step('완료한 가계부 홈에는 기록하기 대신 완료했다는 줄이 선다', async () => {
    await prep.setBookEnded(bookId, true);
    await home.open();
    await home.waitReady();
    await home.book.switchTo('둘이 쓰는 돈');
    await expect(home.book.endedLine).toBeVisible();
    await expect(home.recordButton).toHaveCount(0);
  });

  await test.step('다시 열면 기록하기가 돌아온다', async () => {
    await prep.setBookEnded(bookId, false);
    await page.reload();
    await home.waitReady();
    await home.book.switchTo('둘이 쓰는 돈');
    await expect(home.recordButton).toBeVisible();
    await expect(home.book.endedLine).toHaveCount(0);
  });
});

test('지우기는 한 번 묻고, 알림의 되돌리기가 되살려 그 가계부를 연다', async ({
  books,
  page,
  prep,
}) => {
  const bookId = await prep.createBook({ myName: '은홍' });

  await books.openSettings(bookId);
  await books.settings.waitReady();
  await books.settings.owner.deleteButton.click();
  await expect(books.confirm).toContainText('둘이 쓰는 돈을 지울까요?');

  // 시스템 뒤로가기는 확인 창만 닫는다. 설정 화면은 그대로다.
  await pressSystemBack(page);
  await expect(books.confirm).toHaveCount(0);
  await expect(books.settings.heading).toBeVisible();
  await books.settings.owner.deleteButton.click();
  await expect(books.confirm).toContainText('둘이 쓰는 돈을 지울까요?');

  // 머무는 쪽이 기본이다. 먼저 그대로 두기를 눌러도 아무 일도 없다.
  await books.confirmButton('그대로 두기').click();
  await expect(books.confirm).toHaveCount(0);
  expect(await prep.books()).toHaveLength(1);

  await books.settings.owner.deleteButton.click();
  await books.confirmButton('지우기').click();
  await books.list.waitReady();
  expect(await prep.books()).toHaveLength(0);

  await books.toastAction('가계부를 지웠어요').click();
  await expect(books.homeChip('둘이 쓰는 돈')).toBeVisible();
  expect(await prep.books()).toHaveLength(1);

  const logs = await logsNamed(page, 'book_changed');
  expect(logs.map((log) => log.params.action)).toEqual(['deleted', 'restored']);
});

test('멤버는 한 번 묻고 나간다. 내 가계부는 그대로다', async ({ partner, prep }) => {
  const bookId = await prep.createBook({ myName: '은홍' });
  await partner.prep.joinBook(await prep.bookInviteCode(bookId), '준호');

  await partner.books.openSettings(bookId);
  await partner.books.settings.waitReady();
  // 관리자만 보는 줄은 멤버에게 없다.
  await expect(partner.books.settings.owner.deleteButton).toHaveCount(0);
  await expect(partner.books.settings.owner.renameButton).toHaveCount(0);

  await partner.books.settings.leaveButton.click();
  await expect(partner.books.confirm).toContainText('내가 적은 기록은 둘이 쓰는 돈에 남아요');
  await partner.books.confirmButton('나가기').click();

  await expect(partner.books.toast('둘이 쓰는 돈에서 나왔어요')).toBeVisible();
  expect(await partner.prep.books()).toHaveLength(0);
  expect((await prep.book(bookId)).active_member_count).toBe(1);
  const logs = await logsNamed(partner.page, 'book_member_changed');
  expect(logs.map((log) => [log.params.action, log.params.role])).toEqual([['left', 'member']]);
});

test('관리자는 한 번 묻고 멤버를 내보낸다', async ({ books, page, people, prep }) => {
  const bookId = await prep.createBook({ myName: '은홍' });
  await (await people('junho')).joinBook(await prep.bookInviteCode(bookId), '준호');

  await books.openSettings(bookId);
  await books.settings.waitReady();
  await expect(books.settings.member('준호')).toBeVisible();
  // 내 줄은 누를 수 없다. 나를 내보낼 수는 없다.
  await expect(books.settings.memberButton('은홍')).toHaveCount(0);

  await books.settings.memberButton('준호').click();
  await books.settings.kickButton('준호').click();
  await expect(books.confirm).toContainText('준호님을 내보낼까요?');
  await books.confirmButton('내보내기').click();

  await expect(books.settings.member('준호')).toHaveCount(0);
  expect((await prep.book(bookId)).active_member_count).toBe(1);
  const logs = await logsNamed(page, 'book_member_changed');
  expect(logs.map((log) => [log.params.action, log.params.role])).toEqual([['removed', 'member']]);
});

test('광고 없이 쓰기에 원해요를 누르면 수요로 남고 줄이 신청함이 된다', async ({
  books,
  page,
  prep,
}) => {
  const bookId = await prep.createBook({ myName: '은홍' });

  await books.openSettings(bookId);
  await books.settings.waitReady();
  await expect(books.settings.plusRow).toContainText('준비 중');
  await books.settings.plusRow.click();
  await books.settings.plusWantButton.click();
  await expect(books.settings.plusSheet).toContainText('알려 주셔서 고마워요');
  await books.settings.plusCloseButton.click();
  await expect(books.settings.plusRow).toContainText('신청함');

  const logs = await logsNamed(page, 'plus_interest');
  expect(logs.map((log) => [log.params.where, log.params.result, log.params.members])).toEqual([
    ['book_settings', 'open', '1'],
    ['book_settings', 'want', '1'],
  ]);
});

test('만들기·목록·설정·정산·초대 화면에는 광고가 없다', async ({ books, people, prep }) => {
  const bookId = await prep.createBook({ myName: '은홍' });
  const other = await people('other');
  const otherBook = await other.createBook({ kind: 'room', name: '우리 방', myName: '서연' });
  const code = await other.bookInviteCode(otherBook);

  const screens: [string, () => Promise<void>, () => Promise<void>][] = [
    ['목록', () => books.openList(), () => books.list.waitReady()],
    ['만들기', () => books.openNew(), () => expect(books.create.kindTitle).toBeVisible()],
    ['설정', () => books.openSettings(bookId), () => books.settings.waitReady()],
    [
      '정산',
      () => books.openSettle(bookId),
      () =>
        expect(books.settle.doneButton.or(books.settle.line('같이 쓴 돈')).first()).toBeVisible(),
    ],
    ['초대', () => books.openJoin(code), () => expect(books.join.joinButton).toBeVisible()],
  ];
  for (const [name, open, ready] of screens) {
    await test.step(name, async () => {
      await open();
      await ready();
      await expect(books.adSlot).toHaveCount(0);
      await expect(books.adConsent).toHaveCount(0);
    });
  }
});
