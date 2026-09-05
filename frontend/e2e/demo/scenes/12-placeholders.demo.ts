import { expect, test } from '../support/director';

import { ROUTES } from '../../../src/app/router/routes';
import { formatCurrency } from '../../../src/shared/lib/format';

/**
 * 지금 어디까지 만들어졌는지 둘러본다.
 *
 * 하나는 관리 탭이 데리고 있는 화면들이다. 카테고리 관리와 앱 설정은 점선 카드가 걷히고
 * 실제로 손댈 수 있는 화면이 들어왔으니 눌러 본다.
 * 하나는 아직 들어가는 링크가 없는 화면과 없는 주소다. 점선 카드에 그 자리에 무엇이
 * 들어올지 한 줄로 적혀 있으니 그것을 읽어 준다.
 */

/** 라우터에 등록하지 않은 주소. 여기로 가면 NotFound 화면이 받는다. */
const MISSING_PATH = '/nope';

/** 홈으로 돌아온 뒤 히어로가 숫자를 그리게 하려고 미리 심어 두는 예산. */
const BUDGET = 500_000;

test('20 관리 탭이 데리고 있는 화면들', async ({
  appShell,
  home,
  manage,
  categories,
  settings,
  demo,
}) => {
  await home.open();
  await home.waitReady();
  await demo.open('관리 탭 아래', '카테고리 관리와 앱 설정이 어디까지 왔는지 본다');

  await demo.step('하단 관리 탭을 누른다');
  await appShell.goToTab('관리');
  await appShell.expectScreen('관리', '예산과 분류를 손봐요');
  await appShell.expectCurrentTab('관리');
  await demo.beat(2);

  await demo.step('점선 카드가 있던 자리에 예산 섹션이 들어와 있다');
  await manage.waitReady();
  await expect(manage.total.startButton).toBeVisible();
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
  await appShell.expectScreen('카테고리 관리', '내가 쓰는 카테고리만 남겨요');
  await categories.waitReady();
  await demo.beat(2);

  await demo.step('점선 카드가 걷히고 기본 카테고리와 내가 만든 카테고리가 자리로 갈렸다');
  await expect(categories.basicSection).toBeVisible();
  await expect(categories.mineSection).toBeVisible();
  await demo.beat(2);

  await demo.step('아직 만든 것이 없어 아래 자리는 비어 있다. 만들기는 맨 위 버튼으로 한다');
  await expect(categories.emptyNotice).toBeVisible();
  await expect(categories.addButton).toBeVisible();
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
  await appShell.expectScreen('앱 설정', '홈에 무엇을 먼저 보여줄지 정해요');
  await settings.waitReady();
  await demo.beat(2);

  await demo.step('홈 맨 위에 무엇을 크게 보여줄지 세 갈래 중에 고른다');
  // 이 계정은 예산을 아직 안 정했다. 되짚는 한 줄이 그 사실까지 말해 홈과 같은 말이 된다.
  await expect(settings.preview).toHaveText(
    '아직 예산을 안 정해서, 홈 맨 위에 이번 달 쓴 돈이 보여요.',
  );
  await demo.beat(2);

  await demo.step('수입·지출로 바꾸면 아래 한 줄이 결과를 말로 되짚어 준다');
  await settings.chooseHero('수입·지출');
  await expect(settings.preview).toHaveText('홈 맨 위에 이번 달 차액이 먼저 보여요.');
  await demo.beat(2);

  await demo.step('설정 안에서 한 단계 더 들어간다. 하위 화면은 개인정보처리방침 하나다');
  await expect(appShell.subScreenLinks('설정 하위 화면')).toHaveText(['개인정보처리방침']);
  await appShell.followLink('개인정보처리방침');
  await appShell.expectScreen('개인정보처리방침', '무엇을 저장하고 무엇을 안 남기는지 적어 뒀어요');
  await appShell.expectDocumentTitle('개인정보처리방침');
  await demo.beat(2);

  // 관리 → 앱 설정 → 개인정보처리방침. 라우터에서 가장 깊은 곳이다.
  await demo.step('사진 원본을 남기지 않는다는 것을 여기서 밝힌다');
  await expect(settings.text(/^캡처와 영수증 원본 이미지는 저장하지 않아요\./)).toBeVisible();
  await demo.beat(2);

  await demo.step('뒤로가기는 한 칸씩 올라간다. 앱 설정을 거쳐 관리로 돌아온다');
  await appShell.pressBack();
  await appShell.expectScreen('앱 설정', '홈에 무엇을 먼저 보여줄지 정해요');
  await appShell.pressBack();
  await appShell.expectScreen('관리', '예산과 분류를 손봐요');
  await appShell.expectTabsVisible();
  await demo.clearStep();
  await demo.beat(3);
});

test('21 아직 입구가 없는 화면과 없는 주소', async ({ appShell, home, prep, demo }) => {
  // 마지막에 홈으로 돌아오면 히어로가 이 예산으로 숫자를 그린다.
  await prep.setBudget(BUDGET);

  await appShell.open(ROUTES.goal);
  await demo.open('아직 문이 안 달린 화면들', '주소로만 열리는 화면 셋과, 없는 주소로 갔을 때');

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

  await appShell.open(ROUTES.notifications);
  await demo.step('알림 설정도 자리만 잡혀 있다. 앱 설정에 있던 입구는 걷어 냈다');
  await appShell.expectScreen('알림 설정', 'P1 화면이에요. 지금은 자리만 잡아 뒀어요');
  await expect(appShell.placeholderLabel('알림 항목')).toBeVisible();
  await expect(appShell.placeholderNote('받을 알림과 시각을 고른다.')).toBeVisible();
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
