import { exportFileName } from '../../../src/features/export/period';
import { formatCurrency, formatSignedCurrency, toLedgerDate } from '../../../src/shared/lib/format';
import { readSavedFiles } from '../../support/aitMock';
import { expect, test } from '../support/director';

/**
 * 앱 설정 두 장면. 48 은 홈 맨 위에 무엇을 크게 볼지 고르고, 58 은 가계부를 엑셀로 내려받는다.
 *
 * 48 은 홈을 먼저 열어 지금 얼굴을 보여준 뒤 설정으로 들어간다. 설정 화면만 찍으면 갈래 세 개가
 * 무엇을 바꾸는 것인지 영상에서 알 수 없다. 고를 때마다 아래 한 줄이 결과를 먼저 말하고,
 * 홈으로 돌아와 그 말이 맞는지 눈으로 확인하는 순서다.
 *
 * 여기서 보이는 것은 설정 화면의 생김새가 아니라, 고른 값이 새로고침 없이 홈까지
 * 이어지는 것이다. 번 돈·쓴 돈·예산은 배경으로 미리 심어 두고 이 장면에서 만들지 않는다.
 */

/** 히어로 라벨 앞에 붙는 달. 기기 시간대가 아니라 가계부 시간대로 얻는다. */
const MONTH_NUMBER = Number(toLedgerDate(new Date()).slice(5, 7));

const INCOME = 2_000_000;
const EXPENSE = 500_000;
const BUDGET = 1_000_000;

test('48 홈 맨 위에 무엇을 보여줄지 고른다', async ({
  appShell,
  demo,
  home,
  manage,
  prep,
  settings,
}) => {
  // 세 갈래가 서로 다른 숫자를 보여주려면 번 돈·쓴 돈·예산이 다 있어야 한다.
  await prep.addTransaction({ amount: INCOME, daysAgo: 0, type: 'income' });
  await prep.addExpense({ amount: EXPENSE, daysAgo: 0 });
  await prep.setBudget(BUDGET);

  await home.open();
  await home.waitReady();
  await demo.open('홈 얼굴 고르기', '맨 위에 무엇을 크게 볼지 내가 정한다');

  await demo.step('지금 홈은 남은 예산을 가장 크게 보여준다');
  await expect(settings.heroResult.label).toHaveText(`${MONTH_NUMBER}월 · 남은 예산`);
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - EXPENSE));
  await demo.beat(3);

  await demo.step('관리 탭을 거쳐 앱 설정으로 들어간다');
  await appShell.goToTab('관리');
  await manage.waitReady();
  await appShell.followRow('앱 설정');
  await settings.waitReady();
  await demo.beat(2);

  await demo.step('갈래 아래 한 줄이 지금 홈 모습을 되짚어 준다');
  await expect(settings.preview).toHaveText('홈 맨 위에 남은 예산이 먼저 보여요.');
  await demo.beat(3);

  await demo.step('수입·지출로 옮기면 그 한 줄이 먼저 바뀐다');
  await settings.chooseHero('수입·지출');
  await expect(settings.preview).toHaveText('홈 맨 위에 이번 달 남은 돈이 먼저 보여요.');
  await demo.beat(3);

  await demo.step('홈으로 돌아오면 새로고침 없이 차액이 크게 온다');
  await appShell.pressBack();
  await appShell.goToTab('홈');
  await home.waitReady();
  await expect(settings.heroResult.delta).toHaveText(formatSignedCurrency(INCOME - EXPENSE));
  await demo.beat(3);

  await demo.step('설정으로 다시 가서 수입·예산을 고른다');
  await appShell.goToTab('관리');
  await manage.waitReady();
  await appShell.followRow('앱 설정');
  await settings.waitReady();
  await settings.chooseHero('수입·예산');
  await expect(settings.preview).toHaveText('홈 맨 위에 번 돈과 남은 예산이 함께 보여요.');
  await demo.beat(3);

  await demo.step('이번에는 번 돈과 남은 예산이 함께 뜬다');
  await appShell.pressBack();
  await appShell.goToTab('홈');
  await home.waitReady();
  await expect(settings.heroResult.label).toHaveText(`${MONTH_NUMBER}월 · 번 돈과 남은 예산`);
  await expect(settings.heroResult.income).toHaveText(formatSignedCurrency(INCOME));
  await demo.beat(3);

  await demo.step('예산이 걸린 갈래라 게이지도 함께 온다');
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(BUDGET - EXPENSE));
  await expect(home.hero.gauge).toBeVisible();
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

/** 파일로 꺼낼 이번 달 기록. 지출 둘과 수입 하나라 셋이 담겨야 한다. */
const EXPORT_SEEDS = [
  { amount: 12_000, merchant: '김밥천국' },
  { amount: 4_500, merchant: '스타벅스' },
] as const;
const EXPORT_INCOME = 2_000_000;
const EXPORT_COUNT = EXPORT_SEEDS.length + 1;

/**
 * 내보내기 시트의 안내 세 줄. 첫 줄은 파일의 열 이름이다(`export/rows.ts` LEDGER_HEADER).
 * 옮겨 적지 않고 화면에 무엇이 적혀야 하는지를 여기 못 박는다.
 */
const EXPORT_CONTENTS = [
  '날짜, 시간, 구분, 카테고리, 내용, 금액, 결제수단, 메모',
  '엑셀 파일에는 월별 요약과 카테고리별 요약 시트가 들어가요',
  '이체는 요약에서 빼요. 안 쓴 날 표시는 파일에 안 담겨요',
] as const;

test('58 앱 설정에서 가계부를 엑셀로 내려받는다', async ({
  appShell,
  demo,
  home,
  manage,
  page,
  prep,
  settings,
}) => {
  for (const seed of EXPORT_SEEDS) await prep.addTransaction({ ...seed, daysAgo: 0 });
  await prep.addTransaction({ amount: EXPORT_INCOME, daysAgo: 0, type: 'income' });

  await home.open();
  await home.waitReady();
  await demo.open('엑셀로 내보내기', '적어 둔 기록을 언제든 파일로 꺼내 갈 수 있다');

  await demo.step('관리 탭을 거쳐 앱 설정으로 들어간다');
  await appShell.goToTab('관리');
  await manage.waitReady();
  await appShell.followRow('앱 설정');
  await settings.waitReady();
  await demo.beat(2);

  await demo.step('「엑셀로 내보내기」 를 누른다');
  await settings.ledgerExport.openButton.click();
  await expect(settings.ledgerExport.sheet).toBeVisible();
  await demo.beat(2);

  await demo.step('누르기 전에 파일에 무엇이 들어가는지 세 줄로 먼저 적혀 있다');
  await expect(settings.ledgerExport.contentsList).toHaveText([...EXPORT_CONTENTS]);
  await demo.beat(4);

  await demo.step('기간은 이번 달 · 지난 달 · 올해 · 전체 넷 중에 고른다');
  await expect(settings.ledgerExport.period('이번 달')).toHaveAttribute('aria-checked', 'true');
  await demo.beat(2);

  await demo.step('지난 달을 고르고 엑셀 파일을 누른다. 적은 것이 없어 빈 파일을 만들지 않는다');
  await settings.ledgerExport.period('지난 달').click();
  await settings.ledgerExport.xlsxButton.click();
  await expect(settings.ledgerExport.failNotice).toHaveText(
    '그 기간에 적어 둔 기록이 없어요. 다른 기간을 골라 보세요.',
  );
  expect(await readSavedFiles(page), '빈 기간인데 파일이 나갔다').toHaveLength(0);
  await demo.beat(3);

  await demo.step('이번 달로 돌려 다시 누르면 기기에 엑셀 파일이 저장된다');
  await settings.ledgerExport.period('이번 달').click();
  await settings.ledgerExport.xlsxButton.click();
  const fileName = exportFileName('this_month', toLedgerDate(new Date()), 'xlsx');
  await expect(settings.ledgerExport.doneNotice).toHaveText(
    `${EXPORT_COUNT}건을 「${fileName}」 으로 저장했어요.`,
  );
  const files = await readSavedFiles(page);
  expect(files.map((file) => file.fileName)).toEqual([fileName]);
  await demo.beat(4);

  await demo.clearStep();
  await demo.beat(2);
});
