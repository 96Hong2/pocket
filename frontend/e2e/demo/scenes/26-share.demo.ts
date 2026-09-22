import { SHARE_AFTER_RECORDS } from '../../../src/features/home/homeMode';
import { shiftMonth, toLedgerDate } from '../../../src/shared/lib/format';
import { readShareSheet } from '../../support/aitMock';
import { expect, test } from '../support/director';

/**
 * 친구에게 보내기 두 장면.
 *
 * 시스템 공유창은 웹 페이지 **바깥**에서 뜬다. 영상에는 그 창이 안 찍히므로,
 * 대신 **공유창으로 실제로 넘어간 글**을 자막으로 띄운다. 무엇이 나가는지가 이 기능의
 * 전부라, 그것을 못 보여 주면 버튼만 눌러 보는 영상이 된다.
 */

const THIS_MONTH = toLedgerDate(new Date()).slice(0, 7);
const LAST_MONTH = shiftMonth(THIS_MONTH, -1);

const GOAL_TITLE = '제주도 여행';
const GOAL_AMOUNT = 1_000_000;
const SAVED = 250_000;

const LAST_BUDGET = 400_000;

test('54 목표와 결산을 친구에게 보낸다', async ({ appShell, demo, goal, home, page, prep, report }) => {
  const id = await prep.setGoal({ title: GOAL_TITLE, targetAmount: GOAL_AMOUNT });
  await prep.addContribution(id, { amount: SAVED });
  await prep.setBudget(LAST_BUDGET, LAST_MONTH);
  await prep.addTransaction({ amount: 120_000, on: `${LAST_MONTH}-05` });
  await prep.addTransaction({ amount: 90_000, on: `${LAST_MONTH}-12` });

  await home.open();
  await home.waitReady();
  await demo.open('친구에게 보내기', '목표와 결산을 링크 한 줄로 보낸다');

  await demo.step('관리 탭에서 목표로 들어간다');
  await appShell.goToTab('관리');
  await appShell.followRow('목표');
  await goal.waitReady();
  await demo.beat(2);

  await demo.step('목표를 정하면 카드 아래에 공유 카드가 선다');
  await expect(goal.shareCard).toBeVisible();
  await demo.beat(2);

  await demo.step('보내기를 망설이게 하는 것을 카드가 먼저 없앤다');
  await expect(goal.shareCard).toContainText('모은 금액은 빼고 진행률만 보내요');
  await demo.beat(3);

  await demo.step('누르면 링크를 만들어 시스템 공유창으로 넘긴다');
  await goal.shareButton.click();
  await expect.poll(() => readShareSheet(page)).toHaveLength(1);
  await demo.beat(2);

  // 공유창은 웹 바깥이라 영상에 안 찍힌다. 실제로 넘어간 글을 자막으로 보여 준다.
  const [goalText] = await readShareSheet(page);
  await demo.step(`보낸 글 › ${goalText.split('\n')[0]}`);
  await demo.beat(4);

  await demo.step('모은 금액은 안 보낸다. 진행률만 간다');
  await demo.beat(3);

  await demo.step('결산도 같은 자리에 있다. 리포트로 간다');
  await report.open({ month: LAST_MONTH });
  await report.waitReady();
  await demo.beat(2);

  await demo.step('지난달 결산을 연다');
  await report.closing.open();
  await demo.beat(2);

  await demo.step('넉 장을 다 본 뒤에만 공유가 선다');
  await report.closing.nextButton.click();
  await report.closing.nextButton.click();
  await report.closing.nextButton.click();
  await expect(report.closing.shareButton).toBeVisible();
  await demo.beat(3);

  // 리포트로 넘어오면서 창이 새로 떴다. 앞 장면에서 보낸 것은 그 창과 함께 사라졌다.
  await demo.step('여기서도 금액은 안 나간다');
  await report.closing.shareButton.click();
  await expect.poll(() => readShareSheet(page)).toHaveLength(1);
  const [closingText] = await readShareSheet(page);
  await demo.step(`보낸 글 › ${closingText.split('\n')[0]}`);
  await demo.beat(4);

  await demo.clearStep();
  await demo.beat(2);
});

test('55 앱을 알리는 카드는 닫을 수 있다', async ({ demo, home, prep }) => {
  await prep.addSeries(SHARE_AFTER_RECORDS, { amount: 3000, daysAgo: 0, prefix: '가게' });
  await prep.setBudget(500_000);

  await home.open();
  await home.waitReady();
  await demo.open('닫을 수 있는 권유', '몇 번 써 본 사람에게만 한 번 묻는다');

  await demo.step('기록 버튼 바로 아래 카드. 다섯 번 넘게 적은 사람에게만 뜬다');
  await expect(home.share.title).toBeVisible();
  await expect(home.share.lead).toBeVisible();
  await demo.beat(3);

  await demo.step('알릴 생각이 없으면 닫는다');
  await home.share.closeButton.click();
  await expect(home.share.card).toHaveCount(0);
  await demo.beat(3);

  await demo.step('다시 열어도 그 자리는 비어 있다. 한 번 닫으면 끝이다');
  await home.open();
  await home.waitReady();
  await expect(home.share.card).toHaveCount(0);
  await demo.beat(4);

  await demo.clearStep();
  await demo.beat(2);
});
