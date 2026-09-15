import { formatCurrency } from '../../src/shared/lib/format';
import type { HomeScreen } from '../screens/HomeScreen';
import type { RecordSheet } from '../screens/RecordSheet';
import { logsNamed, watchAppClose } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 처음 온 사람이 안내를 빠져나와 첫 기록을 마칠 때까지.
 *
 * 여기서 재는 것은 「안내가 잘 나오나」 가 아니라 **「나가려는 사람이 막히나」** 다.
 * 배우기 싫어서 이 앱을 고른 사람이라, 안내 한 겹을 지나 또 안내를 만나면 그 자리에서 나간다.
 *
 * 다른 spec 은 처음 안내도 홈 추가 안내도 꺼 두고 시작한다(support/fixtures.ts).
 * 이 파일은 둘 다 켜서 실제 첫 사용자와 같은 자리에 선다.
 */

test.use({ showOnboarding: true });

/*
  홈 추가 안내의 「이미 봤다」 표시를 지우고 시작한다.

  픽스처가 모든 테스트에 그 표시를 심는데, 안내 시트는 표시가 있으면 **아예 열리지 않는다.**
  지우지 않으면 여기서 세는 「또 뜨지 않는다」 가 제품이 아니라 픽스처 덕분에 통과한다.
  그 상태에서는 홈 추가 표시를 적는 배선을 통째로 걷어내도 전부 초록이다.
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

const AMOUNT = 12_000;
const CATEGORY = '식비';

/**
 * 홈에서 한 건 적고 확인까지 누른다.
 *
 * 홈 추가 안내는 기록이 **없음 → 있음으로 바뀌는 순간**에만 열린다. 그 전이를 만드는
 * 유일한 길이라 매번 화면으로 적는다. 목록에 그 금액이 뜬 뒤라야 조회가 돌아온 것이고,
 * 그때까지 안 열렸으면 안 열린 것이다.
 */
async function recordOnce(home: HomeScreen, recordSheet: RecordSheet): Promise<void> {
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(AMOUNT);
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.today.amount(formatCurrency(AMOUNT))).toBeVisible();
}

test('건너뛰고 첫 기록을 마쳐도 홈에 두라는 말을 또 듣지 않는다', async ({
  home,
  onboarding,
  recordSheet,
}) => {
  await home.open();
  await expect(onboarding.title('사진 한 장이면 끝나요')).toBeVisible();
  await onboarding.skipButton.click();
  await home.waitReady();

  await recordOnce(home, recordSheet);

  // 건너뛴 사람은 안내 자체를 원하지 않았다. 그 자리에 다른 안내를 대신 밀어 넣지 않는다.
  await expect(home.addToHome.sheet).toHaveCount(0);
});

test('끝까지 보고 시작해도 첫 기록 뒤에 같은 말을 또 듣지 않는다', async ({
  home,
  onboarding,
  recordSheet,
}) => {
  await home.open();
  await onboarding.nextButton.click();
  await onboarding.nextButton.click();

  // 이 장이 홈 화면에 두는 법을 이미 말한다. 첫 기록 뒤에 또 하면 안내가 아니라 잔소리다.
  await expect(onboarding.title('홈 화면에 두면 더 빨라요')).toBeVisible();
  await onboarding.nextButton.click();
  await expect(onboarding.title('마지막으로 두 가지만')).toBeVisible();
  await onboarding.startButton.click();
  await home.waitReady();

  await recordOnce(home, recordSheet);
  await expect(home.addToHome.sheet).toHaveCount(0);
});

/*
  실기기 사고가 난 자리다. 앱 데이터를 지우면 기기에 남은 「봤다」 표시도 함께 지워져,
  처음 안내가 다시 뜨고 서버 기록도 빈다. 그래서 여기서 적는 것이 **진짜 첫 기록**이고
  없음 → 있음 전이가 실제로 일어난다. 안내를 마치자마자 「첫 기록 끝!」 이 뜬 것이 여기다.
*/
test('앱 데이터를 지우고 다시 첫 기록을 해도 홈 추가 안내가 따라 뜨지 않는다', async ({
  home,
  onboarding,
  prep,
  recordSheet,
  settings,
}) => {
  await prep.addTransaction({ amount: 8_000, merchant: '분식' });

  await home.open();
  await onboarding.skipButton.click();
  await home.waitReady();

  await settings.open();
  await settings.waitReady();
  await settings.dataReset.run();

  // 지우면 앱이 스스로 처음부터 다시 연다. 여기서 goto 를 부르면 그 자리를 테스트가 대신해 준다.
  await expect.poll(async () => onboarding.isVisible, { timeout: 15_000 }).toBe(true);
  await onboarding.skipButton.click();
  await home.waitReady();

  await recordOnce(home, recordSheet);
  await expect(home.addToHome.sheet).toHaveCount(0);

  // 길이 사라진 것은 아니다. 보고 싶은 사람은 앱 설정에서 같은 안내를 연다.
  await settings.open();
  await settings.waitReady();
  await settings.addToHomeRow.click();
  await expect(settings.addToHomeSheet).toBeVisible();
});

/*
  첫 장에서 폰 뒤로가기를 누르는 사람.

  기록 시트도, 홈 추가 시트도, 결산 오버레이도 전부 뒤로가기를 자기 닫기로 가져간다.
  처음 안내만 안 가져가면 뒤로가기가 미니앱을 통째로 닫고, 안내는 여는 순간 「봤다」 로
  적히니 다시 들어와도 안 뜬다. 처음 온 사람이 아무것도 못 본 채 앱 밖으로 나간다.
*/
test('안내가 떠 있는 동안 뒤로가기는 미니앱이 아니라 안내를 가져간다', async ({
  appShell,
  home,
  onboarding,
  page,
  recordSheet,
}) => {
  const closed = watchAppClose(page);

  await home.open();
  await expect(onboarding.title('사진 한 장이면 끝나요')).toBeVisible();
  await onboarding.nextButton.click();
  await expect(onboarding.title('아래 탭 두 개만 기억해요')).toBeVisible();

  await test.step('둘째 장부터는 앞 장으로 돌아간다', async () => {
    await appShell.pressBack();
    await expect(onboarding.title('사진 한 장이면 끝나요')).toBeVisible();
    expect(closed(), '안내를 보는 중에 뒤로가기가 미니앱을 닫았다').toBe(false);
  });

  await test.step('첫 장에서는 건너뛰기와 같이 홈으로 보낸다', async () => {
    await appShell.pressBack();
    await expect(onboarding.isVisible).resolves.toBe(false);
    await home.waitReady();
    expect(closed(), '첫 장에서 뒤로가기가 미니앱을 닫았다').toBe(false);
  });

  // 나간 길이 달라도 안내를 그만둔 것은 같다. 첫 기록 뒤에 홈 추가 안내가 대신 뜨지 않는다.
  await recordOnce(home, recordSheet);
  await expect(home.addToHome.sheet).toHaveCount(0);
});

/*
  마지막 장에서 연령대를 눌러 봤다가 「역시 말하기 싫다」 싶어 건너뛰는 사람.

  누른 것이 그대로 나가면 「건너뛰기」 라는 말이 거짓이 된다. 회원가입이 아니라고 적어 둔
  화면이라 더 그렇다. 화면에 되비칠 자리가 없어서 나가는 요청을 직접 본다.
*/
test('마지막 장에서 고른 뒤 건너뛰면 그 값은 서버로 가지 않는다', async ({
  home,
  onboarding,
  page,
}) => {
  const profileSent: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/account/profile') && request.method() === 'PATCH') {
      profileSent.push(request.url());
    }
  });

  await home.open();
  await onboarding.nextButton.click();
  await onboarding.nextButton.click();
  await onboarding.nextButton.click();
  await expect(onboarding.title('마지막으로 두 가지만')).toBeVisible();

  await onboarding.ageSelect.selectOption('30s');
  await expect(onboarding.ageSelect).toHaveValue('30s');
  await onboarding.genderChip('여성').click();
  await expect(onboarding.genderChip('여성')).toHaveAttribute('aria-checked', 'true');

  // 「시작하기」 가 아니라 「건너뛰기」 다. 고른 것을 두고 나간다는 뜻이다.
  await onboarding.skipButton.click();
  await expect(onboarding.isVisible).resolves.toBe(false);
  await home.waitReady();

  // 로그가 찍힌 뒤에 센다. 보내는 자리와 적는 자리가 같은 함수라 여기까지 오면 판정이 끝나 있다.
  await expect
    .poll(async () => (await logsNamed(page, 'profile_result')).length)
    .toBeGreaterThan(0);

  const results = await logsNamed(page, 'profile_result');
  // 개발 판은 같은 일을 두 번 하기도 한다. 줄 수가 아니라 찍힌 값의 종류를 본다.
  expect([...new Set(results.map((log) => String(log.params.result)))]).toEqual(['skipped']);
  expect(profileSent, '건너뛰었는데 연령대·성별이 서버로 나갔다').toEqual([]);
});
