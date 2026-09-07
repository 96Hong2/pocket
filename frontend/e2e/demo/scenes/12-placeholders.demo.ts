import { expect, test } from '../support/director';

import { ROUTES } from '../../../src/app/router/routes';
import { formatCurrency, shiftMonth } from '../../../src/shared/lib/format';
import { thisMonth } from '../../support/api';

/**
 * 지금 어디까지 만들어졌는지 둘러본다.
 *
 * 하나는 관리 탭이 데리고 있는 화면들이다. 목표·자산·카테고리 관리·앱 설정은 점선 카드가
 * 걷히고 실제로 손댈 수 있는 화면이 들어왔으니 눌러 본다.
 * 하나는 아직 들어가는 링크가 없는 화면과 없는 주소다. 점선 카드에 그 자리에 무엇이
 * 들어올지 한 줄로 적혀 있으니 그것을 읽어 준다.
 */

/** 라우터에 등록하지 않은 주소. 여기로 가면 NotFound 화면이 받는다. */
const MISSING_PATH = '/nope';

/** 홈으로 돌아온 뒤 히어로가 숫자를 그리게 하려고 미리 심어 두는 예산. */
const BUDGET = 500_000;

/** 자산 화면에서 화면으로 직접 적어 넣는 예적금과 부채. */
const CASH = 1_000_000;
const DEBT = 300_000;

/** 목표 화면에서 화면으로 직접 만드는 목표. 기한은 세 달 뒤로 둔다. */
const GOAL_TITLE = '제주도 여행';
const GOAL_TARGET = 5_000_000;
const GOAL_SAVED = 1_000_000;
const GOAL_DEADLINE = `${shiftMonth(thisMonth(), 3)}-28`;

test('20 관리 탭이 데리고 있는 화면들', async ({
  appShell,
  assets,
  goal,
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
  // 알림 설정은 화면이 아직 점선 자리표시자라 입구를 두지 않았다. 실물이 되면 되돌린다.
  await expect(appShell.subScreenLinks('관리 하위 화면')).toHaveText([
    '목표',
    '자산',
    '카테고리 관리',
    '앱 설정',
  ]);
  await demo.beat(2);

  await demo.step('먼저 목표로 들어간다. 점선 카드가 걷히고 모으는 중인 것을 보는 화면이 들어왔다');
  await appShell.followLink('목표');
  await appShell.expectScreen('목표', '모으고 싶은 것 하나만 정해요');
  await goal.waitReady();
  await demo.beat(2);

  await demo.step('아직 정한 목표가 없다. 만들라고 재촉하지 않고 다음 한 걸음만 보여준다');
  await expect(goal.emptyTitle).toBeVisible();
  await demo.beat(2);

  await demo.step('제주도 여행 500만원을 정하고, 이미 모아 둔 100만원을 함께 적는다');
  await goal.start({
    title: GOAL_TITLE,
    amount: GOAL_TARGET,
    deadline: GOAL_DEADLINE,
    initial: GOAL_SAVED,
  });
  await expect(goal.remaining).toHaveText(formatCurrency(GOAL_TARGET - GOAL_SAVED));
  await demo.beat(2);

  await demo.step('기한을 정해 뒀으니 매달 얼마씩 모으면 되는지도 함께 알려준다');
  await expect(goal.requiredMonthly).toBeVisible();
  // 모은 돈이 아직 한 번도 없어서 도달 예상은 숫자로 지어내지 않는다.
  await expect(goal.eta).toHaveText('아직 예상하기 어려워요');
  await demo.beat(3);

  await demo.step('모은 돈을 한 번 더하면 게이지와 남은 금액이 함께 움직인다');
  await goal.contribute({ amount: GOAL_SAVED });
  await expect(goal.remaining).toHaveText(formatCurrency(GOAL_TARGET - GOAL_SAVED * 2));
  await expect(goal.eta).toHaveText(/^이 속도면 \d+달 뒤$/);
  await demo.beat(3);

  await demo.step('시스템 뒤로가기로 관리로 돌아온다');
  await appShell.pressBack();
  await appShell.expectScreen('관리', '예산과 분류를 손봐요');
  await manage.waitReady();
  await demo.beat(2);

  await demo.step('목표를 정했더니 예산 자리에 생활비 제안이 생겼다');
  await manage.suggest.waitVisible();
  await demo.beat(2);

  await demo.step(
    '실수령에서 목표에 넣을 돈과 고정비를 먼저 뗀 금액이다. 누르지 않으면 저장되지 않는다',
  );
  // 지난달에 아무것도 안 적은 계정이라 실수령·고정비가 0 으로 어림된다.
  // 그래서 남는 생활비도 0 이고, 그 사실을 숫자로 지어내지 않고 그대로 보여준다.
  await expect(manage.suggest.basisNotes).toHaveCount(2);
  await expect(manage.suggest.foot).toBeVisible();
  await demo.beat(3);

  await demo.step('이번에는 자산으로 들어간다. 점선 카드가 걷히고 실제로 적는 화면이 들어왔다');
  await appShell.followLink('자산');
  await appShell.expectScreen('자산', '대략 알아도 충분해요. 나중에 언제든 바꿀 수 있어요');
  await assets.waitReady();
  await demo.beat(2);

  await demo.step('아직 한 줄도 없어서 다음 한 걸음만 보여준다. 계좌 연결은 없다');
  await expect(assets.emptyTitle).toBeVisible();
  await expect(assets.startButton).toBeVisible();
  await demo.beat(2);

  await demo.step('예적금 100만원을 적으면 순자산이 그 자리에서 생긴다');
  await assets.start({ group: '예적금·현금', name: '토스뱅크', amount: CASH });
  await expect(assets.netWorth).toHaveText(formatCurrency(CASH));
  await demo.beat(2);

  await demo.step('부채를 더하면 순자산이 줄어든다. 부채도 양수로 적고 빼는 것은 그룹이 정한다');
  await assets.add('부채', { name: '학자금', amount: DEBT });
  await expect(assets.netWorth).toHaveText(formatCurrency(CASH - DEBT));
  await expect(assets.breakdown).toHaveText(
    `자산 ${formatCurrency(CASH)} − 부채 ${formatCurrency(DEBT)}`,
  );
  await demo.beat(3);

  await demo.step('시스템 뒤로가기로 관리로 돌아온다');
  await appShell.pressBack();
  await appShell.expectScreen('관리', '예산과 분류를 손봐요');
  await manage.waitReady();
  await demo.beat(2);

  await demo.step('이번에는 카테고리 관리로 들어간다');
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

  await appShell.open(ROUTES.notifications);
  await demo.open('아직 문이 안 달린 화면', '주소로만 열리는 화면 하나와, 없는 주소로 갔을 때');

  // 목표와 자산은 여기서 빠졌다. 실물 화면이 되어 관리 탭에 입구가 생겼고,
  // 20 장면이 그 둘을 보여준다.
  await demo.step('알림 설정은 아직 자리만 잡혀 있다. 앱 설정에 있던 입구는 걷어 냈다');
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
