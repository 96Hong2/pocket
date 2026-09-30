import { forceAgreementResult } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/*
  다른 테스트는 이 카드를 「이미 닫았다」 로 두고 시작한다(support/fixtures.ts).
  기록으로 시작하는 화면마다 카드가 목록을 아래로 밀어내기 때문이다.
  여기서만 실제 첫 사용자와 같은 상태로 연다.
*/
test.use({ showStarterCards: true });

/*
  같이 쓰는 가계부 안내는 이 파일의 카드들보다 앞에 선다. 여기서는 닫아 둔 사람으로 연다.
  그 카드는 `books-intro.spec.ts` 가 본다.
*/
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('__ait_storage:card-dismissed-books-intro', '');
    } catch {
      /* 저장소를 못 여는 문서에서는 이 앱이 돌지 않는다. */
    }
  });
});

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

test('닫으면 다시 들어와도 뜨지 않는다', async ({ home, prep }) => {
  await prep.addTransaction({ amount: 12000 });
  await home.open();
  await home.waitReady();
  await expect(home.addToHome.card).toBeVisible();

  await home.addToHome.closeButton.click();
  await expect(home.addToHome.card).toHaveCount(0);

  // 닫은 날이 지나도 그대로다. 다음 순서인 저녁 알림이 서야 판정이 끝난 것이다.
  await home.passQuietDay();
  await expect(home.remind.card).toBeVisible();
  await expect(home.addToHome.card).toHaveCount(0);
});

/**
 * 알림은 **딴 카드**이고, **한 번에 하나만 선다.**
 *
 * 예전에는 홈 추가 카드 안에 줄 하나로 얹혀 있었다. 그러면 홈에 두기는 싫고 알림만
 * 켜고 싶은 사람이 둘을 같이 닫아야 했고, 그 줄은 설정 화면으로 보내기만 해서 거기서
 * 토글을 찾아 켜는 걸음이 더 있었다. 그래서 카드를 갈랐다.
 *
 * 갈라 두고 **나란히 세우던 것**은 2026-09-22 에 그만뒀다. 출시판을 쓴 사람이 보낸 화면에
 * 밀린 내역·홈 추가·저녁 알림이 한꺼번에 서 있었다. 하나씩 물어도 각자 닫기 전까지는
 * 다음 회차에 다시 선다.
 */
test('홈 추가를 닫으면 그날은 쉬고, 다음 날 저녁 알림이 선다', async ({ home, prep }) => {
  await prep.addTransaction({ amount: 12000 });
  await home.open();
  await home.waitReady();

  await expect(home.addToHome.card).toBeVisible();
  await expect(home.remind.card).toHaveCount(0);

  // 닫자마자 다음 권유가 올라오면 닫은 손을 「다음 것」 으로 읽은 셈이다.
  await home.addToHome.closeButton.click();
  await expect(home.addToHome.card).toHaveCount(0);
  await expect(home.remind.card).toHaveCount(0);

  await home.passQuietDay();
  await expect(home.remind.card).toBeVisible();
  await expect(home.addToHome.card).toHaveCount(0);
});

test('카드에서 바로 저녁 8시 알림이 켜진다', async ({ home, notifications, prep }) => {
  await prep.addTransaction({ amount: 12000 });
  await home.open();
  await home.waitReady();

  // 권유는 한 번에 하나다. 앞의 것을 닫고 하루가 지나야 알림 카드가 선다.
  await home.addToHome.closeButton.click();
  await home.passQuietDay();
  await home.remind.turnOnButton.click();

  // 켠 그 자리에서 답한다. 카드가 말없이 사라지면 눌린 것인지 알 수 없다.
  await expect(home.remind.card).toContainText('저녁 8시에 알려 드릴게요');
  await expect(home.remind.turnOnButton).toHaveCount(0);

  await test.step('답을 읽고 ✕ 를 누르면 닫히고, 닫은 횟수로 세지 않는다', async () => {
    await home.remind.closeButton.click();
    await expect(home.remind.card).toHaveCount(0);
    expect(await home.remindNudgeState()).toBeNull();
  });

  await test.step('알림 설정에도 그대로 켜져 있다', async () => {
    await notifications.open();
    await notifications.waitReady();
    await expect(notifications.toggle).toHaveAttribute('aria-checked', 'true');
    await expect(notifications.timeInput).toHaveValue('20:00');
  });
});

/**
 * 저장이 막히면 **켰다고 말하지 않는다.**
 *
 * 동의는 받았는데 저장이 막힌 사람에게 「저녁 8시에 알려 드릴게요」 라고 적으면, 알림은
 * 오지 않는데 켰다고 적혀 있는 화면이 된다. 저장을 안 기다리면 실제로 그렇게 된다.
 */
test.describe('알림 저장 실패', () => {
  test.use({ consoleErrorAllowList: [/Failed to load resource[\s\S]*500/] });

  test('알림 저장이 막히면 켰다고 말하지 않는다', async ({ home, page, prep }) => {
    // 500 을 일부러 만든다. 그 콘솔 오류는 이 테스트가 만든 것이라 눈감는다.
    await prep.addTransaction({ amount: 12000 });
    await home.open();
    await home.waitReady();
    // 권유는 한 번에 하나다. 앞의 것을 닫고 하루가 지나야 알림 카드가 선다.
    await home.addToHome.closeButton.click();
    await home.passQuietDay();

    await page.route('**/api/v1/notifications/settings', async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.fallback();
        return;
      }
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    await home.remind.turnOnButton.click();

    await expect(home.remind.card).toContainText('저장하지 못했어요');
    await expect(home.remind.card).not.toContainText('알려 드릴게요');
    // 다시 눌러 볼 수 있어야 한다. 잠가 두면 고칠 길이 없다.
    await expect(home.remind.turnOnButton).toBeEnabled();
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

  /*
    알림 카드가 안 그려지는 사람이라고 **뒤의 카드까지 막히면 안 된다.** 카드 안에서 조용히
    빈 것을 돌려주던 때는 홈이 그 자리를 「섰다」 로 세어, 켠 사람에게 예산 제안과 별점,
    공유가 영영 안 떴다.
  */
  await test.step('알림 자리를 건너 다음 권유가 선다', async () => {
    await home.addToHome.closeButton.click();
    await home.passQuietDay();
    await expect(home.remind.card).toHaveCount(0);
    await expect(home.budget.suggestCard).toBeVisible();
  });
});

/**
 * 홈 추가의 두 번째 기회.
 *
 * 첫 기록 직후에는 이 앱을 계속 쓸지조차 모르는 상태라, 그때 닫은 것은 「싫다」 가 아니라
 * 「아직 모르겠다」 에 가깝다. 다섯 번을 적은 사람은 계속 쓰기로 한 사람이다.
 * **딱 한 번 더 묻고**, 거기서 또 닫으면 그게 대답이다.
 */
test('홈 추가는 닫았어도 다섯 번째 기록에서 한 번 더 뜬다', async ({ home, prep }) => {
  await prep.addTransaction({ amount: 12000 });
  await home.open();
  await home.waitReady();

  await home.addToHome.closeButton.click();
  await expect(home.addToHome.card).toHaveCount(0);

  // 네 건을 더해 다섯 건으로 만든다.
  for (let i = 0; i < 4; i += 1) {
    await prep.addTransaction({ amount: 3000 + i });
  }
  await home.passQuietDay();

  // 두 번째 기회에도 한 번에 하나다. 홈 추가가 먼저다.
  await expect(home.addToHome.card).toBeVisible();
  await expect(home.remind.card).toHaveCount(0);

  await test.step('여기서 닫으면 그게 대답이다', async () => {
    await home.addToHome.closeButton.click();
    await home.passQuietDay();
    await expect(home.remind.card).toBeVisible();
    await expect(home.addToHome.card).toHaveCount(0);
  });
});

/**
 * 저녁 알림은 **켤 때까지 묻되, 닫을수록 뜸해진다.**
 *
 * 닫은 뒤 3일, 7일, 14일, 그 뒤로는 30일. 그 사이에 세 번은 새로 적었어야 한다.
 * 안 쓰는 사람에게 알림을 권하면 「이 앱이 나를 부르려 한다」 로만 읽힌다.
 * 날짜는 앞당길 수 없어 저장된 「닫은 날」 만 옮긴다(`home.moveRemindClosedDaysAgo`).
 */
test('저녁 알림은 닫을수록 다시 묻는 간격이 길어진다', async ({ home, page, prep }) => {
  // 홈 추가는 두 번 다 닫은 사람으로 연다. 다섯 번째 기록에서 홈 추가가 다시 서면 알림이 비켜 준다.
  await page.addInitScript(() => {
    try {
      for (const card of ['home-add', 'home-add-again']) {
        window.localStorage.setItem(`__ait_storage:card-dismissed-${card}`, '');
      }
    } catch {
      /* 저장소를 못 여는 문서에서는 이 앱이 돌지 않는다. */
    }
  });
  await prep.addTransaction({ amount: 12000 });
  await home.open();
  await home.waitReady();

  await expect(home.remind.card).toBeVisible();
  await home.remind.closeButton.click();
  await expect(home.remind.card).toHaveCount(0);
  expect(await home.remindNudgeState()).toMatchObject({ closes: 1, recordsAtClose: 1 });

  await test.step('사흘이 지나도 그 사이에 안 적었으면 안 묻는다', async () => {
    await home.moveRemindClosedDaysAgo(3);
    // 알림 자리를 건너 다음 순서(예산 제안)가 서야 판정이 끝난 것이다.
    await expect(home.budget.suggestCard).toBeVisible();
    await expect(home.remind.card).toHaveCount(0);
  });

  for (let i = 0; i < 3; i += 1) {
    await prep.addTransaction({ amount: 3000 + i });
  }

  await test.step('이틀째에는 세 번 적었어도 아직이다', async () => {
    await home.moveRemindClosedDaysAgo(2);
    await expect(home.budget.suggestCard).toBeVisible();
    await expect(home.remind.card).toHaveCount(0);
  });

  await test.step('사흘이 지나고 세 번 적었으면 다시 묻는다', async () => {
    await home.moveRemindClosedDaysAgo(3);
    await expect(home.remind.card).toBeVisible();
    await home.remind.closeButton.click();
    expect(await home.remindNudgeState()).toMatchObject({ closes: 2, recordsAtClose: 4 });
  });

  for (let i = 0; i < 3; i += 1) {
    await prep.addTransaction({ amount: 4000 + i });
  }

  await test.step('두 번 닫은 사람은 이레를 기다린다', async () => {
    await home.moveRemindClosedDaysAgo(6);
    await expect(home.budget.suggestCard).toBeVisible();
    await expect(home.remind.card).toHaveCount(0);
    await home.moveRemindClosedDaysAgo(7);
    await expect(home.remind.card).toBeVisible();
  });
});

/**
 * 토스 알림 동의를 거절한 것도 대답이다.
 *
 * 한 번 닫은 것으로 세어 다시 묻는 간격이 시작된다. 카드는 왜 못 켰는지 적힌 줄을 읽을 수
 * 있게 이번 방문 동안 제자리에 있고, 그 뒤 ✕ 를 눌러도 두 번 세지 않는다.
 */
test('알림 동의를 거절하면 한 번 닫은 것으로 세고 카드는 이유를 보여 준다', async ({
  home,
  page,
  prep,
}) => {
  await page.addInitScript(() => {
    try {
      for (const card of ['home-add', 'home-add-again']) {
        window.localStorage.setItem(`__ait_storage:card-dismissed-${card}`, '');
      }
    } catch {
      /* 저장소를 못 여는 문서에서는 이 앱이 돌지 않는다. */
    }
  });
  await forceAgreementResult('agreementRejected')(page);
  await prep.addTransaction({ amount: 12000 });
  await home.open();
  await home.waitReady();

  await home.remind.turnOnButton.click();
  await expect(home.remind.card).toContainText('토스 알림 동의를 하지 않아');
  await expect(home.remind.turnOnButton).toBeDisabled();
  await expect.poll(() => home.remindNudgeState()).toMatchObject({ closes: 1 });

  await home.remind.closeButton.click();
  await expect(home.remind.card).toHaveCount(0);
  expect(await home.remindNudgeState()).toMatchObject({ closes: 1 });
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
 * **스스로 서는 권유 카드는 한 번에 하나다.**
 *
 * 둘까지 허용하던 규칙을 2026-09-22 에 하나로 좁혔다. 출시판을 쓴 사람이 보낸 화면에
 * 밀린 내역·홈 추가·저녁 알림이 한꺼번에 서 있었고, 초록 버튼이 기록하기까지 넷이라
 * 무엇을 눌러야 하는 화면인지 안 읽혔다.
 *
 * 한 번뿐인 안내가 앞이고 예산 제안이 비켜 준다. **예산 제안은 안 사라지고 기다리기
 * 때문**이다. 예산을 정할 때까지 계속 뜨고, 카드 자체도 관리 탭에서 언제든 정할 수
 * 있다고 적는다. 반대로 한 번뿐인 안내는 그 자리를 내주면 영영 안 뜬다.
 */
test('예산 제안은 한 번뿐인 안내에 비켜 주고, 앞의 것을 닫은 다음 날 선다', async ({ home, prep }) => {
  await prep.addTransaction({ amount: 12000 });

  await home.open();
  await home.waitReady();

  await expect(home.addToHome.card).toBeVisible();
  await expect(home.remind.card).toHaveCount(0);
  await expect(home.budget.suggestCard).toHaveCount(0);

  await test.step('앞의 둘을 하루에 하나씩 닫으면 예산 제안이 그 자리에 선다', async () => {
    await home.addToHome.closeButton.click();
    await home.passQuietDay();
    await expect(home.budget.suggestCard).toHaveCount(0);
    await home.remind.closeButton.click();
    await expect(home.budget.suggestCard).toHaveCount(0);
    await home.passQuietDay();
    await expect(home.budget.suggestCard).toBeVisible();
  });
});

/**
 * 공유 권유도 비켜 준다.
 *
 * 공유는 다섯 번 넘게 적은 사람에게만 뜨고, 그때까지 기다릴 수 있는 유일한 권유다.
 * 두 번째 기회로 다시 선 카드 둘과 겹치면 홈이 권유 전시장이 된다.
 */
/**
 * 밀린 내역이 서면 **다른 권유는 다음 회차로 미룬다.**
 *
 * 출시판을 쓴 사람이 보낸 화면에 밀린 내역·홈 화면 추가·저녁 알림이 한꺼번에 서 있었다.
 * 규칙이 기록 버튼 **아래**만 세고 있었고, 그 위에 서는 밀린 내역 카드는 아무도 안 세고
 * 있었던 것이 원인이다.
 *
 * 며칠 비운 사람이 지금 이 화면에 온 이유가 밀린 내역이다. 나머지는 다음에 물어도 되지만
 * 이 사람은 지금 이어 붙이지 않으면 다시 안 온다.
 *
 * **이 검사는 여기 있어야 한다.** `recovery.spec.ts` 는 권유 카드 표가 기본으로 닫혀 있어
 * 「안 뜬다」 를 아무리 단언해도 아무것도 증명하지 못한다(`showStarterCards`).
 */
test('밀린 내역이 뜨면 다른 권유 카드는 쉰다', async ({ home, prep }) => {
  // 나흘 비운 사람. 사흘을 넘겨야 밀린 내역 카드가 선다.
  await prep.addExpense({ amount: 12_000, daysAgo: 4 });

  await home.open();
  await home.waitReady();

  await expect(home.recovery.card).toBeVisible();
  await expect(home.addToHome.card).toHaveCount(0);
  await expect(home.remind.card).toHaveCount(0);
  await expect(home.budget.suggestCard).toHaveCount(0);

  await test.step('닫으면 그날은 쉬고, 다음 날 다음 것이 이어받는다', async () => {
    await home.recovery.closeButton.click();
    await expect(home.recovery.card).toHaveCount(0);
    await expect(home.addToHome.card).toHaveCount(0);

    await home.passQuietDay();
    // 여기서도 하나뿐이다. 홈 추가가 서고 저녁 알림은 그다음 회차로 간다.
    await expect(home.addToHome.card).toBeVisible();
    await expect(home.remind.card).toHaveCount(0);
  });
});

test('권유 카드는 한 번에 하나만 선다', async ({ home, prep }) => {
  for (let i = 0; i < 5; i += 1) {
    await prep.addTransaction({ amount: 3000 + i });
  }

  await home.open();
  await home.waitReady();

  await expect(home.addToHome.card).toBeVisible();
  await expect(home.remind.card).toHaveCount(0);
  await expect(home.share.card).toHaveCount(0);
  await expect(home.budget.suggestCard).toHaveCount(0);
});
