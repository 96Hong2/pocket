import { logsNamed } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 바깥에서 들어오는 입구 둘.
 *
 * - `/record` : 미니앱 상세의 주요 기능 「지출 기록하기」 가 가리키는 주소. 기록 시트가 홈 위에
 *   뜨는 창이라 자기 경로가 없어, 가장 많이 쓰는 입구를 주요 기능으로 걸 수가 없었다.
 * - `?src=` · `?referrer=` : 어디서 들어왔는지. 토스가 붙이는 입구만으로는 스레드와 릴스를
 *   못 가른다. 우리 표시를 링크에 붙이고, 처음 들어온 길은 기기에 남겨 다시 온 날에도 싣는다.
 */

test('/record 로 들어오면 기록 시트가 열린 채 시작한다. 부탁은 주소에서 지운다', async ({
  appShell,
  home,
  page,
  recordSheet,
}) => {
  await page.goto('/record');
  await recordSheet.waitOpen();

  // 홈으로 바꿔 끼운다. 남겨 두면 탭을 오가다 돌아올 때마다 시트가 다시 뜬다.
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await expect.poll(() => new URL(page.url()).search).toBe('');

  await expect
    .poll(async () => (await logsNamed(page, 'record_started')).at(-1)?.params.from)
    .toBe('deeplink');

  // 닫으면 그대로 홈이다. 빈 화면이나 없는 주소 화면이 아니다.
  await appShell.pressBack();
  await recordSheet.waitClosed();
  await home.waitReady();
});

test('들어온 길을 app_open 에 싣고, 다시 온 날에는 처음 들어온 길을 함께 싣는다', async ({
  home,
  page,
}) => {
  await page.goto('/?src=threads_bio&referrer=external_link');
  await home.waitReady();

  // 방문 기록과 처음 길을 저장소에서 읽은 뒤에 찍힌다. 화면이 먼저 떠도 로그는 늦을 수 있다.
  const lastOpen = async () => (await logsNamed(page, 'app_open')).at(-1)?.params;
  await expect.poll(lastOpen).toMatchObject({
    src: 'threads_bio',
    referrer: 'external_link',
    first_src: 'threads_bio',
    is_first_open: true,
  });

  // 다음에는 토스 알림으로 다시 왔다. 처음 길은 그대로 남아야 채널별 재방문을 센다.
  await page.goto('/?referrer=inbox');
  await home.waitReady();

  await expect.poll(lastOpen).toMatchObject({
    referrer: 'inbox',
    first_src: 'threads_bio',
    is_first_open: false,
  });
  expect((await lastOpen())?.src).toBeUndefined();
});

test.describe('처음 온 사람', () => {
  test.use({ showOnboarding: true });

  test('/record 로 처음 들어오면 처음 안내가 먼저고, 안내를 닫은 뒤에 기록 시트가 열린다', async ({
    onboarding,
    page,
    recordSheet,
  }) => {
    await page.goto('/record');
    await expect(onboarding.title('사진 한 장이면 끝나요')).toBeVisible();
    // 안내 아래에 시트가 미리 열려 있으면, 안내를 닫는 순간 누르지도 않은 창이 튀어나온다.
    await expect(recordSheet.isVisible).resolves.toBe(false);

    await onboarding.skipButton.click();
    await recordSheet.waitOpen();
    await expect
      .poll(async () => (await logsNamed(page, 'record_started')).at(-1)?.params.from)
      .toBe('deeplink');
  });
});
