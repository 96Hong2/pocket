import { test } from '../support/fixtures';

// 콘솔 오류 검사는 fixtures 의 page 가드가 모든 테스트에 자동으로 건다. 여기서 다시 하지 않는다.

test('앱이 빈 화면 없이 뜬다', async ({ appShell }) => {
  await appShell.open();
  await appShell.expectMounted();
});

test('하단 3탭으로 이동한다', async ({ appShell }) => {
  await appShell.open();
  await appShell.expectTabsVisible();

  await appShell.goToTab('리포트');
  await appShell.goToTab('관리');
  await appShell.goToTab('홈');
});
