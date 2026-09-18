import { formatCurrency, formatMonthLabel, toLedgerDate } from '../../src/shared/lib/format';
import type { HomeScreen } from '../screens/HomeScreen';
import type { RecordSheet } from '../screens/RecordSheet';
import { watchAppClose } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 처음 온 사람이 첫 화면에서 겪는 자리들.
 *
 * 여기서 재는 것은 「안내가 잘 나오나」 가 아니라 **「한 번 지나간 것이 다시 붙잡지 않나」** 다.
 * 안내를 보다 앱을 끈 사람, 아직 아무것도 안 적은 사람, 오늘 말고 그 전을 보고 싶어진 사람,
 * 안내 시트가 떠 있는데 폰 뒤로가기를 누른 사람. 넷 다 막히면 그 자리에서 나간다.
 */

const AMOUNT = 12_000;
const CATEGORY = '식비';

/** 이번 달. 기기 시간대가 아니라 가계부 시간대로 센다. */
const THIS_MONTH = toLedgerDate(new Date()).slice(0, 7);

/** 홈에서 키패드로 한 건 적고 시트를 닫는다. 기록 없음 → 있음 전이를 만드는 길이다. */
async function recordOnce(home: HomeScreen, recordSheet: RecordSheet): Promise<void> {
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(AMOUNT);
  await recordSheet.input.pickCategory(CATEGORY);
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();
}

test.describe('처음 안내를 켠 채로', () => {
  test.use({ showOnboarding: true });

  test('첫 장에서 아무것도 안 누르고 새로고침하면 안내 대신 홈이 열린다', async ({
    home,
    onboarding,
    page,
  }) => {
    await home.open();

    // 아직 한 번도 안 눌렀다. 첫 장 그대로고 나갈 길도 그대로 있다.
    await expect(onboarding.title('사진 한 장이면 끝나요')).toBeVisible();
    await expect(onboarding.skipButton).toBeVisible();

    await page.reload();

    /*
      **여는 순간 「봤다」 로 적기 때문에** 여기서 안내가 안 뜬다. 닫을 때 적었다면
      보다가 앱을 끈 사람에게 매번 다시 떠서, 안내를 지나야만 쓸 수 있는 앱이 된다.
    */
    await expect(onboarding.isVisible).resolves.toBe(false);
    await home.waitReady();
    await expect(home.hero.firstLead).toBeVisible();
  });
});

test('아무것도 없는 첫 홈은 예산부터 묻지 않고 부담을 덜어 준다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();

  await expect(home.hero.firstLead).toBeVisible();
  await expect(home.hero.firstLead).toContainText('10초만 쓰고 닫아도 돼요.');
  // 큰 숫자는 이번 달 쓴 돈 0원 하나다. 첫 화면에서 예산을 물으면 그것부터 숙제가 된다.
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(0));
  await expect(home.budget.saveButton).toHaveCount(0);

  await recordOnce(home, recordSheet);

  // 한 건이라도 적은 사람에게 할 말이 아니다. 그 자리에 다음 걸음이 대신 온다.
  await expect(home.today.amount(formatCurrency(AMOUNT))).toBeVisible();
  await expect(home.hero.firstLead).toHaveCount(0);
  await expect(home.budget.suggestLead).toBeVisible();
});

test('홈에서 달력으로 가는 길이 둘이고, 어느 쪽으로 가도 그 달이 열린다', async ({
  calendar,
  home,
  prep,
}) => {
  await prep.addTransaction({ amount: AMOUNT, merchant: '스타벅스' });

  await home.open();
  await home.waitReady();

  await test.step('오늘 목록 끝의 「전체 내역 보기」', async () => {
    await home.today.moreLink.click();
    await calendar.waitReady();
    await expect(calendar.monthLabel).toHaveText(formatMonthLabel(THIS_MONTH));
    await expect(calendar.totals.expense).toHaveText(formatCurrency(AMOUNT));
  });

  await test.step('큰 숫자 옆의 달력 아이콘', async () => {
    await home.open();
    await home.waitReady();
    await home.hero.calendarLink.click();
    await calendar.waitReady();
    await expect(calendar.monthLabel).toHaveText(formatMonthLabel(THIS_MONTH));
    await expect(calendar.totals.expense).toHaveText(formatCurrency(AMOUNT));
  });
});

test.describe('홈 추가 안내를 처음 보는 사람', () => {
  /*
    픽스처가 모든 테스트에 「이미 닫았다」 를 심는다. 켜 두지 않으면 카드가 **아예 서지 않아**,
    여기서 세는 것이 제품이 아니라 픽스처 덕분에 통과한다.
  */
  test.use({ showStarterCards: true });

  test('안내가 떠 있을 때 뒤로가기는 미니앱이 아니라 시트를 가져간다', async ({
    appShell,
    home,
    page,
    recordSheet,
  }) => {
    const closed = watchAppClose(page);

    await home.open();
    await home.waitReady();
    await recordOnce(home, recordSheet);

    // 카드는 스스로 아무것도 안 연다. 안내를 여는 것은 사람이 누를 때다.
    await home.addToHome.openButton.click();
    await expect(home.addToHome.sheet).toBeVisible();
    // 우리 화면 어디에도 없는 버튼이라 토스가 적어 둔 이름 그대로 실려야 찾아간다.
    await expect(home.addToHome.sheet).toContainText('휴대폰 홈 화면에 추가');

    await appShell.pressBack();

    /*
      시트가 뒤로가기를 안 가져가면 첫 기록을 마친 그 순간 앱이 통째로 닫힌다.
      목이 그리는 화면은 그대로라 브라우저에서는 눈에 안 보이고, 닫혔다는 줄로만 잡힌다.
    */
    await expect(home.addToHome.sheet).toHaveCount(0);
    expect(closed(), '안내를 닫는 뒤로가기가 미니앱을 통째로 닫았다').toBe(false);

    // 홈은 그대로 살아 있다. 방금 적은 줄도 제자리에 있다.
    await expect(home.today.amount(formatCurrency(AMOUNT))).toBeVisible();
    await expect(home.recordButton).toBeVisible();
  });
});
