import { expect, test } from '../support/fixtures';

/*
  다른 테스트는 이 카드를 「이미 닫았다」 로 두고 시작한다(support/fixtures.ts).
  기록으로 시작하는 화면마다 카드가 목록을 아래로 밀어내기 때문이다.
  여기서만 실제 첫 사용자와 같은 상태로 연다.
*/
test.use({ showStarterCards: true });

/**
 * 홈 화면에 추가하도록 이끄는 자리.
 *
 * 우리가 대신 눌러 줄 수 없는 일이라, 이 기능이 하는 것은 안내뿐이다.
 *
 * **시트가 스스로 열리던 것을 카드로 바꿨다.** 그 한 번을 놓치면 다시 볼 길이 앱 설정
 * 뿐이었고, 세 번째 기록에 한 번 더 묻는 장치는 기기에 센 횟수에 기대고 있어 실기기에서
 * 안 떴다. 카드는 닫을 때까지 그 자리에 있으니 놓칠 수가 없다.
 *
 * 확인할 것: 첫 기록 전에는 안 뜬다, **한 번만 적어도 뜬다**, 눌러야 안내가 열린다,
 * 닫으면 다시 안 뜬다, 놓친 사람이 앱 설정에서 다시 연다. 그리고 **저녁 알림은 딴 카드**라
 * 따로 닫히고 그 자리에서 바로 켜진다.
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

/**
 * 알림은 **딴 카드**다.
 *
 * 예전에는 홈 추가 카드 안에 줄 하나로 얹혀 있었다. 그러면 홈에 두기는 싫고 알림만
 * 켜고 싶은 사람이 둘을 같이 닫아야 했고, 그 줄은 설정 화면으로 보내기만 해서 거기서
 * 토글을 찾아 켜는 걸음이 더 있었다.
 */
test('저녁 알림은 따로 서고, 닫는 ✕ 도 따로다', async ({ home, prep }) => {
  await prep.addTransaction({ amount: 12000 });
  await home.open();
  await home.waitReady();

  await expect(home.addToHome.card).toBeVisible();
  await expect(home.remind.card).toBeVisible();

  // 알림만 닫는다. 홈 추가는 그대로 남아야 한다.
  await home.remind.closeButton.click();
  await expect(home.remind.card).toHaveCount(0);
  await expect(home.addToHome.card).toBeVisible();
});

test('카드에서 바로 저녁 8시 알림이 켜진다', async ({ home, notifications, prep }) => {
  await prep.addTransaction({ amount: 12000 });
  await home.open();
  await home.waitReady();

  await home.remind.turnOnButton.click();

  // 켠 그 자리에서 답한다. 카드가 말없이 사라지면 눌린 것인지 알 수 없다.
  await expect(home.remind.card).toContainText('저녁 8시에 알려 드릴게요');
  await expect(home.remind.turnOnButton).toHaveCount(0);

  await test.step('알림 설정에도 그대로 켜져 있다', async () => {
    await notifications.open();
    await notifications.waitReady();
    await expect(notifications.toggle).toHaveAttribute('aria-checked', 'true');
    await expect(notifications.timeInput).toHaveValue('20:00');
  });
});

test('이미 켜 둔 사람에게는 알림 카드가 안 뜬다', async ({ home, notifications, prep }) => {
  await prep.addTransaction({ amount: 12000 });

  await notifications.open();
  await notifications.waitReady();
  await notifications.turnOn();

  await home.open();
  await home.waitReady();

  // 켠 사람에게 또 권하면 그건 광고다.
  await expect(home.remind.card).toHaveCount(0);
  await expect(home.addToHome.card).toBeVisible();
});

/**
 * 두 번째 기회.
 *
 * 첫 기록 직후에는 이 앱을 계속 쓸지조차 모르는 상태라, 그때 닫은 것은 「싫다」 가 아니라
 * 「아직 모르겠다」 에 가깝다. 다섯 번을 적은 사람은 계속 쓰기로 한 사람이다.
 * **딱 한 번 더 묻고**, 거기서 또 닫으면 그게 대답이다.
 */
test('닫았어도 다섯 번째 기록에서 한 번 더 뜬다', async ({ home, page, prep }) => {
  await prep.addTransaction({ amount: 12000 });
  await home.open();
  await home.waitReady();

  await home.addToHome.closeButton.click();
  await home.remind.closeButton.click();
  await expect(home.addToHome.card).toHaveCount(0);
  await expect(home.remind.card).toHaveCount(0);

  // 네 건을 더해 다섯 건으로 만든다.
  for (let i = 0; i < 4; i += 1) {
    await prep.addTransaction({ amount: 3000 + i });
  }
  await page.reload();
  await home.waitReady();

  await expect(home.addToHome.card).toBeVisible();
  await expect(home.remind.card).toBeVisible();

  await test.step('여기서 닫으면 그게 대답이다', async () => {
    await home.addToHome.closeButton.click();
    await home.remind.closeButton.click();
    await page.reload();
    await home.waitReady();
    await expect(home.addToHome.card).toHaveCount(0);
    await expect(home.remind.card).toHaveCount(0);
  });
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
 * **스스로 서는 카드는 한 번에 둘까지다.**
 *
 * 셋이 쌓이면 기록 버튼 아래가 권유 전시장이 되고 정작 급한 것이 안 읽힌다. 카드가 셋
 * 쌓인 화면을 직접 찍어 보고 정한 규칙이다.
 *
 * 한 쌍인 홈 추가·저녁 알림이 앞이고 예산 제안이 비켜 준다. **예산 제안은 안 사라지고
 * 기다리기 때문**이다. 예산을 정할 때까지 계속 뜨고, 카드 자체도 관리 탭에서 언제든
 * 정할 수 있다고 적는다. 반대로 한 번뿐인 안내는 그 자리를 내주면 영영 안 뜬다.
 */
test('예산 제안은 한 번뿐인 안내에 비켜 주고, 닫으면 바로 선다', async ({ home, prep }) => {
  await prep.addTransaction({ amount: 12000 });

  await home.open();
  await home.waitReady();

  await expect(home.addToHome.card).toBeVisible();
  await expect(home.remind.card).toBeVisible();
  await expect(home.budget.suggestCard).toHaveCount(0);

  await test.step('둘을 닫으면 예산 제안이 그 자리에 선다', async () => {
    await home.addToHome.closeButton.click();
    await home.remind.closeButton.click();
    await expect(home.budget.suggestCard).toBeVisible();
  });
});

/**
 * 공유 권유도 비켜 준다.
 *
 * 공유는 다섯 번 넘게 적은 사람에게만 뜨고, 그때까지 기다릴 수 있는 유일한 권유다.
 * 두 번째 기회로 다시 선 카드 둘과 겹치면 홈이 권유 전시장이 된다.
 */
test('권유 카드가 셋 쌓이지 않는다', async ({ home, prep }) => {
  for (let i = 0; i < 5; i += 1) {
    await prep.addTransaction({ amount: 3000 + i });
  }

  await home.open();
  await home.waitReady();

  await expect(home.addToHome.card).toBeVisible();
  await expect(home.remind.card).toBeVisible();
  await expect(home.share.card).toHaveCount(0);
  await expect(home.budget.suggestCard).toHaveCount(0);
});
