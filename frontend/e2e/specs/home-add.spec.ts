import { expect, test } from '../support/fixtures';

/**
 * 홈 화면에 추가하도록 이끄는 자리.
 *
 * 우리가 대신 눌러 줄 수 없는 일이라, 이 기능이 하는 것은 안내뿐이다.
 * 그래서 확인할 것도 셋이다: 첫 기록 전에는 조르지 않는다, 첫 기록 뒤에 한 번만 뜬다,
 * 그 한 번을 놓친 사람이 앱 설정에서 같은 안내를 다시 연다.
 */

test('첫 기록 전에는 홈 화면에 추가하라고 조르지 않는다', async ({ home }) => {
  await home.open();
  await home.waitReady();

  // 써 보지도 않은 앱을 홈 화면에 놓으라는 말은 광고로 읽힌다.
  await expect(home.addToHome.card).toHaveCount(0);
});

test('첫 기록을 마치면 한 번 뜨고, 어느 버튼을 눌러도 다시 뜨지 않는다', async ({
  home,
  page,
  prep,
}) => {
  await prep.addTransaction({ amount: 12000 });

  await home.open();
  await home.waitReady();
  await expect(home.addToHome.card).toBeVisible();

  await test.step('안내는 토스 메뉴 이름을 그대로 적은 세 단계다', async () => {
    await home.addToHome.guideButton.click();
    await expect(home.addToHome.sheet).toBeVisible();
    await expect(home.addToHome.steps).toHaveCount(3);
    // 우리 화면 어디에도 없는 버튼이라, 화면에 적힌 이름 그대로 적어야 찾을 수 있다.
    await expect(home.addToHome.sheet).toContainText('휴대폰 홈 화면에 추가');
    await page.keyboard.press('Escape');
    await expect(home.addToHome.sheet).toHaveCount(0);
  });

  await test.step('다시 열어도 카드가 없다', async () => {
    await page.reload();
    await home.waitReady();
    await expect(home.addToHome.card).toHaveCount(0);
  });
});

test('다음에를 누르면 그 자리에서 사라지고 돌아오지 않는다', async ({ home, page, prep }) => {
  await prep.addTransaction({ amount: 12000 });

  await home.open();
  await home.waitReady();
  await home.addToHome.laterButton.click();
  await expect(home.addToHome.card).toHaveCount(0);

  await page.reload();
  await home.waitReady();
  await expect(home.addToHome.card).toHaveCount(0);
});

test('한 번을 놓쳐도 앱 설정에서 같은 안내를 연다', async ({ page, settings }) => {
  await settings.open();
  await settings.waitReady();

  await settings.addToHomeRow.click();
  await expect(settings.addToHomeSheet).toBeVisible();
  await expect(settings.addToHomeSheet).toContainText('휴대폰 홈 화면에 추가');

  await page.keyboard.press('Escape');
  await expect(settings.addToHomeSheet).toHaveCount(0);
});
