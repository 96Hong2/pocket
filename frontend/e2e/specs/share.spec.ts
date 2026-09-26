import { SHARE_AFTER_RECORDS } from '../../src/features/home/homeMode';
import { appLine, goalDoneLine, goalLine } from '../../src/features/share/shareText';
import { sharePath } from '../../src/features/share/shareLink';
import { formatMonthLabel, shiftMonth, toLedgerDate } from '../../src/shared/lib/format';
import { logsNamed, readShareSheet, readShares } from '../support/aitMock';
import { expect, test } from '../support/fixtures';

/**
 * 친구에게 보내기 한 바퀴.
 *
 * 이 자리가 지키는 것 셋이다.
 * **권하는 때가 맞다**(몇 번 써 본 사람에게만, 결산은 다 본 뒤에, 넘긴 달에는 안 권한다),
 * **보내는 글에 금액이 없다**, **닫으면 다시 안 뜬다**.
 *
 * 시스템 공유 시트는 웹 페이지 바깥에서 뜬다. 그 자리를 `installShareSheetStub` 이 받고,
 * 앱과 브릿지는 실기기와 같은 길을 그대로 지난다. 무엇이 시트까지 갔는지는 거기서 읽는다.
 */

const TODAY = toLedgerDate(new Date());
const THIS_MONTH = TODAY.slice(0, 7);
const LAST_MONTH = shiftMonth(THIS_MONTH, -1);

/** `12,000원` 같은 금액 표기. 공유 글 어디에도 있으면 안 된다. */
const MONEY = /[\d,]+\s*원/;

test('몇 번 안 적어 본 사람에게는 앱을 알리라고 하지 않는다', async ({ home, prep }) => {
  await prep.addSeries(SHARE_AFTER_RECORDS - 1, { amount: 3000, daysAgo: 0, prefix: '가게' });

  await home.open();
  await home.waitReady();

  await expect(home.share.card).toHaveCount(0);
});

test('충분히 써 본 사람에게는 기록 버튼 아래에서 한 번 묻는다', async ({ home, page, prep }) => {
  await prep.addSeries(SHARE_AFTER_RECORDS, { amount: 3000, daysAgo: 0, prefix: '가게' });
  // 예산이 없으면 예산 제안 카드가 먼저다. 아래 테스트가 그 규칙을 따로 본다.
  await prep.setBudget(500_000);

  await home.open();
  await home.waitReady();
  // 그림 한 장에 멘트 한 줄. 줄 하나로는 눈에 안 들어온다는 지적을 받고 카드로 올렸다.
  await expect(home.share.title).toBeVisible();
  await expect(home.share.lead).toBeVisible();
  await expect(home.share.button).toBeVisible();

  await home.share.button.click();

  // 브릿지가 무엇을 들고 나갔나. 딥링크는 토스가 정한 모양이어야 링크가 만들어진다.
  await expect.poll(() => readShares(page)).toHaveLength(1);
  const [sent] = await readShares(page);
  expect(sent.path).toBe(sharePath('app'));
  expect(sent.message).toBe(appLine());

  // 시트까지 실제로 간 글. 문구 다음 줄에 토스가 만든 링크가 붙어 있어야 한다.
  const [text] = await readShareSheet(page);
  expect(text.split('\n')[0]).toBe(appLine());
  expect(text.split('\n')[1]).toMatch(/^https:\/\//);
});

test('닫으면 다시 뜨지 않는다', async ({ home, prep }) => {
  await prep.addSeries(SHARE_AFTER_RECORDS, { amount: 3000, daysAgo: 0, prefix: '가게' });
  await prep.setBudget(500_000);

  await home.open();
  await home.waitReady();
  await home.share.closeButton.click();
  await expect(home.share.card).toHaveCount(0);

  // 닫아 둔 표시는 기기에 남는다. 다시 열어도 그대로여야 한다.
  await home.open();
  await home.waitReady();
  await expect(home.share.card).toHaveCount(0);
});

test('목표를 정하면 목표 카드 아래에 공유 카드가 선다', async ({ goal, page, prep }) => {
  const id = await prep.setGoal({ title: '제주도 여행', targetAmount: 1_000_000 });
  await prep.addContribution(id, { amount: 250_000 });

  await goal.open();
  await goal.waitReady();
  await expect(goal.shareCard).toBeVisible();
  // 보내기를 망설이게 하는 것을 카드가 먼저 없앤다. 「내 돈 사정이 드러나나」가 첫 걱정이다.
  await expect(goal.shareCard).toContainText('모은 금액은 빼고 진행률만 보내요');

  await goal.shareButton.click();

  await expect.poll(() => readShares(page)).toHaveLength(1);
  const [sent] = await readShares(page);
  expect(sent.message).toBe(goalLine('제주도 여행', 25));
  // 모은 돈 25만 원이 그대로 나가면 안 된다. 보내기 부담스러운 글은 아무도 안 보낸다.
  expect(sent.message).not.toMatch(MONEY);
});

test('다 모은 목표는 축하 자리에서도 보낼 수 있다', async ({ goal, page, prep }) => {
  const id = await prep.setGoal({ title: '노트북', targetAmount: 500_000 });
  await prep.addContribution(id, { amount: 500_000 });

  await goal.open();
  await goal.waitReady();
  await expect(goal.done).toBeVisible();

  // 축하 자리가 이미 같은 이름으로 서 있다. 권유 카드까지 두면 한 화면에 같은 버튼이 둘이다.
  await expect(goal.shareCard).toHaveCount(0);

  await goal.doneShareButton.click();

  await expect.poll(() => readShares(page)).toHaveLength(1);
  const [sent] = await readShares(page);
  expect(sent.message).toBe(goalDoneLine('노트북'));
});

test('결산은 넉 장을 다 본 뒤에만 보낼 수 있다', async ({ page, prep, report }) => {
  await prep.setBudget(400_000, LAST_MONTH);
  await prep.addTransaction({ amount: 120_000, on: `${LAST_MONTH}-05` });
  await prep.addTransaction({ amount: 90_000, on: `${LAST_MONTH}-12` });

  await report.open({ month: LAST_MONTH });
  await report.closing.open();

  // 첫 장에서 권하면 결산을 보라는 화면이 아니라 알리라는 화면이 된다.
  await expect(report.closing.shareButton).toHaveCount(0);

  await report.closing.nextButton.click();
  await report.closing.nextButton.click();
  await report.closing.nextButton.click();
  await expect(report.closing.doneButton).toBeVisible();
  await expect(report.closing.shareButton).toBeVisible();

  await report.closing.shareButton.click();
  await expect.poll(() => readShares(page)).toHaveLength(1);
  const [sent] = await readShares(page);
  // 예산 안에서 마친 달이라 그 사실부터 말한다. 남긴 금액은 적지 않는다.
  expect(sent.message).toContain('예산 안에서 마쳤어요');
  expect(sent.message).not.toMatch(MONEY);
});

test('예산을 넘긴 달에는 알리라고 권하지 않는다', async ({ manage, prep }) => {
  await prep.setBudget(100_000, LAST_MONTH);
  await prep.addTransaction({ amount: 300_000, on: `${LAST_MONTH}-05` });

  await manage.open();
  await manage.waitReady();
  // 이번 달은 정한 그대로라 권한다.
  await expect(manage.total.shareButton).toBeVisible();

  await manage.goToMonth(formatMonthLabel(LAST_MONTH));
  // 넘긴 달에서 알리라고 권하면 그 달의 이 카드가 벌이 된다.
  await expect(manage.total.shareButton).toHaveCount(0);
});

test('공유 로그에는 자리와 갈래만 남고 보낸 글은 남지 않는다', async ({ goal, page, prep }) => {
  const id = await prep.setGoal({ title: '제주도 여행', targetAmount: 1_000_000 });
  await prep.addContribution(id, { amount: 250_000 });

  await goal.open();
  await goal.waitReady();
  await goal.shareButton.click();

  await expect.poll(() => logsNamed(page, 'share_result')).toHaveLength(1);
  const [log] = await logsNamed(page, 'share_result');
  expect(log.params.where).toBe('goal');
  expect(log.params.kind).toBe('goal');
  expect(log.params.result).toBe('ok');
  // 목표 이름과 진행률이 로그로 새면 안 된다. 갈래 이름까지가 이 앱이 남기는 전부다.
  expect(JSON.stringify(log.params)).not.toContain('제주도');
});

test('예산을 아직 안 정했으면 예산 먼저 묻고 공유는 비켜 준다', async ({ home, prep }) => {
  // 둘 다 스스로 나타나 한 가지를 권하는 카드다. 같이 서면 기록 버튼 아래가 권유 두 장이 된다.
  await prep.addSeries(SHARE_AFTER_RECORDS, { amount: 3000, daysAgo: 0, prefix: '가게' });

  await home.open();
  await home.waitReady();
  await expect(home.budget.suggestLead).toBeVisible();
  await expect(home.share.card).toHaveCount(0);

  // 예산 안내를 닫으면 그때 공유를 묻는다. 한 번에 하나씩이다.
  await home.budget.closeButton.click();
  await expect(home.share.card).toBeVisible();
});
