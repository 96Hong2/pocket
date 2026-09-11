import { expect, test } from '../support/fixtures';

/*
  다른 테스트는 이 안내를 「이미 봤다」 로 두고 시작한다(support/fixtures.ts).
  기록으로 시작하는 화면마다 시트가 다음 조작을 가로막기 때문이다.
  여기서는 그 표시를 지워 실제 첫 사용자와 같은 상태에서 확인한다.
*/
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem('__ait_storage:home-add-prompted');
    } catch {
      /* 저장소를 못 여는 문서에서는 이 앱이 돌지 않는다. */
    }
  });
});

/**
 * 홈 화면에 추가하도록 이끄는 자리.
 *
 * 우리가 대신 눌러 줄 수 없는 일이라, 이 기능이 하는 것은 안내뿐이다.
 * 확인할 것은 넷이다: 첫 기록 전에는 조르지 않는다, **첫 기록을 마친 그 순간** 한 번 뜬다,
 * 기록이 이미 있는 채로 열었을 때는 안 뜬다, 놓친 사람이 앱 설정에서 다시 연다.
 */

/** 홈에서 키패드로 한 건 적는다. 첫 기록 「직후」 를 만드는 유일한 방법이다. */
async function recordOnce(home: {
  recordButton: { click(): Promise<void> };
}, recordSheet: {
  waitOpen(): Promise<void>;
  input: { enterAmount(v: number): Promise<void>; pickCategory(n: string): Promise<void> };
  feedback: { waitSaved(): Promise<void> };
  closeByEsc(): Promise<void>;
}): Promise<void> {
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
  await expect(home.addToHome.sheet).toHaveCount(0);
});

test('첫 기록을 마친 그 순간 스스로 열리고, 닫으면 다시 열리지 않는다', async ({
  home,
  page,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await recordOnce(home, recordSheet);

  // 카드로 두면 목록에 섞여 지나쳐진다. 한 번뿐인 안내라 그 순간 화면 가운데로 나온다.
  await expect(home.addToHome.sheet).toBeVisible();

  await test.step('안내는 토스 메뉴 이름을 그대로 적은 세 단계다', async () => {
    await expect(home.addToHome.steps).toHaveCount(3);
    // 우리 화면 어디에도 없는 버튼이라, 화면에 적힌 이름 그대로 적어야 찾을 수 있다.
    await expect(home.addToHome.sheet).toContainText('휴대폰 홈 화면에 추가');
  });

  await home.addToHome.doneButton.click();
  await expect(home.addToHome.sheet).toHaveCount(0);

  await test.step('다시 들어와도 열리지 않는다', async () => {
    await page.reload();
    await home.waitReady();
    await expect(home.addToHome.sheet).toHaveCount(0);
  });
});

test('기록이 이미 있는 채로 열면 뜨지 않는다', async ({ home, prep }) => {
  await prep.addTransaction({ amount: 12000 });

  await home.open();
  await home.waitReady();

  /*
    「기록이 있다」 로 판정하면 어제 적고 오늘 여는 사람에게도 앱을 열자마자 뜬다.
    그건 첫 기록 직후가 아니라 그냥 방해다. 없음 → 있음으로 바뀌는 순간만 잡는다.
  */
  await expect(home.addToHome.sheet).toHaveCount(0);
});

test('읽지 않고 닫아도 다시 열리지 않는다', async ({ home, page, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await recordOnce(home, recordSheet);
  await expect(home.addToHome.sheet).toBeVisible();

  // 여는 순간 「봤다」 로 적는다. 닫을 때 적으면 그대로 앱을 끈 사람에게 다음에 또 뜬다.
  await page.keyboard.press('Escape');
  await expect(home.addToHome.sheet).toHaveCount(0);

  await page.reload();
  await home.waitReady();
  await expect(home.addToHome.sheet).toHaveCount(0);
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

test('안내를 처음 상태로 되돌리면 다음에 홈을 열 때 다시 뜬다', async ({
  home,
  recordSheet,
  settings,
}) => {
  await home.open();
  await home.waitReady();
  await recordOnce(home, recordSheet);
  await home.addToHome.doneButton.click();

  await settings.open();
  await settings.waitReady();
  await settings.versionRow.click();
  await settings.resetMarksButton.click();
  await expect(settings.text(/되돌렸어요/)).toBeVisible();

  /*
    **표시만 지워서는 다시 못 본다.** 안내는 「기록 없음 → 있음」 으로 바뀌는 순간에만 열리는데,
    이미 적어 둔 기록이 있으면 그 전이가 다시 일어나지 않는다.
    그래서 되돌리기가 「다음 홈 진입에서 한 번 열어라」 를 따로 남긴다.
  */
  await home.open();
  await home.waitReady();
  await expect(home.addToHome.sheet).toBeVisible();
});
