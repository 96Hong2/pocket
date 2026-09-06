import { formatCurrency } from '../../src/shared/lib/format';
import { thisMonth } from '../support/api';
import { CAPTURE_DATA_URI, mockImagesSeeded, seedMockImages } from '../support/deviceMock';
import { expect, test } from '../support/fixtures';

/**
 * 며칠 비운 뒤 다시 열었을 때의 홈.
 *
 * 이 화면의 약속은 둘이다. 빠진 날을 세어 보여주지 않는 것, 그리고 밀린 것을 한 번에
 * 정리할 다음 한 걸음을 주는 것. 그래서 여기서는 문구와 색만 보지 않고,
 * 그 버튼이 실제로 밀린 것을 정리해 카드를 스스로 걷는 데까지 간다.
 *
 * 며칠 비운 상태는 화면으로 만들 수 없어 배경만 API 로 심는다. 행동과 단언은 화면으로 한다.
 */

/** 복구 카드는 사흘째부터 뜬다. 나흘 전이면 확실히 창 안이면서 카드가 뜨는 자리다. */
const AWAY_DAYS = 4;
/** 정리 진행을 세는 창. 오늘을 포함한 7일이다. */
const WINDOW_DAYS = 7;

/**
 * 캡처 스텁이 늘 내는 5건 중 서버가 스스로 켜 주는 것들.
 *
 * 확신이 0.5 아래인 카카오T(9,800)만 꺼진 채로 온다.
 * 오늘 날짜 후보가 둘(스타벅스·GS25) 있어서, 저장하면 마지막 기록일이 오늘이 된다.
 */
const CAPTURE_SELECTED = 4;
const CAPTURE_TOTAL = 4_500 + 3_200 + 8_000 + 32_900;
/** 오늘 날짜로 오는 두 건. 저장 뒤 오늘 목록에 그대로 보여야 한다. */
const CAPTURE_TODAY = ['스타벅스', 'GS25'] as const;

/** 히어로 라벨에 적히는 달. `9월 · 이번 달 쓴 돈`. */
const MONTH_NUMBER = Number(thisMonth().slice(5, 7));

test('사흘 넘게 비면 복구 카드가 뜨고, 벌주는 말이 없다', async ({ home, prep }) => {
  await prep.addExpense({ amount: 12_000, daysAgo: AWAY_DAYS });

  await home.open();
  await home.waitReady();

  await expect(home.recovery.card).toBeVisible();
  await expect(home.recovery.catchUpButton).toBeVisible();

  // 있어야 할 말부터 못 박는다. 없어야 할 것만 세면 문구를 통째로 잃어도 초록이다.
  await expect(home.recovery.lead).toBeVisible();
  await expect(home.recovery.leadNext).toBeVisible();

  // 며칠 빠졌는지, 연속이 끊겼는지를 화면 어디에도 적지 않는다.
  await expect(home.recovery.punishingText).toHaveCount(0);
  // 돌아온 것은 경고할 일이 아니다. 카드 안에 경고 자리를 만들지 않는다.
  await expect(home.recovery.alerts).toHaveCount(0);

  // 복구 게이지는 경고색으로 가지 않는다.
  //
  // 예산을 넘긴 히어로 게이지와 견주는 방법을 쓰지 않는다. 그러려면 이번 달 지출이
  // 있어야 하는데 복구 카드는 마지막 기록이 사흘보다 전이어야 떠서, 달이 바뀐 직후
  // 며칠은 두 조건이 함께 설 수 없다. 코드가 아니라 달력 때문에 빨개진다.
  // 그래서 경고색 토큰을 화면에서 직접 뽑아 그 색이 아님을 본다.
  const warning = await home.recovery.tokenColor('--color-amber-300');
  expect(await home.recovery.gaugeFillColor(), '복구 게이지가 경고색이다').not.toBe(warning);
});

test('복구 카드 버튼은 기록 시트를 캡처 탭으로 연다', async ({ home, prep, recordSheet }) => {
  await prep.addExpense({ amount: 9_000, daysAgo: AWAY_DAYS });

  await home.open();
  await home.waitReady();

  await home.recovery.catchUpButton.click();
  await recordSheet.waitOpen();

  await expect(recordSheet.methodTab('캡처')).toHaveAttribute('aria-checked', 'true');
  await expect(recordSheet.methodTab('키패드')).toHaveAttribute('aria-checked', 'false');

  // 탭 표시만 바뀌고 본문은 키패드인 경우를 잡는다. 안 보이는 탭도 DOM 에는 그대로 남으므로
  // "키패드가 없다" 로는 못 잡는다. 캡처 본문이 실제로 보이는지로 본다.
  await expect(recordSheet.capture.pickButton).toBeVisible();
});

test('밀린 것을 캡처로 정리하면 복구 카드가 스스로 걷힌다', async ({
  home,
  page,
  prep,
  recordSheet,
}) => {
  await prep.addExpense({ amount: 9_000, daysAgo: AWAY_DAYS });

  // 앨범은 네이티브 기능이라 devtools 목에 사진을 심어 통과시킨다. 브릿지 코드는 실기기와 같다.
  await seedMockImages(CAPTURE_DATA_URI)(page);

  await home.open();
  await home.waitReady();
  // 짝을 안 부르면 다이얼이 안 걸린 채로 초록이 된다.
  expect(await mockImagesSeeded(page)).toBe(true);

  await expect(home.recovery.card).toBeVisible();
  await home.recovery.catchUpButton.click();
  await recordSheet.waitOpen();

  await recordSheet.capture.pick();
  await recordSheet.capture.save();
  await expect(recordSheet.capture.savedTitle).toHaveText(
    `${CAPTURE_SELECTED}건 저장했어요 · ${formatCurrency(CAPTURE_TOTAL)}`,
  );

  await recordSheet.capture.confirmButton.click();
  await recordSheet.waitClosed();

  // 새로고침 없이 걷힌다. 저장한 것 중 두 건이 오늘 날짜라 마지막 기록일이 오늘이 됐다.
  await expect(home.recovery.card).toHaveCount(0);
  for (const merchant of CAPTURE_TODAY) {
    await expect(home.today.row(merchant)).toBeVisible();
  }
});

test('복구 카드가 최근 이레 중 정리한 날을 세어 보여준다', async ({ home, prep }) => {
  // 창 안의 서로 다른 두 날. 같은 날에 두 건을 심으면 하루로 센다.
  await prep.addExpense({ amount: 9_000, daysAgo: 4 });
  await prep.addExpense({ amount: 7_000, daysAgo: 5 });

  await home.open();
  await home.waitReady();

  await expect(home.recovery.progressText).toHaveText(`이번 주 2/${WINDOW_DAYS}일 정리했어요`);
  // 서버가 준 2/7 = 0.2857 을 화면이 반올림한 값이다. 서버 계산과 화면 표시를 한 번에 되짚는다.
  expect(await home.recovery.gaugePercent()).toBe(29);
});

test('창 밖 기록만 있으면 지금부터 시작하자고 말한다', async ({ home, prep }) => {
  // 여드레 전은 이레 창 밖이다. 카드는 뜨지만 셀 날이 하루도 없다.
  await prep.addExpense({ amount: 9_000, daysAgo: 8 });

  await home.open();
  await home.waitReady();

  await expect(home.recovery.progressText).toHaveText('이번 주는 지금부터 시작이에요');
  expect(await home.recovery.gaugePercent()).toBe(0);
});

test('이틀만 비면 복구 카드가 뜨지 않는다', async ({ home, prep }) => {
  await prep.addExpense({ amount: 9_000, daysAgo: 2 });

  await home.open();
  // 다 그려진 뒤에 센다. 그리기 전에 세면 아직 안 그린 것을 '없다' 로 읽는다.
  await home.waitReady();

  await expect(home.recovery.card).toHaveCount(0);
  await expect(home.recovery.catchUpButton).toHaveCount(0);
  await expect(home.recovery.gauge).toHaveCount(0);

  // 카드만 없고 나머지는 평소 그대로다. 예산을 안 정했으니 히어로는 쓴 돈을 말한다.
  await expect(home.hero.label).toHaveText(`${MONTH_NUMBER}월 · 이번 달 쓴 돈`);
  await expect(home.hero.monthSpent).toBeVisible();
});
