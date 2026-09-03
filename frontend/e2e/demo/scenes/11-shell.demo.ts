import { expect, test } from '../support/director';

import { ROUTES } from '../../../src/app/router/routes';
import { formatCurrency } from '../../../src/shared/lib/format';

/**
 * 앱 껍데기가 어떻게 움직이는지 찍는다.
 *
 * 하단 3탭을 오가며 각 탭이 무엇을 보여주는지 잠깐씩 머문다.
 * 그다음 토스 시스템 뒤로가기가 하위 화면에서 부모로 한 단씩 올라오는 것을 본다.
 * 탭 루트에서 누르면 미니앱이 닫히는데, 그건 히스토리가 깨끗해야 보이므로 따로 찍는다.
 */

const BUDGET = 500_000;
const SPENT = 12_000;

test('17 하단 3탭으로 홈·리포트·관리를 오간다', async ({ prep, appShell, home, demo }) => {
  // 탭을 오갈 때 홈 숫자가 그대로 돌아오는지 보려면 홈에 채울 것이 있어야 한다.
  await prep.setBudget(BUDGET);
  await prep.addExpense({ amount: SPENT, daysAgo: 0 });

  await home.open();
  await home.waitReady();
  await demo.open('하단 3탭', '홈·리포트·관리가 화면 아래 알약 탭바로 이어진다');

  await demo.step('첫 화면은 홈이다. 탭바에서 홈만 켜져 있다');
  await appShell.expectTabsVisible();
  await appShell.expectCurrentTab('홈');
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - SPENT));
  await demo.beat(2);

  await demo.step('리포트 탭을 누른다');
  await appShell.goToTab('리포트');
  await appShell.expectScreen('리포트', '이번 달 지출이 어디로 갔는지 봐요');
  await appShell.expectCurrentTab('리포트');
  await demo.clearStep();
  await demo.beat(2);

  await demo.step('아직 데이터가 안 붙은 자리표시자 화면이다');
  await demo.beat(2);

  await demo.step('관리 탭으로 옮긴다');
  await appShell.goToTab('관리');
  await appShell.expectScreen('관리', '예산과 분류를 손봐요');
  await appShell.expectCurrentTab('관리');
  await demo.clearStep();
  await demo.beat(2);

  await demo.step('관리는 하위 화면으로 들어가는 입구를 모아 둔 곳이다');
  await demo.beat(2);

  await demo.step('홈으로 돌아온다. 숫자는 나갔던 그대로다');
  await appShell.goToTab('홈');
  await home.waitReady();
  await appShell.expectCurrentTab('홈');
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - SPENT));
  await demo.clearStep();
  await demo.beat(3);
});

test('18 시스템 뒤로가기는 한 단씩 부모 화면으로 올라간다', async ({ appShell, home, demo }) => {
  await home.open();
  await home.waitReady();
  await demo.open('시스템 뒤로가기', '하위 화면이면 부모로, 깊이 들어갔으면 한 단씩');

  await demo.step('관리 탭에서 카테고리 관리로 들어간다');
  await appShell.goToTab('관리');
  await appShell.followLink('카테고리 관리');
  await appShell.expectScreen('카테고리 관리', '쓰는 분류만 남겨요');
  // 하위 화면에는 탭바가 없다. 지금 어디에 있는지가 화면에 드러난다.
  await appShell.expectTabsHidden();
  await demo.beat(2);

  await demo.step('토스 뒤로가기를 누른다. 브라우저 뒤로가기가 아니다');
  await appShell.pressBack();
  await expect.poll(() => appShell.pathname).toBe(ROUTES.manage);
  await appShell.expectScreen('관리', '예산과 분류를 손봐요');
  await appShell.expectCurrentTab('관리');
  await demo.clearStep();
  await demo.beat(2);

  await demo.step('이번에는 두 단 깊이로 들어간다. 앱 설정에서 알림 설정까지');
  await appShell.followLink('앱 설정');
  await appShell.expectScreen('앱 설정', '예산 기간과 알림을 정해요');
  await appShell.followLink('알림 설정');
  await appShell.expectScreen('알림 설정', 'P1 화면이에요. 지금은 자리만 잡아 뒀어요');
  await appShell.expectTabsHidden();
  await demo.beat(2);

  await demo.step('뒤로가기 한 번이면 앱 설정까지만 올라온다');
  await appShell.pressBack();
  await expect.poll(() => appShell.pathname).toBe(ROUTES.settings);
  await appShell.expectScreen('앱 설정', '예산 기간과 알림을 정해요');
  await demo.beat(2);

  await demo.step('한 번 더 누르면 관리로 나오고 탭바가 다시 뜬다');
  await appShell.pressBack();
  await expect.poll(() => appShell.pathname).toBe(ROUTES.manage);
  await appShell.expectScreen('관리', '예산과 분류를 손봐요');
  await appShell.expectTabsVisible();
  await appShell.expectCurrentTab('관리');
  await demo.clearStep();
  await demo.beat(2);

  await demo.step('앱 안에 들어가는 링크가 없는 달력을 주소로 바로 연다');
  await appShell.open(ROUTES.calendar);
  await appShell.expectScreen('월간 달력', '날짜별로 얼마 썼는지 한눈에 봐요');
  await appShell.expectTabsHidden();
  await demo.beat(2);

  await demo.step('딥링크로 들어와서 되돌아갈 히스토리가 없는 자리다');
  await demo.beat(2);

  await demo.step('그래도 뒤로가기는 부모인 홈으로 보낸다');
  await appShell.pressBack();
  await expect.poll(() => appShell.pathname).toBe(ROUTES.home);
  await home.waitReady();
  await appShell.expectTabsVisible();
  await appShell.expectCurrentTab('홈');
  await demo.clearStep();
  await demo.beat(3);
});

test('19 탭 루트에서 뒤로가면 미니앱이 닫힌다', async ({ page, appShell, home, demo }) => {
  // 미니앱을 닫는 것은 화면에 남는 흔적이 없다. 브릿지가 실제로 불렸는지는 목이 찍는 로그로 본다.
  const closeCalls: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('closeView called')) closeCalls.push(message.text());
  });

  // 이 장면은 페이지를 연 직후여야 한다. 탭이나 하위 화면을 한 번이라도 거치면
  // 목이 부르는 history.back() 이 앞 화면으로 돌아가서 종료가 아니라 이동처럼 보인다.
  await home.open();
  await home.waitReady();
  await demo.open('탭 루트에서 뒤로가기', '올라갈 부모가 없는 자리에서는 미니앱이 닫힌다');

  await demo.step('홈은 탭 루트다. 위로 올라갈 부모 화면이 없다');
  await appShell.expectTabsVisible();
  await appShell.expectCurrentTab('홈');
  expect(closeCalls, '아직 닫기를 부르지 않았어야 한다').toEqual([]);
  await demo.beat(2);

  // 닫히고 나면 화면이 비고, 목이 문서를 새로 여는 탓에 자막도 함께 사라진다.
  // 그래서 무슨 일이 일어날지는 누르기 전에 미리 말해 두고, 닫힌 뒤에는 짧게 끝낸다.
  await demo.step('여기서 뒤로가기를 누르면 미니앱이 닫힌다. 화면이 비고 토스 앱으로 돌아간다');
  await demo.beat();
  await appShell.pressBack();
  // 실제로 닫히는 모습은 실기기에서만 보인다. 목은 로그를 찍고 화면을 비우는 데까지만 한다.
  await expect.poll(() => closeCalls.length, { message: '닫기가 불리지 않았다' }).toBe(1);
  await demo.beat();
});
