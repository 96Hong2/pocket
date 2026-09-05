import { formatCurrency, formatSignedCurrency, toLedgerDate } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * 앱 설정과 개인정보처리방침.
 *
 * 설정 화면에서 확인할 것은 "고른 것이 홈에 그대로 나타나는가" 다. 그래서 고르는 것도
 * 결과를 보는 것도 화면으로 하고, 금액이 될 배경만 API 로 심는다.
 *
 * 없어진 것(예산 기간·알림 진입점)은 세어서 못 박는다. 있는 것만 확인하면 입구가 슬쩍
 * 되살아나도 아무 검사가 깨지지 않는다.
 */

/** 히어로 라벨 앞에 붙는 달. 기기 시간대가 아니라 가계부 시간대로 얻는다. */
const MONTH_NUMBER = Number(toLedgerDate(new Date()).slice(5, 7));

const INCOME = 2_000_000;
const EXPENSE = 500_000;
const DELTA = INCOME - EXPENSE;
const BUDGET = 1_000_000;

test('홈 표시 방식을 바꾸면 홈이 그대로 바뀐다', async ({
  appShell,
  home,
  manage,
  settings,
  prep,
}) => {
  await prep.addTransaction({ amount: INCOME, daysAgo: 0, type: 'income' });
  await prep.addExpense({ amount: EXPENSE, daysAgo: 0 });

  await test.step('예산을 정하기 전이라 홈은 쓴 돈을 먼저 보여준다', async () => {
    await home.open();
    await home.waitReady();

    await expect(settings.heroResult.label).toHaveText(`${MONTH_NUMBER}월 · 이번 달 쓴 돈`);
    await expect(home.hero.monthSpent).toHaveText(formatCurrency(EXPENSE));
    await expect(settings.heroResult.delta).toHaveCount(0);
  });

  await test.step('앱 설정에서 수입·지출로 바꾼다', async () => {
    await appShell.goToTab('관리');
    await manage.waitReady();
    await appShell.followLink('앱 설정');
    await settings.waitReady();

    // 예산을 아직 안 정한 상태다. 미리보기가 그 사실까지 말해야 홈과 같은 말이 된다.
    await expect(settings.preview).toHaveText(
      '아직 예산을 안 정해서, 홈 맨 위에 이번 달 쓴 돈이 보여요.',
    );
    await settings.chooseHero('수입·지출');
    await expect(settings.preview).toHaveText('홈 맨 위에 이번 달 차액이 먼저 보여요.');
  });

  await test.step('새로고침 없이 홈으로 돌아와도 차액이 먼저 보인다', async () => {
    await appShell.pressBack();
    await appShell.goToTab('홈');
    await home.waitReady();

    await expect(settings.heroResult.label).toHaveText(`${MONTH_NUMBER}월 · 이번 달 차액`);
    // 부분일치로 보면 안 된다. `500,000원` 이 `+1,500,000원` 안에 들어 있어 틀린 값도 통과한다.
    await expect(settings.heroResult.delta).toHaveText(formatSignedCurrency(DELTA));
    await expect(settings.heroResult.income).toHaveText(formatSignedCurrency(INCOME));
    await expect(home.hero.monthSpent).toHaveText(formatCurrency(EXPENSE));
  });

  await test.step('남은 예산으로 되돌리면 홈도 원래대로 온다', async () => {
    await appShell.goToTab('관리');
    await manage.waitReady();
    await appShell.followLink('앱 설정');
    await settings.waitReady();

    await settings.chooseHero('남은 예산');
    await expect(settings.preview).toHaveText(
      '아직 예산을 안 정해서, 홈 맨 위에 이번 달 쓴 돈이 보여요.',
    );

    await appShell.pressBack();
    await appShell.goToTab('홈');
    await home.waitReady();

    // 아직 예산을 정하지 않았으므로 남은 예산 자리에는 쓴 돈이 그대로 온다.
    await expect(settings.heroResult.label).toHaveText(`${MONTH_NUMBER}월 · 이번 달 쓴 돈`);
    await expect(home.hero.monthSpent).toHaveText(formatCurrency(EXPENSE));
    await expect(settings.heroResult.delta).toHaveCount(0);
  });
});

test('예산을 정해 두면 수입·예산 갈래가 홈에 그대로 나온다', async ({
  appShell,
  home,
  settings,
  prep,
}) => {
  // 세 갈래 중 이것만 예산이 있어야 성립한다. 안 눌러 보면 값 배선이 바뀌어도 아무도 모른다.
  await prep.addTransaction({ amount: INCOME, daysAgo: 0, type: 'income' });
  await prep.addExpense({ amount: EXPENSE, daysAgo: 0 });
  await prep.setBudget(BUDGET);

  await settings.open();
  await settings.waitReady();
  await settings.chooseHero('수입·예산');
  await expect(settings.preview).toHaveText('홈 맨 위에 번 돈과 남은 예산이 함께 보여요.');

  // 앱 설정은 하위 화면이라 탭바가 없다. 관리로 한 단 나온 뒤에 홈으로 건너간다.
  await appShell.pressBack();
  await appShell.goToTab('홈');
  await home.waitReady();

  await expect(settings.heroResult.label).toHaveText(`${MONTH_NUMBER}월 · 번 돈과 남은 예산`);
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - EXPENSE));
  await expect(settings.heroResult.income).toHaveText(formatSignedCurrency(INCOME));
  // 예산이 걸린 갈래라 게이지도 함께 온다. 차액은 이 갈래에 없다.
  await expect(home.hero.gauge).toBeVisible();
  await expect(settings.heroResult.delta).toHaveCount(0);
});

test('첫 사용 때 홈 표시 방식을 묻지 않는다', async ({ home, settings }) => {
  // 아무것도 심지 않는다. 익명키 격리가 매 테스트 새 사용자를 만든다.
  await home.open();
  await home.waitReady();

  // 처음 온 사람에게 설정부터 고르라고 하지 않는다. 물어보는 자리가 화면에 아예 없다.
  await expect(settings.anyDialog).toHaveCount(0);
  await expect(settings.anyChoiceGroup).toHaveCount(0);

  // 설정 화면을 한 번도 거치지 않았고, 서버가 주는 기본값 그대로 쓴 돈을 그린다.
  await expect(settings.heroResult.label).toHaveText(`${MONTH_NUMBER}월 · 이번 달 쓴 돈`);
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(0));
  await expect(home.hero.remainingBudget).toHaveCount(0);
  // 설정을 **받아서** 이 화면인지 못 받아서 떨어진 것인지 갈라 본다. 폴백 화면이 서버
  // 기본값과 같은 모양이라, 이 줄이 없으면 설정 조회가 통째로 깨져도 이 검사가 초록이다.
  await expect(home.hero.preferencesNotice).toHaveCount(0);
});

test('개인정보처리방침 링크가 실제로 도착한다', async ({ appShell, settings }) => {
  await settings.open();
  await settings.waitReady();

  await expect(settings.captureNotice).toHaveText(
    '캡처 원본은 정리 직후 지워져요. 저장되는 것은 날짜, 금액, 상호, 분류처럼 기록에 필요한 것뿐이에요.',
  );
  await expect(settings.privacyLink).toBeVisible();

  await appShell.followLink('개인정보처리방침');

  // 링크가 걸려 있는 것으로 끝내지 않는다. 도착한 자리에 실제 화면이 있는지까지 본다.
  await appShell.expectScreen('개인정보처리방침', '무엇을 저장하고 무엇을 안 남기는지 적어 뒀어요');
  await appShell.expectDocumentTitle('개인정보처리방침');
  await expect(settings.text(/^캡처와 영수증 원본 이미지는 저장하지 않아요\./)).toHaveText(
    '캡처와 영수증 원본 이미지는 저장하지 않아요. 서버가 파일로 옮겨 적지 않고, 분석이 끝나는 순간 사라져요.',
  );

  // 화면 안에 뒤로가기가 없다. 토스 앱의 시스템 뒤로가기로 앱 설정에 돌아온다.
  await appShell.pressBack();
  await appShell.expectScreen('앱 설정', '홈에 무엇을 먼저 보여줄지 정해요');
  await settings.waitReady();
});

test('예산 시작일과 알림 진입점이 없다', async ({ appShell, settings }) => {
  await settings.open();
  await settings.waitReady();

  await appShell.expectScreen('앱 설정', '홈에 무엇을 먼저 보여줄지 정해요');

  // 예산 기간은 달력 월로 고정이라 고를 자리를 두지 않는다.
  await expect(settings.text(/예산 시작일|예산 기간/)).toHaveCount(0);

  // 하위 화면은 개인정보처리방침 하나뿐이다. 알림 설정 입구가 되살아나면 이 줄이 먼저 깨진다.
  await expect(appShell.subScreenLinks('설정 하위 화면')).toHaveText(['개인정보처리방침']);
});
