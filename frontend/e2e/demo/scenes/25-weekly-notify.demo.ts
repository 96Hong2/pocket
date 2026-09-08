import { expect, test } from '../support/director';

/**
 * 주간 가용액·무지출일과 기록 알림 두 장면.
 *
 * 앞은 '이번 주에 얼마 쓸 수 있나', 뒤는 '기록하러 오라고 언제 부를까' 다. 둘 다 매일
 * 돌아오게 만드는 자리라 한 파일에 뒀다.
 *
 * 알림 동의는 devtools 목이 응답하지만 브릿지 코드는 실기기와 같은 것이 그대로 돈다.
 * 그래서 여기서 보이는 것은 '동의를 언제 묻는가' 이지 실제 알림이 오는 것이 아니다.
 */

const BUDGET = 1_000_000;
const YESTERDAY_EXPENSE = 120_000;

/** 알림을 켤 때 시각을 안 고르면 서버가 넣어 주는 값. */
const DEFAULT_TIME = '21:30';
const NEW_TIME = '22:00';

test('52 이번 주 쓸 수 있는 돈과 안 쓴 날', async ({ demo, home, prep }) => {
  await prep.setBudget(BUDGET);
  await prep.addExpense({ amount: YESTERDAY_EXPENSE, daysAgo: 1 });

  await home.open();
  await home.waitReady();
  await demo.open('이번 주와 안 쓴 날', '한 달을 주 단위로 잘라 보고, 안 쓴 날을 남긴다');

  await demo.step('예산을 정해 두면 하루에 쓸 수 있는 돈이 나온다');
  await expect(home.hero.dailyAllowance).toBeVisible();
  await demo.beat(3);

  await demo.step('한 달은 너무 멀어서, 이번 주로도 잘라 보여준다');
  await expect(home.hero.weeklyLabel).toBeVisible();
  await expect(home.hero.weeklyAllowance).toBeVisible();
  await demo.beat(3);

  await demo.step('오늘은 아직 한 건도 없다. 안 썼다고 그 자리에서 남긴다');
  await expect(home.today.noSpendButton).toBeVisible();
  await demo.beat(2);

  await demo.step('누르면 목록에 안 쓴 날로 적힌다');
  await home.today.noSpendButton.click();
  await expect(home.today.noSpendRow).toBeVisible();
  await demo.beat(3);

  await demo.step('잘못 눌렀으면 취소로 되돌린다');
  await home.today.noSpendCancelButton.click();
  await expect(home.today.noSpendButton).toBeVisible();
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('53 정한 시각에 한 번, 기록하러 오라고만 알린다', async ({
  appShell,
  demo,
  home,
  notifications,
}) => {
  await home.open();
  await home.waitReady();
  await demo.open('기록 알림', '켤지 말지와 언제 받을지, 정할 것은 둘뿐이다');

  await demo.step('관리 탭에서 알림 설정으로 들어간다');
  await appShell.goToTab('관리');
  await appShell.followLink('알림 설정');
  await notifications.waitReady();
  await demo.beat(2);

  await demo.step('처음에는 꺼져 있다. 들어온 것만으로는 아무것도 묻지 않는다');
  await expect(notifications.toggle).toHaveAttribute('aria-checked', 'false');
  await expect(notifications.timeInput).toBeDisabled();
  await expect(notifications.anyDialog).toHaveCount(0);
  await demo.beat(3);

  // 자막도 페이지 안에 그려진다. 없어야 할 말을 셀 때는 자막에 그 말을 쓰면 안 된다.
  await demo.step('기록이 없다고 나무라는 말은 어디에도 없다');
  await expect(notifications.text(/밀렸|밀린|놓쳤|놓친/)).toHaveCount(0);
  await demo.beat(2);

  await demo.step('켜는 그 순간에 한 번 동의를 묻는다');
  await notifications.turnOn();
  await demo.beat(2);

  await demo.step('시각을 안 골랐으니 기본 시각이 들어간다');
  await expect(notifications.timeInput).toHaveValue(DEFAULT_TIME);
  await demo.beat(3);

  await demo.step('받고 싶은 시각으로 바꾼다');
  await notifications.setTime(NEW_TIME);
  await demo.beat(3);

  await demo.step('나갔다 다시 들어와도 켜진 채 그 시각이 남아 있다');
  await appShell.pressBack();
  await appShell.followLink('알림 설정');
  await notifications.waitReady();
  await expect(notifications.toggle).toHaveAttribute('aria-checked', 'true');
  await expect(notifications.timeInput).toHaveValue(NEW_TIME);
  await demo.beat(3);

  await demo.step('끄는 것은 묻지 않는다. 시각 칸도 함께 잠긴다');
  await notifications.turnOff();
  await expect(notifications.timeInput).toBeDisabled();
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
