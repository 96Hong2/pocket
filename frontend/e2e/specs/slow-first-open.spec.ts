import { expect, test } from '../support/fixtures';

/**
 * **서버에 아예 닿지 않아도 20초 안에 화면이 선다.**
 *
 * 2026-09-20 에 검수가 「미니앱 최초 접속 시간이 20초를 초과하여 로딩 성능 개선이
 * 필요해요」 로 막았다. 그 앞 회차의 「앱 메인 스킴으로 접속이 되지 않아요」 도 같은
 * 자리로 보인다. 서버 로그에 검수 기기가 온 흔적이 아예 없었는데, 이 앱은 조회가
 * 끝나지 않으면 「불러오는 중」 에서 멈춘 채로 아무것도 안 보여 준다.
 *
 * 여기서 재는 것은 속도가 아니라 **마감**이다. 요청이 영영 안 끝나는 자리에 놓고,
 * 그래도 사람이 무엇을 할 수 있는 화면이 20초 안에 서는지 본다.
 */

/** 요청을 붙잡고 아무 답도 주지 않는다. 막힌 망에서 실제로 일어나는 모양이다. */
const NEVER_ANSWERS = '**/api/v1/**';

/** 검수가 요구하는 선. 여기에 여유를 두지 않는다. 넘기면 반려다. */
const REVIEW_LIMIT_MS = 20_000;

test.describe('서버에 닿지 않을 때', () => {
  test.use({
    // 우리가 끊은 요청이다. 브라우저가 그것을 적는 것이고 앱이 낸 오류가 아니다.
    consoleErrorAllowList: [/Failed to load resource|net::ERR/],
  });

  test('요청이 영영 안 끝나도 20초 안에 다시 시도할 자리가 뜬다', async ({ home, page }) => {
    const held: (() => void)[] = [];
    await page.route(NEVER_ANSWERS, async (route) => {
      // 붙잡고만 있는다. 놓아주지 않으면 전송 자체가 안 끝난다.
      await new Promise<void>((resolve) => held.push(resolve));
      await route.abort();
    });

    const startedAt = Date.now();
    await home.open();

    /*
      **기록 버튼은 서버를 안 기다린다.** 조회가 끝나든 말든 이 앱이 하는 일은 기록이다.
      3초를 넘기면 그건 데이터에 묶여 있다는 뜻이다. 반려 당시에는 여기서 13초가 걸렸다.
    */
    await expect(home.recordButton).toBeVisible({ timeout: 3_000 });
    const buttonMs = Date.now() - startedAt;

    // 숫자를 못 받은 자리도 「불러오는 중」 에 갇히지 않고 다시 시도할 길을 준다.
    await expect(page.getByRole('button', { name: '다시 시도' }).first()).toBeVisible({
      timeout: REVIEW_LIMIT_MS,
    });

    const elapsed = Date.now() - startedAt;
    expect(buttonMs, `기록 버튼이 서는 데 ${buttonMs}ms 걸렸다`).toBeLessThan(3_000);
    expect(elapsed, `첫 화면이 서는 데 ${elapsed}ms 걸렸다`).toBeLessThan(REVIEW_LIMIT_MS);

    for (const release of held) release();
  });
});
