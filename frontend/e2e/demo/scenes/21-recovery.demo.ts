import { formatCurrency } from '../../../src/shared/lib/format';
import { CAPTURE_DATA_URI, mockImagesSeeded, seedMockImages } from '../../support/deviceMock';
import { expect, test } from '../support/director';

/**
 * 며칠 비운 뒤 다시 열었을 때의 홈을 한 장면에 담는다.
 *
 * 순서는 카드가 하는 말 그대로다. 먼저 카드가 뜨는 조건(사흘 넘게 빔)을 만들고,
 * 무슨 말을 하는지 읽고, 그 버튼이 실제로 밀린 것을 정리해 카드를 스스로 걷는 데까지 간다.
 * 문구와 색만 보고 끝내면 '괜찮다고 말만 하는 카드' 와 구분되지 않는다.
 *
 * 여기서 보이는 것은 '며칠 빠졌는지' 가 아니다. 카드는 빠진 날을 세지 않고 채운 날만 센다.
 * 게이지가 경고색으로 가지 않는 것도 같은 약속이다.
 *
 * 캡처의 사진 인식은 아직 실제 모델이 아니라 규칙 기반 스텁이다. 어떤 사진을 넣어도 같은
 * 5건이 온다. 그래서 이 장면이 보여주는 것은 '얼마나 잘 알아듣는가' 가 아니라
 * '알아들은 것을 화면이 어떻게 다루는가' 다.
 *
 * 며칠 비운 상태는 화면으로 만들 수 없어 배경만 prep 으로 심는다. 누르는 것은 전부 화면에서 한다.
 */

/** 복구 카드는 사흘째부터 뜬다. 나흘·닷새 전이면 확실히 카드가 뜨는 자리다. */
const AWAY_DAYS = 4;
const EARLIER_DAYS = 5;
const AWAY_AMOUNT = 9_000;
const EARLIER_AMOUNT = 7_000;

/** 정리 진행을 세는 창. 오늘을 포함한 이레다. 서로 다른 두 날을 심었으니 2/7 이다. */
const WINDOW_DAYS = 7;
const RECORDED_DAYS = 2;
/** 서버가 준 2/7 = 0.2857 을 화면이 반올림한 값. 서버 계산과 화면 표시를 함께 되짚는다. */
const PROGRESS_PERCENT = 29;

/**
 * 캡처 스텁이 늘 내는 5건 중 서버가 스스로 켜 주는 넷. 확신이 낮은 카카오T 만 꺼진 채로 온다.
 * 오늘 날짜가 둘(스타벅스·GS25) 있어서, 저장하면 마지막 기록일이 오늘이 되고 카드가 걷힌다.
 */
const CAPTURE_ROWS = 5;
const CAPTURE_SELECTED = 4;
const CAPTURE_TOTAL = 4_500 + 3_200 + 8_000 + 32_900;

test('45 며칠 비운 뒤 돌아오면 복구 카드가 맞아준다', async ({
  demo,
  home,
  page,
  prep,
  recordSheet,
}) => {
  // 뒤에서 캡처 탭까지 간다. 앨범은 네이티브라 목에 사진을 미리 심어 둔다.
  await seedMockImages(CAPTURE_DATA_URI)(page);

  await home.open();
  await home.waitReady();
  // 짝을 안 부르면 다이얼이 안 걸린 채로 지나간다.
  expect(await mockImagesSeeded(page), '목에 사진이 안 심겼다').toBe(true);
  await demo.open('며칠 비운 뒤', '다그치지 않고, 밀린 것을 정리할 다음 한 걸음만 준다');

  await demo.step('기록이 하나도 없을 때는 복구 카드가 없다');
  await expect(home.recovery.card).toHaveCount(0);
  await demo.beat(2);

  await demo.step(`${AWAY_DAYS}일 전과 ${EARLIER_DAYS}일 전 기록만 남기고 홈을 다시 연다`);
  await prep.addExpense({ amount: AWAY_AMOUNT, daysAgo: AWAY_DAYS });
  await prep.addExpense({ amount: EARLIER_AMOUNT, daysAgo: EARLIER_DAYS });
  await home.open();
  await home.waitReady();
  await expect(home.recovery.card).toBeVisible();
  await demo.beat(3);

  await demo.step('카드가 먼저 하는 말은 괜찮다는 것이다');
  await expect(home.recovery.lead).toBeVisible();
  await expect(home.recovery.leadNext).toBeVisible();
  await demo.beat(3);

  await demo.step('며칠 빠졌는지, 연속이 끊겼는지는 화면 어디에도 적지 않는다');
  await expect(home.recovery.punishingText).toHaveCount(0);
  await demo.beat(3);

  await demo.step('빠진 날 대신 최근 이레 중 채운 날을 센다');
  await expect(home.recovery.progressText).toHaveText(
    `이번 주 ${RECORDED_DAYS}/${WINDOW_DAYS}일 정리했어요`,
  );
  expect(await home.recovery.gaugePercent()).toBe(PROGRESS_PERCENT);
  await demo.beat(3);

  await demo.step('게이지도 경고색으로 가지 않는다. 돌아온 것은 경고할 일이 아니다');
  const warning = await home.recovery.tokenColor('--color-amber-300');
  expect(await home.recovery.gaugeFillColor(), '복구 게이지가 경고색이다').not.toBe(warning);
  await demo.beat(3);

  await demo.step('밀린 내역 한 번에 정리를 누른다. 캡처 탭이 먼저 열려 있다');
  await home.recovery.catchUpButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.methodTab('캡처')).toHaveAttribute('aria-checked', 'true');
  await demo.beat(3);

  await demo.step('거래내역 캡처 한 장이면 며칠치가 한 번에 들어온다');
  await recordSheet.capture.pick();
  await expect(recordSheet.capture.rows).toHaveCount(CAPTURE_ROWS);
  await recordSheet.capture.save();
  await expect(recordSheet.capture.savedTitle).toHaveText(
    `${CAPTURE_SELECTED}건 저장했어요 · ${formatCurrency(CAPTURE_TOTAL)}`,
  );
  await demo.beat(3);

  await demo.step('오늘 것이 생겼으니 카드는 새로고침 없이 스스로 물러난다');
  await recordSheet.capture.confirmButton.click();
  await recordSheet.waitClosed();
  await expect(home.recovery.card).toHaveCount(0);
  await home.today.reveal();
  await expect(home.today.row('스타벅스')).toBeInViewport();
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
