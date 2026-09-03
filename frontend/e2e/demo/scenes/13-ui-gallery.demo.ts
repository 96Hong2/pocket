import { expect, test } from '../support/director';

import {
  formatCurrency,
  formatMonthLabel,
  formatSignedCurrency,
} from '../../../src/shared/lib/format';
import { colors } from '../../../src/shared/tokens';
import { UiGalleryScreen } from '../../screens/UiGalleryScreen';

/**
 * 개발용 공용 UI 갤러리(/__demo)를 두 편으로 찍는다.
 *
 * 앞 편은 부품이다. 버튼·카드·칩·게이지를 보고, 월 스테퍼와 세그먼트와 토글은 실제로 눌러
 * 움직이는 것까지 본다. 뒤 편은 시트와 상태와 색이다.
 * 갤러리는 API 를 한 번도 부르지 않고 하드코딩 값만 그린다. 심을 배경 상태가 없다.
 */

/** 갤러리가 카드에 박아 둔 금액. 기대값은 화면과 같은 포맷 함수로 만든다. */
const CARD_AMOUNT = 412_000;

/** 스테퍼가 들고 있는 달. 오늘 날짜와 무관하게 갤러리가 고정으로 준다. */
const THIS_MONTH = '2026-09';
const PREV_MONTH = '2026-08';
const NEXT_MONTH = '2026-10';

/** `2026년 8월로 이동` 처럼 화살표 버튼에 붙는 이름. */
function moveTo(month: string): string {
  return `${formatMonthLabel(month)}로 이동`;
}

test('22 공용 UI 갤러리의 부품들', async ({ page, appShell, demo }) => {
  // 이 화면을 쓰는 장면이 이 파일뿐이라 픽스처로 올리지 않고 여기서 만든다.
  const gallery = new UiGalleryScreen(page);

  await gallery.open();
  await gallery.waitReady();
  await demo.open('공용 UI 갤러리', '앱이 쓰는 부품을 한자리에 모아 둔 개발용 화면이다');

  await demo.step('제품 화면이 아니라 부품 목록이다. 탭바도 없다');
  await gallery.expectDocumentTitle();
  await appShell.expectTabsHidden();
  await demo.beat(2);

  const buttons = await gallery.scrollTo('Button');
  await demo.step('버튼은 다섯 가지. 굵기와 테두리로 무게가 갈린다');
  await expect(buttons.buttons).toHaveCount(5);
  await expect(buttons.button('기록하기')).toBeEnabled();
  await expect(buttons.button('예산 정하기')).toBeVisible();
  await expect(buttons.button('나중에 할게요')).toBeVisible();
  // 눌리지 않는 것도 같은 자리에 둔다. 흐려진 모양이 곧 못 누른다는 표시다.
  await expect(buttons.button('비활성')).toBeDisabled();
  await demo.beat(2);

  const card = await gallery.scrollTo('Card / SageCard');
  await demo.step('카드 안에 금액과 게이지가 함께 들어간다');
  await expect(card.text('남은 예산')).toBeVisible();
  await expect(card.text(formatCurrency(CARD_AMOUNT))).toBeVisible();
  await expect(card.gauge('예산 사용률 62%')).toHaveAttribute('aria-valuenow', '62');
  await demo.beat(2);

  await demo.step('그 아래 세이지 카드는 코치 한마디를 얹는 자리다');
  await expect(card.text('오늘까지 페이스대로 쓰고 있어요.')).toBeVisible();
  await demo.beat(2);

  const chips = await gallery.scrollTo('Chip');
  await demo.step('칩 다섯 가지. 색이 곧 그 줄의 상태다');
  for (const label of ['제외됨', '이체', '주의', '이번 주 3일째', '코치 한마디']) {
    await expect(chips.text(label)).toBeVisible();
  }
  await demo.beat(2);

  const gauges = await gallery.scrollTo('Gauge');
  await demo.step('게이지는 굵기가 셋이다');
  await expect(gauges.gauges).toHaveCount(3);
  await expect(gauges.gauge('10px 게이지')).toHaveAttribute('aria-valuenow', '45');
  await expect(gauges.gauge('8px 게이지')).toHaveAttribute('aria-valuenow', '80');
  await demo.beat(2);

  await demo.step('예산을 넘기면 막대는 100 에서 멈추고 색만 앰버로 바뀐다');
  // 넘긴 양을 막대 길이로 그리면 100% 를 넘는 자리가 생긴다. 넘긴 것은 색이 말한다.
  await expect(gauges.gauge('6px 게이지, 예산 초과')).toHaveAttribute('aria-valuenow', '100');
  await demo.beat(2);

  const months = await gallery.scrollTo('MonthStepper');
  await demo.step('월 스테퍼 둘이 같은 달을 본다. 다음 달은 막혀 있다');
  await expect(months.text(formatMonthLabel(THIS_MONTH))).toHaveCount(2);
  // 스테퍼가 둘이라 같은 이름의 화살표도 둘씩이다. 위쪽 것을 누른다.
  await expect(months.button(moveTo(NEXT_MONTH)).first()).toBeDisabled();
  await demo.beat(2);

  await demo.step('왼쪽 화살표로 지난달로 옮긴다');
  await months.button(moveTo(PREV_MONTH)).first().click();
  // 둘이 한 상태를 나눠 쓰므로 위쪽만 눌러도 아래쪽 라벨까지 함께 바뀐다.
  await expect(months.text(formatMonthLabel(PREV_MONTH))).toHaveCount(2);
  await demo.beat(2);

  await demo.step('오른쪽 화살표로 이번 달로 돌아온다');
  await months.button(moveTo(THIS_MONTH)).first().click();
  await expect(months.text(formatMonthLabel(THIS_MONTH))).toHaveCount(2);
  await demo.beat(2);

  const controls = await gallery.scrollTo('SegmentedControl / Toggle');
  await demo.step('세그먼트를 옮기면 흰 알약이 그 칸으로 미끄러진다');
  await expect(controls.radio('키패드')).toHaveAttribute('aria-checked', 'true');
  await controls.radio('문장').click();
  await expect(controls.radio('문장')).toHaveAttribute('aria-checked', 'true');
  await expect(controls.radio('키패드')).toHaveAttribute('aria-checked', 'false');
  await demo.beat();
  await controls.radio('캡처').click();
  await expect(controls.radio('캡처')).toHaveAttribute('aria-checked', 'true');
  await demo.beat(2);

  await demo.step('토글은 껐다 켜면 손잡이가 좌우로 미끄러진다');
  const notify = controls.toggle('기록 알림 받기');
  await expect(notify).toHaveAttribute('aria-checked', 'true');
  await notify.click();
  await expect(notify).toHaveAttribute('aria-checked', 'false');
  await demo.beat();
  await notify.click();
  await expect(notify).toHaveAttribute('aria-checked', 'true');
  await demo.beat(2);

  const rows = await gallery.scrollTo('TransactionRow / Amount');
  await demo.step('거래 한 줄은 네 가지 모양이다');
  await expect(rows.text('김밥천국')).toBeVisible();
  await expect(rows.text(formatCurrency(8_500))).toBeVisible();
  // 수입만 부호가 붙는다. 나머지는 부호 없이 적는다.
  await expect(rows.text('월급')).toBeVisible();
  await expect(rows.text(formatSignedCurrency(3_200_000))).toBeVisible();
  await demo.beat(2);

  await rows.revealText('적금 이체');
  await demo.step('이체는 금액이 눌리고, 예산에서 뺀 줄은 통째로 흐려진다');
  await expect(rows.text('적금 이체')).toBeInViewport();
  await expect(rows.text(formatCurrency(300_000))).toBeVisible();
  await expect(rows.text('유니클로')).toBeInViewport();
  await expect(rows.text(formatCurrency(49_000))).toBeVisible();
  await demo.beat(2);

  await rows.revealText('유니클로');
  await demo.step('누를 수 있는 줄은 마지막 하나뿐이다');
  // 여기를 누르면 바텀시트가 열린다. 시트는 다음 영상에서 따로 본다.
  await expect(rows.buttons).toHaveCount(1);
  await demo.beat(2);

  const avatars = await gallery.scrollTo('CategoryAvatar');
  await demo.step('같은 아이콘을 44·48·54·58px 로 나란히 놓았다');
  // 아바타 이미지는 장식이라 접근성 이름이 없다. 크기 차이는 눈으로 본다.
  await expect(avatars.heading).toBeVisible();
  await demo.clearStep();
  await demo.beat(3);
});

test('23 갤러리의 바텀시트와 상태와 색', async ({ page, demo }) => {
  const gallery = new UiGalleryScreen(page);

  await gallery.open();
  await gallery.waitReady();
  await demo.open('시트와 상태와 색', '바텀시트가 닫히는 길 셋, 상태 여섯 가지, 색 토큰');

  const sheetSection = await gallery.scrollTo('BottomSheet');
  await demo.step('BottomSheet 섹션까지 내려간다');
  await expect(sheetSection.button('바텀시트 열기')).toBeVisible();
  await demo.beat(2);

  await demo.step('누르면 아래에서 시트가 올라오고 뒤가 어두워진다');
  await sheetSection.button('바텀시트 열기').click();
  await gallery.sheet.waitOpen();
  await expect(gallery.sheet.lead).toBeVisible();
  await demo.beat(2);

  // 닫는 세 가지 길을 차례로 본다.
  // 열림과 닫힘 사이에 머무는 시간이 없으면 순식간에 지나가 사람 눈에는 아무 일도 안 보인다.
  await demo.step('첫째 길. 헤더 오른쪽 X 로 닫는다');
  await gallery.sheet.closeButton.click();
  await gallery.sheet.waitClosed();
  await demo.beat(2);

  await sheetSection.button('바텀시트 열기').click();
  await gallery.sheet.waitOpen();
  await expect(gallery.sheet.lead).toBeVisible();
  await demo.step('둘째 길. 다시 열어 Esc 를 누른다');
  await gallery.sheet.closeByEsc();
  await gallery.sheet.waitClosed();
  await demo.beat(2);

  // 딤을 눌러도 닫히지만 딤에는 잡을 이름이 없어 시트 안 저장으로 대신한다.
  await sheetSection.button('바텀시트 열기').click();
  await gallery.sheet.waitOpen();
  await expect(gallery.sheet.lead).toBeVisible();
  await demo.step('셋째 길. 시트 안 버튼으로도 닫힌다');
  await gallery.sheet.saveButton.click();
  await gallery.sheet.waitClosed();
  await demo.beat(2);

  const states = await gallery.scrollTo('상태 컴포넌트');
  await demo.step('상태 컴포넌트는 여섯 장이 같은 틀을 쓴다');
  await expect(states.states).toHaveCount(6);
  await expect(states.text('아직 기록이 없어요')).toBeVisible();
  await expect(states.text('첫 기록은 10초면 끝나요.')).toBeVisible();
  await demo.beat(2);

  await demo.step('오류는 탓하지 않고 다시 시도만 준다');
  await states.text('지금은 불러오지 못했어요').scrollIntoViewIfNeeded();
  await expect(states.text('잠깐 연결이 흔들렸을 수 있어요. 다시 시도해 주세요.')).toBeVisible();
  // 다시 시도는 오류와 권한 거부 두 곳에 있다.
  await expect(states.button('다시 시도')).toHaveCount(2);
  await demo.beat(2);

  await demo.step('로딩은 목록 자리를 스켈레톤으로 미리 잡거나 스피너 하나로 돈다');
  await states.text('사진 접근이 꺼져 있어요').scrollIntoViewIfNeeded();
  await expect(states.loadings).toHaveCount(2);
  // 스켈레톤과 스피너는 계속 움직인다. 멈춘 화면으로는 안 보이니 오래 머문다.
  await demo.beat(4);

  await demo.step('권한이 꺼졌을 때와 앱 버전이 낮을 때도 같은 틀이다');
  await states.text('이 버전에서는 아직 안 되는 기능이에요').scrollIntoViewIfNeeded();
  await expect(states.text('이 버전에서는 아직 안 되는 기능이에요')).toBeVisible();
  // 못 하게 막고 끝내지 않는다. 그 자리에서 갈 수 있는 다른 길을 함께 준다.
  await expect(states.button('직접 입력')).toBeVisible();
  await demo.beat(2);

  const tokens = await gallery.scrollTo('색 토큰');
  await demo.step('맨 아래는 색 토큰이다. 이름과 색을 함께 놓았다');
  // 토큰 이름은 정본(src/shared/tokens)에서 가져온다. 손으로 적으면 늘고 줄 때 어긋난다.
  for (const name of Object.keys(colors)) {
    await expect(tokens.text(name)).toBeVisible();
  }
  await demo.beat(2);

  // 램프 칸에는 글자도 role 도 없다. 섹션 아래끝을 화면에 올려야 그 줄이 보인다.
  await tokens.revealEnd();
  await demo.step('그 아래 도넛 램프 아홉 색이 마지막 줄이다');
  await expect(tokens.self).toBeInViewport();
  await demo.beat(2);
  await demo.clearStep();
  await demo.beat(3);
});
