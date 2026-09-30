import { expect, test } from '../support/fixtures';

/*
  권유 카드를 닫아 두지 않은 채로 연다. 같이 쓰는 가계부 안내는 그 카드들보다 앞에 선다.
*/
test.use({ showStarterCards: true });

/**
 * 같이 쓰는 가계부가 생겼다는 홈 안내.
 *
 * 입구는 관리 탭 맨 위지만, 원래 쓰던 사람은 관리 탭을 새로 열어 보지 않는다.
 * 기록하러 온 홈에서 한 번 알리고 버튼 하나로 만들기까지 보낸다.
 *
 * 확인할 것: 한 번이라도 적은 사람에게 선다, **홈의 안내는 그것 하나다**, 버튼이 만들기
 * 화면을 연다, 닫으면 다시 안 뜨고 그날은 다른 권유도 쉰다, 가계부가 있으면 안 뜬다.
 */

test('첫 기록 전에는 안 뜬다', async ({ home }) => {
  await home.open();
  await home.waitReady();

  // 아직 혼자 쓰는 법도 모르는 사람이다. 첫 안내에 한 장으로 있는 줄은 이미 알렸다.
  await expect(home.booksIntro.card).toHaveCount(0);
});

test('적어 본 사람에게 서고, 홈의 안내는 이것 하나다', async ({ home, prep }) => {
  await prep.addTransaction({ amount: 12000 });
  await home.open();
  await home.waitReady();

  await expect(home.booksIntro.card).toBeVisible();
  await expect(home.booksIntro.card).toContainText('같이 쓰는 가계부가 생겼어요');
  await expect(home.booksIntro.closeButton).toBeVisible();

  // 앱 안에서 한 번에 하나의 안내만 선다(사용자 지시).
  await expect(home.addToHome.card).toHaveCount(0);
  await expect(home.remind.card).toHaveCount(0);
  await expect(home.budget.suggestCard).toHaveCount(0);
});

test('버튼을 누르면 만들기 화면이 바로 열리고, 돌아와도 다시 안 뜬다', async ({
  books,
  home,
  prep,
}) => {
  await prep.addTransaction({ amount: 12000 });
  await home.open();
  await home.waitReady();

  await home.booksIntro.createButton.click();
  await expect(books.create.kindTitle).toBeVisible();

  // 만들기 화면은 탭 막대가 없는 전체 화면이다. 홈으로 다시 연다.
  await home.open();
  await home.waitReady();
  // 만들기를 열어 봤으면 안내는 할 일을 다 했다. 입구는 관리 탭에 늘 있다.
  await expect(home.booksIntro.card).toHaveCount(0);
});

test('닫으면 다시 안 뜨고, 그날은 다른 권유도 쉰다', async ({ home, page, prep }) => {
  await prep.addTransaction({ amount: 12000 });
  await home.open();
  await home.waitReady();

  await home.booksIntro.closeButton.click();
  await expect(home.booksIntro.card).toHaveCount(0);
  // 닫자마자 홈 추가가 그 자리에 올라오면 닫은 손을 「다음 것」 으로 읽은 셈이다.
  await expect(home.addToHome.card).toHaveCount(0);

  await page.reload();
  await home.waitReady();
  await expect(home.booksIntro.card).toHaveCount(0);
  await expect(home.addToHome.card).toHaveCount(0);

  await test.step('다음 날에는 다음 권유가 선다', async () => {
    await home.passQuietDay();
    await expect(home.booksIntro.card).toHaveCount(0);
    await expect(home.addToHome.card).toBeVisible();
  });
});

test('같이 쓰는 가계부가 이미 있으면 안 뜬다', async ({ home, prep }) => {
  await prep.addTransaction({ amount: 12000 });
  await prep.createBook();

  await home.open();
  await home.waitReady();

  await expect(home.booksIntro.card).toHaveCount(0);
  // 안내 자리를 비워 두지 않는다. 다음 권유가 선다.
  await expect(home.addToHome.card).toBeVisible();
});
