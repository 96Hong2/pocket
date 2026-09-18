import { expect, test } from '../support/fixtures';

/*
  다른 테스트는 이 카드를 「이미 닫았다」 로 두고 시작한다(support/fixtures.ts).
  기록으로 시작하는 화면마다 카드가 목록을 아래로 밀어내기 때문이다.
  여기서만 실제 첫 사용자와 같은 상태로 연다.
*/
test.use({ showHomeAddCard: true });

/**
 * 홈 화면에 추가하도록 이끄는 자리.
 *
 * 우리가 대신 눌러 줄 수 없는 일이라, 이 기능이 하는 것은 안내뿐이다.
 *
 * **시트가 스스로 열리던 것을 카드로 바꿨다.** 그 한 번을 놓치면 다시 볼 길이 앱 설정
 * 뿐이었고, 세 번째 기록에 한 번 더 묻는 장치는 기기에 센 횟수에 기대고 있어 실기기에서
 * 안 떴다. 카드는 닫을 때까지 그 자리에 있으니 놓칠 수가 없다.
 *
 * 확인할 것은 다섯이다: 첫 기록 전에는 안 뜬다, **한 번만 적어도 뜬다**, 눌러야 안내가
 * 열린다, 닫으면 다시 안 뜬다, 놓친 사람이 앱 설정에서 다시 연다.
 */

/** 홈에서 키패드로 한 건 적는다. */
async function recordOnce(
  home: { recordButton: { click(): Promise<void> } },
  recordSheet: {
    waitOpen(): Promise<void>;
    input: { enterAmount(v: number): Promise<void>; pickCategory(n: string): Promise<void> };
    feedback: { waitSaved(): Promise<void> };
    closeByEsc(): Promise<void>;
  },
): Promise<void> {
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(12000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.closeByEsc();
}

test('첫 기록 전에는 홈 화면에 추가하라고 조르지 않는다', async ({ home }) => {
  await home.open();
  await home.waitReady();

  // 써 보지도 않은 앱을 홈 화면에 놓으라는 말은 광고로 읽힌다.
  await expect(home.addToHome.card).toHaveCount(0);
});

test('한 번만 적어도 카드가 서고, 눌러야 안내가 열린다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await recordOnce(home, recordSheet);

  await expect(home.addToHome.card).toBeVisible();
  // 카드만으로는 아무것도 안 연다. 스스로 열리는 시트는 방해다.
  await expect(home.addToHome.sheet).toHaveCount(0);

  await home.addToHome.openButton.click();

  await test.step('안내는 토스 메뉴 이름을 그대로 적은 세 단계다', async () => {
    await expect(home.addToHome.steps).toHaveCount(3);
    // 우리 화면 어디에도 없는 버튼이라, 화면에 적힌 이름 그대로 적어야 찾을 수 있다.
    await expect(home.addToHome.sheet).toContainText('휴대폰 홈 화면에 추가');
  });

  await home.addToHome.doneButton.click();
  await expect(home.addToHome.sheet).toHaveCount(0);
  // 안내를 봤다고 카드가 사라지지는 않는다. 사라지는 것은 닫았을 때뿐이다.
  await expect(home.addToHome.card).toBeVisible();
});

test('기록이 이미 있는 채로 열어도 카드가 선다', async ({ home, prep }) => {
  await prep.addTransaction({ amount: 12000 });

  await home.open();
  await home.waitReady();

  /*
    시트일 때는 「없음 → 있음으로 바뀌는 순간」 만 잡았다. 어제 적고 오늘 여는 사람에게
    앱을 열자마자 시트가 뜨면 방해이기 때문이다. 카드는 목록 안에 있어 그 부담이 없고,
    그래서 어제 적은 사람도 이 카드를 볼 수 있다. 놓칠 길을 없애는 것이 이 카드의 목적이다.
  */
  await expect(home.addToHome.card).toBeVisible();
});

test('닫으면 다시 들어와도 뜨지 않는다', async ({ home, page, prep }) => {
  await prep.addTransaction({ amount: 12000 });
  await home.open();
  await home.waitReady();
  await expect(home.addToHome.card).toBeVisible();

  await home.addToHome.closeButton.click();
  await expect(home.addToHome.card).toHaveCount(0);

  await page.reload();
  await home.waitReady();
  await expect(home.addToHome.card).toHaveCount(0);
});

test('카드에서 알림 설정으로 가는 길이 있다', async ({ home, page, prep }) => {
  await prep.addTransaction({ amount: 12000 });
  await home.open();
  await home.waitReady();

  /*
    **알림은 우리가 대신 못 켠다.** 토스 알림 동의를 그 사람이 눌러야 한다.
    그래서 카드는 어디로 가면 되는지와 몇 시에 오는지만 말한다.
  */
  await home.addToHome.notifyLink.click();
  await expect(page).toHaveURL(/\/settings\/notifications$/);
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

/**
 * 예산 제안 카드에는 비켜 주지 않는다.
 *
 * 둘이 같은 성격이 아니다. 예산 카드는 금액을 적어 넣는 **일거리**고, 홈 추가는 두 줄짜리
 * **한 번뿐인 안내**다. 그 자리를 예산에 내주면 예산을 정하지 않는 사람에게는 영영 안 뜬다.
 */
test('예산 제안이 떠 있어도 홈 화면 추가는 함께 선다', async ({ home, prep }) => {
  await prep.addTransaction({ amount: 12000 });

  await home.open();
  await home.waitReady();

  await expect(home.budget.suggestCard).toBeVisible();
  await expect(home.addToHome.card).toBeVisible();
});
