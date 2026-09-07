import {
  agreementResultForced,
  forceAgreementResult,
  watchAgreementRequests,
} from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 기록 알림.
 *
 * 알림은 잘못 만들면 벌주는 기능이 된다. 그래서 여기서 확인할 것은 세 가지다.
 * 켜기 전에는 아무것도 묻지 않는가, 거절한 사람에게 다시 묻지 않는가, 정한 시각이 남는가.
 *
 * 동의 결과는 devtools 목의 다이얼로 정한다. 브릿지 코드는 실기기와 같은 것이 그대로 돈다.
 */

const NEW_TIME = '22:00';
/** 시각을 안 고르고 켜면 서버가 넣어 주는 값. 켜 두고 시각이 비면 영영 안 가는 알림이 된다. */
const DEFAULT_TIME = '21:30';

test('알림 설정은 앱 설정 아래에 있고, 처음 열면 꺼져 있다', async ({
  appShell,
  manage,
  notifications,
  settings,
}) => {
  await appShell.open();
  await appShell.expectMounted();

  await test.step('탭을 옮기고 설정까지 들어가는 동안 저절로 뜨는 것이 없다', async () => {
    await appShell.goToTab('관리');
    await manage.waitReady();
    await expect(settings.anyDialog).toHaveCount(0);

    await appShell.followLink('앱 설정');
    await settings.waitReady();
    await expect(settings.anyDialog).toHaveCount(0);
  });

  await test.step('설정 하위 목록에서 알림 설정으로 들어간다', async () => {
    await expect(appShell.subScreenLinks('설정 하위 화면')).toHaveText([
      '알림 설정',
      '개인정보처리방침',
    ]);
    await appShell.followLink('알림 설정');
    await appShell.expectScreen('알림 설정', '알림은 하나뿐이에요. 언제 받을지만 정하면 돼요');
    await appShell.expectDocumentTitle('알림 설정');
  });

  await test.step('옵트인이라 꺼져 있고, 진입만으로는 동의를 묻지 않는다', async () => {
    await notifications.waitReady();
    await expect(notifications.toggle).toHaveAttribute('aria-checked', 'false');
    await expect(notifications.timeInput).toBeDisabled();
    await expect(notifications.anyDialog).toHaveCount(0);
  });

  await test.step('며칠 밀렸다거나 놓쳤다는 말을 하지 않는다', async () => {
    await expect(notifications.text(/밀렸|밀린|놓쳤|놓친/)).toHaveCount(0);
    await expect(
      notifications.text('매일 정한 시간에 기록을 떠올릴 수 있게 알려요.'),
    ).toBeVisible();
  });

  await test.step('시스템 뒤로가기로 앱 설정에 돌아온다', async () => {
    await appShell.pressBack();
    await appShell.expectScreen('앱 설정', '홈에 무엇을 먼저 보여줄지 정해요');
  });
});

test('켜는 그 순간에만 동의를 묻고, 정한 시각이 다시 열어도 남는다', async ({
  page,
  appShell,
  notifications,
}) => {
  const agreements = watchAgreementRequests(page);

  await notifications.open();
  await notifications.waitReady();

  // 화면에 들어온 것만으로는 동의를 묻지 않는다. 진입 즉시 묻는 앱이 되지 않게 세어 둔다.
  expect(agreements(), '화면에 들어오기만 했는데 동의를 물었다').toBe(0);

  await test.step('켜면 그때 한 번 묻고, 시각을 안 골랐으니 서버가 기본 시각을 넣는다', async () => {
    await notifications.turnOn();
    await expect.poll(agreements, { message: '켤 때 동의를 묻지 않았다' }).toBe(1);
    await expect(notifications.timeInput).toHaveValue(DEFAULT_TIME);
    await expect(notifications.timeInput).toBeEnabled();
  });

  await test.step('시각을 22:00 으로 바꾼다', async () => {
    await notifications.setTime(NEW_TIME);
    // 시각을 고치는 것은 동의와 무관하다. 여기서 또 물으면 손댈 때마다 동의 창이 뜬다.
    expect(agreements(), '시각을 고쳤는데 동의를 다시 물었다').toBe(1);
  });

  await test.step('나갔다 다시 들어와도 켜진 채 그 시각이 남아 있다', async () => {
    await appShell.pressBack();
    await appShell.expectScreen('앱 설정', '홈에 무엇을 먼저 보여줄지 정해요');

    await appShell.followLink('알림 설정');
    await notifications.waitReady();
    await expect(notifications.toggle).toHaveAttribute('aria-checked', 'true');
    await expect(notifications.timeInput).toHaveValue(NEW_TIME);
    // 이미 켜 둔 사람에게 다시 묻지 않는다.
    expect(agreements(), '다시 들어왔을 뿐인데 동의를 물었다').toBe(1);
  });

  await test.step('끄는 것은 동의와 무관하다', async () => {
    await notifications.turnOff();
    await expect(notifications.timeInput).toBeDisabled();
    expect(agreements(), '끄는데 동의를 물었다').toBe(1);
  });
});

test('동의를 거절하면 켜지지 않고 이유를 알려 준다', async ({ page, notifications }) => {
  await forceAgreementResult('agreementRejected')(page);

  await notifications.open();
  await notifications.waitReady();

  expect(
    await agreementResultForced(page, 'agreementRejected'),
    '목의 동의 결과 다이얼이 켜지지 않았다',
  ).toBe(true);

  await notifications.toggle.click();

  // 서버는 아무것도 바꾸지 않았다. 토글이 켜진 척하고 있으면 안 오는 알림을 기다리게 된다.
  await expect(notifications.notice).toHaveText(
    '토스 알림 동의를 하지 않아 알림을 켤 수 없어요. 토스 앱 알림 설정에서 바꿀 수 있어요.',
  );
  await expect(notifications.toggle).toHaveAttribute('aria-checked', 'false');
  await expect(notifications.timeInput).toBeDisabled();

  // 거절한 사람에게 같은 것을 반복해서 묻지 않는다.
  await expect(notifications.toggle).toBeDisabled();
});
