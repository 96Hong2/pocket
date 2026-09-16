import { expect, test } from '../support/fixtures';

/**
 * 익명 식별키를 못 받았을 때.
 *
 * 이 키는 앱의 계정 그 자체다. 못 받으면 조회·저장·삭제가 **전부** 막히고 화면에는
 * 「사용자 확인을 마치지 못했어요」 만 남는다. 실기기에서 실제로 그 상태에 갇혔다는
 * 신고가 왔다(2026-09-16). 그때 앱은 딱 한 번만 묻고 포기했다.
 *
 * 목 SDK 는 `window.__ait` 에 상태를 그대로 걸어 둔다. 거기 익명키를 잠깐 비우면
 * 실기기에서 난 그 실패를 브라우저에서 그대로 만들 수 있다.
 */

/** 앞의 몇 번을 실패시킬지. 자동 재시도(두 번)보다 적어야 스스로 풀린다. */
const FAIL_TIMES = 2;

test('식별키를 처음 못 받아도 사람이 안 누르고 스스로 풀린다', async ({ home, page }) => {
  await page.addInitScript((failTimes: number) => {
    const win = window as unknown as {
      __ait?: { state?: { auth?: Record<string, unknown> } };
      __identityReads?: number;
    };
    win.__identityReads = 0;

    // 목이 언제 실리는지는 우리 손에 없다. 실리는 즉시 한 번만 갈아 끼운다.
    const timer = setInterval(() => {
      const auth = win.__ait?.state?.auth;
      if (auth == null) return;
      clearInterval(timer);
      const real = auth.anonymousKeyHash;
      Object.defineProperty(auth, 'anonymousKeyHash', {
        configurable: true,
        get() {
          win.__identityReads = (win.__identityReads ?? 0) + 1;
          // 비면 목이 던진다. 실기기에서 SDK 가 던지던 그 자리다.
          return win.__identityReads <= failTimes ? '' : real;
        },
      });
    }, 5);
  }, FAIL_TIMES);

  await home.open();

  // 스스로 다시 물어 여기까지 온다. 「다시 시도」 는 한 번도 안 눌렀다.
  await home.waitReady();
  await expect(page.getByText('사용자 확인을 마치지 못했어요')).toHaveCount(0);

  const reads = await page.evaluate(
    () => (window as unknown as { __identityReads?: number }).__identityReads ?? 0,
  );
  expect(reads, '한 번만 묻고 포기했으면 이 값이 1 에서 멈춘다').toBeGreaterThan(FAIL_TIMES);
});
