import { expect, test } from '../support/fixtures';

/**
 * 며칠 비웠다 돌아왔을 때의 경계.
 *
 * 기본 동작은 `specs/recovery.spec.ts` 가 지킨다. 여기서 보는 것은 **언제 뜨고 안 뜨나**,
 * 그리고 앞날짜·꽉 찬 주처럼 드물지만 실제로 생기는 상태다.
 *
 * 이 화면의 규칙은 하나다. **돌아온 사람에게 실점을 알리지 않는다.**
 * 그래서 어떤 상태에서도 며칠 빠졌는지를 세는 말이 화면에 있으면 안 된다.
 */

/** 복구 카드가 뜨는 경계. 정본은 `src/features/home/homeMode.ts` 의 RECOVERY_AFTER_DAYS 다. */
const BOUNDARY_DAYS = 3;

test('이틀 비운 것으로는 복구 카드가 안 뜬다', async ({ home, prep }) => {
  await prep.addExpense({ amount: 12_000, daysAgo: BOUNDARY_DAYS - 1 });

  await home.open();
  await home.waitReady();

  // 이틀은 흔한 일이다. 여기서 카드가 뜨면 평범한 사용자가 매주 복구 화면을 본다.
  await expect(home.recovery.card).toHaveCount(0);
});

test('사흘 비우면 그때 복구 카드가 뜬다', async ({ home, prep }) => {
  await prep.addExpense({ amount: 12_000, daysAgo: BOUNDARY_DAYS });

  await home.open();
  await home.waitReady();

  await expect(home.recovery.card).toBeVisible();
  await expect(home.recovery.catchUpButton).toBeVisible();
  await expect(home.recovery.lead).toBeVisible();
  await expect(home.recovery.punishingText).toHaveCount(0);
});

test('오래 비웠어도 며칠인지 세지 않는다', async ({ home, prep }) => {
  // 두 달을 비운 사람. 실점을 세는 문구가 있으면 여기서 가장 커진다.
  await prep.addExpense({ amount: 12_000, daysAgo: 60 });

  await home.open();
  await home.waitReady();

  await expect(home.recovery.card).toBeVisible();
  await expect(home.recovery.punishingText).toHaveCount(0);
  await expect(home.recovery.alerts).toHaveCount(0);

  // 하루도 못 채운 주다. 숫자를 세는 대신 다시 시작하자고 말한다.
  await expect(home.recovery.progressText).toHaveText('이번 주는 지금부터 시작이에요');
});

test('창을 꽉 채워도 게이지가 경고색으로 넘어가지 않는다', async ({ home, prep }) => {
  // 이레를 하루도 안 빼고 채운다. 그러면 진행이 1.0 이 된다.
  for (let day = 0; day < 7; day += 1) {
    await prep.addExpense({ amount: 1_000 + day, daysAgo: day });
  }
  // 그런데 마지막 기록이 오늘이면 복구 화면이 아니다. 창 밖의 옛 기록으로 복구 상태를 만든다.
  await prep.addExpense({ amount: 5_000, daysAgo: 40 });

  await home.open();
  await home.waitReady();

  // 정리한 날이 이레면 카드는 아직 뜰 수 있어도 게이지는 꽉 찬다.
  // 꽉 찬 것을 넘친 것으로 그리면 다 해낸 사람에게 경고색을 보여 주게 된다.
  const percent = await home.recovery.gaugePercent();
  if (percent != null) {
    const warning = await home.recovery.tokenColor('--color-amber-300');
    expect(await home.recovery.gaugeFillColor(), '복구 게이지가 경고색이다').not.toBe(warning);
  }
});

test('복구 카드에서 캡처로 정리하면 카드가 사라진다', async ({ home, prep, recordSheet }) => {
  await prep.addExpense({ amount: 12_000, daysAgo: BOUNDARY_DAYS + 2 });

  await home.open();
  await home.waitReady();
  await expect(home.recovery.card).toBeVisible();

  // 며칠치를 한 건씩 손으로 적는 것은 애초에 안 될 제안이라 캡처 탭으로 연다.
  await home.recovery.catchUpButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.methodTab('캡처')).toHaveAttribute('aria-checked', 'true');

  // 캡처 대신 키패드로 한 건만 적어도 '오늘 기록한 사람' 이 된다.
  await recordSheet.methodTab('키패드').click();
  await recordSheet.input.enterAmount(9_000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  // 정리하고 나면 그 화면은 물러나야 한다. 남아 있으면 방금 한 일이 없던 일이 된다.
  await expect(home.recovery.card).toHaveCount(0);
});

test('앞날짜로 적어 둔 기록이 있어도 복구 카드가 뜬다', async ({ home, prep }) => {
  // 카드 결제 예정을 미리 적어 두는 사람이 있다. 그 한 건이 '마지막 기록' 이 되면
  // 오늘까지의 공백이 0 으로 보여 복구 화면이 영영 안 뜬다.
  await prep.addExpense({ amount: 12_000, daysAgo: BOUNDARY_DAYS + 4 });
  await prep.addTransaction({ amount: 50_000, daysAgo: -5, merchant: '다음달카드값' });

  await home.open();
  await home.waitReady();

  await expect(home.recovery.card).toBeVisible();
  await expect(home.recovery.punishingText).toHaveCount(0);
});
