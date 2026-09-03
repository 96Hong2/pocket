import { expect, test } from '../support/director';

import { ROUTES } from '../../../src/app/router/routes';
import { formatCurrency } from '../../../src/shared/lib/format';

/**
 * 아직 자리만 잡힌 화면들을 둘러본다.
 *
 * 누르면 무엇이 일어나는 장면이 아니라, 지금 어디까지 만들어졌는지 보여주는 장면이다.
 * 점선 카드마다 그 자리에 무엇이 들어올지 한 줄로 적혀 있으니 그것을 읽어 준다.
 * 하나는 관리 탭이 데리고 있는 화면들, 하나는 아직 들어가는 링크가 없는 화면과 없는 주소다.
 */

/** 라우터에 등록하지 않은 주소. 여기로 가면 NotFound 화면이 받는다. */
const MISSING_PATH = '/nope';

/** 홈으로 돌아온 뒤 히어로가 숫자를 그리게 하려고 미리 심어 두는 예산. */
const BUDGET = 500_000;

test('20 관리 탭이 데리고 있는 화면들', async ({ appShell, home, demo }) => {
  await home.open();
  await home.waitReady();
  await demo.open('관리 탭 아래', '카테고리 관리·앱 설정·알림 설정이 어디까지 왔는지 본다');

  await demo.step('하단 관리 탭을 누른다');
  await appShell.goToTab('관리');
  await appShell.expectScreen('관리', '예산과 분류를 손봐요');
  await appShell.expectCurrentTab('관리');
  await demo.beat(2);

  await demo.step('점선 카드가 이번 달 예산이 들어올 자리를 잡아 뒀다');
  await expect(appShell.placeholderLabel('이번 달 예산')).toBeVisible();
  await expect(appShell.placeholderNote('예산 금액과 카테고리 예산을 고친다.')).toBeVisible();
  await demo.beat(2);

  await demo.step('그 아래 네 줄이 하위 화면으로 들어가는 입구다');
  await expect(appShell.subScreenLinks('관리 하위 화면')).toHaveText([
    '카테고리 관리',
    '자산',
    '목표',
    '앱 설정',
  ]);
  await demo.beat(2);

  await demo.step('먼저 카테고리 관리로 들어간다');
  await appShell.followLink('카테고리 관리');
  await appShell.expectScreen('카테고리 관리', '쓰는 분류만 남겨요');
  await demo.beat(2);

  await demo.step('기본 카테고리와 직접 만든 것이 여기 함께 놓일 자리다');
  await expect(
    appShell.placeholderNote('기본 카테고리와 직접 만든 것이 함께 나온다.'),
  ).toBeVisible();
  await demo.beat(2);

  await demo.step('탭 루트가 아니라 하단 탭바가 통째로 빠졌다');
  await appShell.expectTabsHidden();
  // 상단바는 플랫폼이 그린다. 앱이 넘기는 것은 이 제목 하나다.
  await appShell.expectDocumentTitle('카테고리 관리');
  await demo.beat(2);

  await demo.step('화면 안에 뒤로가기가 없다. 토스 앱의 시스템 뒤로가기로 되돌아간다');
  await appShell.pressBack();
  await appShell.expectScreen('관리', '예산과 분류를 손봐요');
  await appShell.expectTabsVisible();
  await demo.beat(2);

  await demo.step('이번에는 앱 설정으로 들어간다');
  await appShell.followLink('앱 설정');
  await appShell.expectScreen('앱 설정', '예산 기간과 알림을 정해요');
  await demo.beat(2);

  await demo.step('예산 기간은 달력 월로 고정이고, 자동 이어쓰기만 켜고 끄게 된다');
  await expect(appShell.placeholderLabel('예산 기간')).toBeVisible();
  await expect(
    appShell.placeholderNote('기간은 달력 월로 고정이다. 자동 이어쓰기 켜기·끄기만 둔다.'),
  ).toBeVisible();
  await demo.beat(2);

  await demo.step('설정 안에서 한 단계 더 들어간다');
  await expect(appShell.subScreenLinks('설정 하위 화면')).toHaveText(['알림 설정']);
  await appShell.followLink('알림 설정');
  await appShell.expectScreen('알림 설정', 'P1 화면이에요. 지금은 자리만 잡아 뒀어요');
  await appShell.expectDocumentTitle('알림 설정');
  await demo.beat(2);

  await demo.step('라우터에서 가장 깊은 곳이다. 관리 → 앱 설정 → 알림 설정');
  await expect(appShell.placeholderLabel('알림 항목')).toBeVisible();
  await expect(appShell.placeholderNote('받을 알림과 시각을 고른다.')).toBeVisible();
  await demo.beat(2);

  await demo.step('뒤로가기는 한 칸씩 올라간다. 앱 설정을 거쳐 관리로 돌아온다');
  await appShell.pressBack();
  await appShell.expectScreen('앱 설정', '예산 기간과 알림을 정해요');
  await appShell.pressBack();
  await appShell.expectScreen('관리', '예산과 분류를 손봐요');
  await appShell.expectTabsVisible();
  await demo.clearStep();
  await demo.beat(3);
});

test('21 아직 입구가 없는 화면과 없는 주소', async ({ appShell, home, prep, demo }) => {
  // 마지막에 홈으로 돌아오면 히어로가 이 예산으로 숫자를 그린다.
  await prep.setBudget(BUDGET);

  await appShell.open(ROUTES.calendar);
  await demo.open('아직 문이 안 달린 화면들', '주소로만 열리는 화면 셋과, 없는 주소로 갔을 때');

  await demo.step('월간 달력. 홈에서 들어갈 화면인데 아직 입구가 안 붙었다');
  await appShell.expectScreen('월간 달력', '날짜별로 얼마 썼는지 한눈에 봐요');
  await appShell.expectDocumentTitle('월간 달력');
  await demo.beat(2);

  await demo.step('월 이동, 달력 격자, 선택한 날 내역. 세 자리가 잡혀 있다');
  await expect(appShell.placeholderLabel('월 이동')).toBeVisible();
  await expect(appShell.placeholderLabel('달력 격자')).toBeVisible();
  await expect(appShell.placeholderNote('TransactionRow 목록이 들어간다.')).toBeVisible();
  await appShell.expectTabsHidden();
  await demo.beat(2);

  await appShell.open(ROUTES.goal);
  await demo.step('목표. P1 이라 모델만 있고 화면은 자리만 잡아 뒀다');
  await appShell.expectScreen('목표', 'P1 화면이에요. 지금은 자리만 잡아 뒀어요');
  await expect(appShell.placeholderNote('모은 금액과 게이지가 들어간다.')).toBeVisible();
  await demo.beat(2);

  await appShell.open(ROUTES.assets);
  await demo.step('자산도 같다. 순자산과 자산 목록, 두 자리만 있다');
  await appShell.expectScreen('자산', 'P1 화면이에요. 지금은 자리만 잡아 뒀어요');
  await expect(appShell.placeholderNote('자산 합계에서 부채 합계를 뺀 값이다.')).toBeVisible();
  await expect(appShell.placeholderLabel('자산 목록')).toBeVisible();
  await appShell.expectTabsHidden();
  await demo.beat(2);

  await appShell.open(MISSING_PATH);
  await demo.step('이번에는 등록하지 않은 주소로 들어가 본다');
  await appShell.expectScreen('없는 화면이에요', '주소가 바뀌었을 수 있어요.');
  await demo.beat(2);

  await demo.step('하얀 빈 화면이 아니다. 되돌아갈 링크를 함께 준다');
  // 상단바는 토스 앱이 그리는 것이라 미니앱 녹화에는 잡히지 않는다.
  // 화면에서 보이지 않는 것을 자막으로 말하지 않고, 넘기는 값만 여기서 확인한다.
  // 이 경로만 SCREEN_TITLES 에 항목이 없어 기본값이 그대로 쓰인다.
  await appShell.expectDocumentTitle('10초 가계부');
  await appShell.expectTabsHidden();
  await demo.beat(2);

  await demo.step('홈으로 가기를 누르면 제자리로 돌아온다');
  await appShell.followLink('홈으로 가기');
  await home.waitReady();
  // 앞에서 심어 둔 예산이 그대로 그려진다. 없는 주소를 다녀왔다고 상태가 날아가지 않는다.
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET));
  await appShell.expectTabsVisible();
  await appShell.expectCurrentTab('홈');
  await demo.clearStep();
  await demo.beat(3);
});
