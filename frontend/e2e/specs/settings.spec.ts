import { formatCurrency, formatSignedCurrency, toLedgerDate } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * 앱 설정과 개인정보처리방침.
 *
 * 설정 화면에서 확인할 것은 "고른 것이 홈에 그대로 나타나는가" 다. 그래서 고르는 것도
 * 결과를 보는 것도 화면으로 하고, 금액이 될 배경만 API 로 심는다.
 *
 * 없어진 것(예산 기간)과 하위 화면 목록은 세어서 못 박는다. 있는 것만 확인하면 입구가
 * 슬쩍 늘거나 줄어도 아무 검사가 깨지지 않는다.
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
  // 예산이 있어야 세 갈래가 서로 다른 화면이 된다. 없으면 둘이 같은 그림이라 바뀐 것을 못 본다.
  await prep.setBudget(BUDGET);

  await test.step('예산이 있으니 홈은 남은 예산을 먼저 보여준다', async () => {
    await home.open();
    await home.waitReady();

    await expect(settings.heroResult.label).toHaveText(`${MONTH_NUMBER}월 · 남은 예산`);
    await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - EXPENSE));
    await expect(settings.heroResult.delta).toHaveCount(0);
  });

  await test.step('앱 설정에서 수입·지출로 바꾼다', async () => {
    await appShell.goToTab('관리');
    await manage.waitReady();
    await appShell.followRow('앱 설정');
    await settings.waitReady();

    await expect(settings.preview).toHaveText('홈 맨 위에 남은 예산이 먼저 보여요.');
    await settings.chooseHero('수입·지출');
    await expect(settings.preview).toHaveText('홈 맨 위에 이번 달 남은 돈이 먼저 보여요.');
  });

  await test.step('새로고침 없이 홈으로 돌아와도 남은 돈이 먼저 보인다', async () => {
    await appShell.pressBack();
    await appShell.goToTab('홈');
    await home.waitReady();

    await expect(settings.heroResult.label).toHaveText(`${MONTH_NUMBER}월 · 이번 달 남은 돈`);
    // 부분일치로 보면 안 된다. `500,000원` 이 `+1,500,000원` 안에 들어 있어 틀린 값도 통과한다.
    await expect(settings.heroResult.delta).toHaveText(formatSignedCurrency(DELTA));
    await expect(settings.heroResult.income).toHaveText(formatSignedCurrency(INCOME));
    await expect(home.hero.monthSpent).toHaveText(formatCurrency(EXPENSE));
  });

  await test.step('남은 예산으로 되돌리면 홈도 원래대로 온다', async () => {
    await appShell.goToTab('관리');
    await manage.waitReady();
    await appShell.followRow('앱 설정');
    await settings.waitReady();

    await settings.chooseHero('남은 예산');
    await expect(settings.preview).toHaveText('홈 맨 위에 남은 예산이 먼저 보여요.');

    await appShell.pressBack();
    await appShell.goToTab('홈');
    await home.waitReady();

    await expect(settings.heroResult.label).toHaveText(`${MONTH_NUMBER}월 · 남은 예산`);
    await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - EXPENSE));
    await expect(settings.heroResult.delta).toHaveCount(0);
  });
});

/**
 * 예산이 없으면 「남은 예산」 을 눌러 둘 수 없다.
 *
 * 서버가 새 사람에게 주는 기본값은 「남은 예산」 인데 그 사람에게는 예산이 없다. 그대로
 * 누르면 설정 화면은 「남은 예산」 이라 말하고 홈은 다른 것을 보여 준다. 실기기에서
 * 그 어긋남이 그대로 신고로 왔다(2026-09-16).
 */
test('예산이 없으면 수입·지출이 눌려 있고, 예산을 정하면 남은 예산으로 돌아온다', async ({
  home,
  manage,
  prep,
  settings,
}) => {
  await prep.addTransaction({ amount: INCOME, daysAgo: 0, type: 'income' });
  await prep.addExpense({ amount: EXPENSE, daysAgo: 0 });

  await settings.open();
  await settings.waitReady();
  await expect(settings.heroChoice('수입·지출')).toHaveAttribute('aria-checked', 'true');
  await expect(settings.heroChoice('남은 예산')).toHaveAttribute('aria-checked', 'false');

  await home.open();
  await home.waitReady();
  await expect(settings.heroResult.label).toHaveText(`${MONTH_NUMBER}월 · 이번 달 남은 돈`);
  await expect(settings.heroResult.delta).toHaveText(formatSignedCurrency(DELTA));

  // 예산을 정하는 순간, 아무것도 안 골랐던 사람은 저절로 남은 예산으로 간다.
  await manage.open();
  await manage.waitReady();
  await manage.total.startButton.click();
  await manage.total.sheet.waitOpen();
  await manage.total.sheet.save(BUDGET);

  await settings.open();
  await settings.waitReady();
  await expect(settings.heroChoice('남은 예산')).toHaveAttribute('aria-checked', 'true');

  await home.open();
  await home.waitReady();
  await expect(settings.heroResult.label).toHaveText(`${MONTH_NUMBER}월 · 남은 예산`);
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - EXPENSE));
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

  // 설정 화면을 한 번도 거치지 않았다. 예산이 없으니 고를 수 있는 것 중 가까운 쪽으로 온다.
  await expect(settings.heroResult.label).toHaveText(`${MONTH_NUMBER}월 · 이번 달 남은 돈`);
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

  await appShell.followRow('개인정보처리방침');

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

test('예산 시작일 자리가 없고, 하위 화면은 둘뿐이다', async ({ appShell, settings }) => {
  await settings.open();
  await settings.waitReady();

  await appShell.expectScreen('앱 설정', '홈에 무엇을 먼저 보여줄지 정해요');

  // 예산 기간은 달력 월로 고정이라 고를 자리를 두지 않는다.
  await expect(settings.text(/예산 시작일|예산 기간/)).toHaveCount(0);

  // 목록을 통째로 못 박는다. 입구가 하나 늘거나 순서가 바뀌면 이 줄이 먼저 깨진다.
  // 알림 설정 화면 자체는 specs/notifications.spec.ts 가 본다.
  await expect(appShell.subScreenLinks('설정 하위 화면')).toHaveText([
    '내 계정',
    '알림 설정',
    '개인정보처리방침',
  ]);
});

/*
  예산이 걸린 갈래를 골랐는데 예산이 없을 때.

  「남은 예산」 을 고른 사람은 남은 예산을 보고 싶다고 말한 것이다. 그런데 예산이 없으면
  홈은 다른 것으로 떨어뜨린다. 예산을 정하는 자리는 관리 탭에 있고, 「관리 탭에 가서
  정하세요」 라고 적어 두면 대부분 안 간다. 그래서 그 자리에서 바로 연다.
*/

test('예산 없이 남은 예산을 고르면 그 자리에서 예산을 정할 수 있다', async ({
  home,
  settings,
}) => {
  await settings.open();
  await settings.waitReady();
  await settings.chooseHero('남은 예산');

  // 왜 다르게 보이는지 먼저 말하고, 바로 정할 길을 연다.
  await expect(settings.preview).toHaveText(
    '아직 예산을 안 정해서, 홈 맨 위에 이번 달 남은 돈이 보여요.',
  );
  await expect(settings.budgetButton).toBeVisible();

  await settings.setBudget(BUDGET);

  // 정하고 나면 안내가 바뀌고 버튼은 사라진다. 할 일이 없는 버튼을 남겨 두지 않는다.
  await expect(settings.preview).toHaveText('홈 맨 위에 남은 예산이 먼저 보여요.');
  await expect(settings.budgetButton).toHaveCount(0);

  // 화면 밖까지 갔는지 홈에서 본다.
  await home.open();
  await home.waitReady();
  await expect(settings.heroResult.label).toHaveText(`${MONTH_NUMBER}월 · 남은 예산`);
});

test('수입·예산을 골라도 같은 길이 열리고, 왜 그렇게 보이는지 적는다', async ({ settings }) => {
  await settings.open();
  await settings.waitReady();
  await settings.chooseHero('수입·예산');

  await expect(settings.preview).toHaveText(
    '아직 예산을 안 정해서, 홈 맨 위에 이번 달 남은 돈이 보여요.',
  );
  await expect(settings.budgetButton).toBeVisible();

  await settings.setBudget(BUDGET);
  await expect(settings.preview).toHaveText('홈 맨 위에 번 돈과 남은 예산이 함께 보여요.');
  await expect(settings.budgetButton).toHaveCount(0);
});

test('예산이 필요 없는 갈래에는 그 버튼을 안 세운다', async ({ settings }) => {
  await settings.open();
  await settings.waitReady();
  await settings.chooseHero('수입·지출');

  // 예산 없이도 그대로 성립하는 갈래다. 버튼이 서면 안 해도 될 일을 시키는 셈이다.
  await expect(settings.preview).toHaveText('홈 맨 위에 이번 달 남은 돈이 먼저 보여요.');
  await expect(settings.budgetButton).toHaveCount(0);
});
