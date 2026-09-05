import { ROUTES } from '../../src/app/router/routes';
import { forceAdNoFill, watchAppClose } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 앱인토스 심사가 보는 것.
 *
 * 반려 사유 목록이 공개돼 있고, 그중 화면으로 확인할 수 있는 것을 여기서 본다.
 * 기능이 되는지가 아니라 **미니앱으로서 예의를 지키는지**를 본다.
 * 심사에서 걸리면 출시가 통째로 밀리므로 제출 전에 한 번 돌린다.
 *
 * 여기서 못 보는 것: 실기기 광고 높이, 구버전 토스앱 미지원 처리, 네이티브 권한 팝업.
 * 그것들은 QR 로 실기기에서 본다.
 */

/**
 * 닫히고 나면 devtools 목이 브라우저 히스토리를 한 칸 뒤로 보낸다.
 *
 * 히스토리가 비어 있으면 `about:blank` 로 가고, 앞 화면이 있으면 그 화면으로 간다.
 * 어디로 가는지는 목의 사정이라 못 박지 않는다. **판정은 위에서 이미 끝났고**,
 * 여기서는 그 이동이 끝나기를 기다리기만 한다. 안 기다리면 격리 가드가 테스트 끝에
 * "devtools 상태가 없다" 고 잡거나, 다음 이동과 부딪혀 이유 없는 실패가 된다.
 */

/** 탭 루트 셋. 여기서 뒤로가기를 누르면 미니앱이 닫혀야 한다. */
const TAB_ROOTS = [
  { label: '홈' as const, path: ROUTES.home },
  { label: '리포트' as const, path: ROUTES.report },
  { label: '관리' as const, path: ROUTES.manage },
];

test('첫 화면에서 뒤로가기를 누르면 미니앱이 닫힌다', async ({ appShell, home, page }) => {
  const closed = watchAppClose(page);

  await appShell.open();
  await home.waitReady();
  const before = page.url();
  await appShell.pressBack();

  // 히스토리가 비어 있는데 아무것도 안 하면 사용자가 앱에 갇힌다.
  // 반대로 우리가 화면을 하나 더 쌓아 두면 뒤로가기가 두 번 필요해진다. 둘 다 반려 사유다.
  expect(closed(), '홈에서 뒤로가기를 눌렀는데 미니앱이 안 닫혔다').toBe(true);
  await expect.poll(() => page.url()).not.toBe(before);
});

test('탭을 옮겨 다닌 뒤에도 뒤로가기 한 번에 닫힌다', async ({ appShell, home, page }) => {
  const closed = watchAppClose(page);

  await appShell.open();
  await home.waitReady();
  await appShell.goToTab('리포트');
  await appShell.goToTab('관리');
  await appShell.goToTab('홈');

  const before = page.url();
  await appShell.pressBack();

  // 탭 이동을 히스토리에 쌓으면 홈에 돌아와도 뒤로가기가 앞 탭으로 간다.
  // 사용자는 이미 홈에 있는데 앱이 안 닫히는 것으로 느낀다.
  expect(closed(), '탭을 옮겨 다닌 뒤 홈에서 뒤로가기가 미니앱을 못 닫았다').toBe(true);
  await expect.poll(() => page.url()).not.toBe(before);
});

for (const root of TAB_ROOTS) {
  test(`${root.label} 탭에서 뒤로가기를 누르면 미니앱이 닫힌다`, async ({ appShell, page }) => {
    const closed = watchAppClose(page);

    await appShell.open(root.path);
    await appShell.expectTabsVisible();
    const before = page.url();
    await appShell.pressBack();

    expect(closed(), `${root.label} 에서 뒤로가기가 미니앱을 못 닫았다`).toBe(true);
    await expect.poll(() => page.url()).not.toBe(before);
  });
}

test('하위 화면에서는 뒤로가기가 앱을 닫지 않고 부모로 간다', async ({ appShell, page }) => {
  const closed = watchAppClose(page);

  // 주소로 바로 들어온다. 딥링크로 들어오면 되돌아갈 히스토리가 없는 자리다.
  await appShell.open(ROUTES.settings);
  await appShell.expectScreen('앱 설정', '홈에 무엇을 먼저 보여줄지 정해요');
  await appShell.expectTabsHidden();

  await appShell.pressBack();

  await expect
    .poll(() => appShell.pathname, { message: '설정에서 뒤로가면 관리로 가야 한다' })
    .toBe(ROUTES.manage);
  expect(closed(), '하위 화면에서 뒤로가기가 미니앱을 닫아 버렸다').toBe(false);
});

test('진입하자마자 저절로 뜨는 바텀시트가 없다', async ({ appShell, home, settings }) => {
  await appShell.open();
  await home.waitReady();

  // 첫 화면에 시트가 뜨면 심사에서 막힌다. 첫 기록 전에 아무것도 묻지 않는다는
  // 제품 원칙과도 같은 자리다.
  await expect(settings.anyDialog).toHaveCount(0);

  await appShell.goToTab('리포트');
  await expect(settings.anyDialog).toHaveCount(0);

  await appShell.goToTab('관리');
  await expect(settings.anyDialog).toHaveCount(0);
});

test('상단 뒤로가기를 우리가 그리지 않는다. 화면 제목만 플랫폼에 넘긴다', async ({
  appShell,
  home,
}) => {
  await appShell.open();
  await home.waitReady();
  await appShell.expectDocumentTitle('10초 가계부');

  await appShell.goToTab('관리');
  await appShell.followLink('카테고리 관리');
  await appShell.expectDocumentTitle('카테고리 관리');

  // 상단바는 토스가 그린다. 우리가 하나 더 그리면 뒤로가기가 둘로 보인다.
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);
});

test('채울 광고가 없으면 빈 자리를 남기지 않는다', async ({ appShell, home, page }) => {
  await page.addInitScript(forceAdNoFill);

  await appShell.open();
  await home.waitReady();

  // 접힌 자리가 높이를 갖고 있으면 화면 아래가 이유 없이 비어 보인다.
  const height = await home.ads.slot.evaluate((element) => element.getBoundingClientRect().height);
  expect(height, '광고가 없는데 슬롯이 높이를 차지한다').toBe(0);
});

for (const root of TAB_ROOTS) {
  test(`${root.label} 화면이 가로로 넘치지 않는다`, async ({ appShell, page, prep }) => {
    // 긴 이름과 큰 금액이 함께 있을 때가 가장 넓다. 그 상태로 잰다.
    await prep.setBudget(3_000_000);
    await prep.addTransaction({ amount: 98_765_432, merchant: '아주아주기다란가게이름주식회사' });

    await appShell.open(root.path);
    await appShell.expectTabsVisible();

    // innerWidth 와 견주면 항진 명제다. 넘치면 브라우저가 화면을 축소해 둘이 함께 커진다.
    // 실제로 보이는 폭은 visualViewport 가 안다.
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      visual: Math.ceil(window.visualViewport?.width ?? window.innerWidth),
    }));
    expect(
      overflow.scroll,
      `${JSON.stringify(overflow)} 가로로 넘치면 탭바가 화면 밖으로 밀려 안 눌린다`,
    ).toBeLessThanOrEqual(overflow.visual + 1);
  });
}
