import { formatCurrency, formatSignedCurrency, shiftMonth } from '../../src/shared/lib/format';
import { thisMonth } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * 번 돈과 쓴 돈이 화면마다 같은 말을 하나.
 *
 * 숫자가 맞는지는 `ledger-edge.spec.ts` · `report.spec.ts` · `closing.spec.ts` 가 이미 본다.
 * 여기서 보는 것은 **두 화면이 같은 사건을 두고 다른 말을 하는 자리**다. 귀찮은 사람은
 * 어느 쪽이 맞는지 따져 보지 않는다. 숫자가 어긋난 것을 한 번 보면 그 뒤로 안 믿는다.
 *
 * 쓴 돈이 번 돈보다 많은 달, 종류를 잘못 적어 고치는 순간, 뜻이 없는 값을 고르게 두는 자리.
 * 대부분의 사람이 매달 지나는 길인데 화면으로 밟아 본 적이 없던 것들이다.
 */

const THIS_MONTH = thisMonth();
const LAST_MONTH = shiftMonth(THIS_MONTH, -1);
const TWO_MONTHS_AGO = shiftMonth(THIS_MONTH, -2);

/** 어느 달에 돌려도 있는 날. 월말 며칟날은 달마다 있고 없고가 갈린다. */
function day(month: string, dayOfMonth: string): string {
  return `${month}-${dayOfMonth}`;
}

/**
 * 이체는 무엇으로 냈는지가 없는 종류다.
 *
 * 종류 토글은 이미 이체를 걸러 내고 있다(바꿀 수 없으니 안 세운다). 같은 이유로
 * 결제 수단도 없어야 하는데 그 자리는 그대로 서 있다. 수입에서는 자리째 없앴다
 * (`payment-method.spec.ts` 의 '수입에는 결제 수단 자리가 아예 없다').
 *
 * 골라도 서버가 그 값을 비우고 저장한다. 다시 열면 아무것도 안 골라져 있어,
 * 고친 것이 사라졌다고 읽힌다.
 */
test('이체를 고칠 때는 결제 수단을 고를 자리가 없다', async ({ calendar, prep }) => {
  await prep.addTransaction({ amount: 200_000, merchant: '적금 자동이체', type: 'transfer' });

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('적금 자동이체');
  await calendar.edit.waitOpen();

  // 종류 토글은 이체를 제대로 걸러 냈다. 같은 규칙이 결제 수단에도 걸려야 한다.
  await expect(calendar.edit.kindToggle).toHaveCount(0);
  await expect(calendar.edit.paymentGroup).toHaveCount(0);
});

/**
 * 같은 날, 같은 기록, 두 화면. **일부러 다른 값이다.**
 *
 * 홈의 「N원 씀」 은 **예산에 반영되는 지출**이라 뺀 줄을 세지 않는다. 예산을 지키는
 * 화면이라 그렇다. 달력의 그 날 합계는 **그 날 실제로 나간 돈**이라 뺀 줄도 센다.
 * 「날짜별로 얼마 썼는지」 를 보는 화면에서 40만원을 빼고 보여 주면 그게 거짓말이다.
 *
 * 이 둘을 하나로 합치지 않는다(레포 규칙 4번과 같은 이유다). 여기서 지키는 것은
 * **각자가 자기 정의를 지키는 것**이고, 어느 한쪽이 슬쩍 다른 쪽 정의를 따라가면 깨진다.
 */
test('홈은 예산에 반영되는 지출만, 달력은 그 날 쓴 돈 전부를 말한다', async ({
  calendar,
  home,
  prep,
}) => {
  const SPENT = 4_500;
  const EXCLUDED = 40_000;

  await prep.addTransaction({ amount: SPENT, merchant: '편의점' });
  await prep.addTransaction({
    amount: EXCLUDED,
    merchant: '노트북 거치대',
    excludedFromBudget: true,
  });

  await home.open();
  await home.waitReady();
  await expect(home.today.spentTotal).toHaveText(`${formatCurrency(SPENT)} 씀`);
  // 뺀 줄도 목록에는 남는다. 합계에서만 빠졌다는 것이 화면에 보여야 한다.
  await expect(home.today.chip('예산 제외')).toBeVisible();

  await calendar.open();
  await calendar.waitReady();
  await expect(calendar.list.row('편의점')).toBeVisible();
  await expect(calendar.list.row('노트북 거치대')).toBeVisible();
  // 달력은 뺀 줄까지 센다. 홈과 다른 값이 나오는 것이 맞다.
  await expect(calendar.list.dayTotal).toHaveText(formatCurrency(SPENT + EXCLUDED));
});

/**
 * 쓴 돈이 번 돈보다 많은 달.
 *
 * 가계부를 쓰는 사람 대부분이 어느 달엔가 지나는 자리인데, 차액이 음수인 화면을
 * 밟아 본 적이 없었다. 부호가 뒤집혀도 양수 케이스만으로는 아무도 못 잡는다.
 */
test('쓴 돈이 번 돈보다 많은 달은 홈도 달력도 마이너스로 적는다', async ({
  calendar,
  home,
  prep,
}) => {
  const INCOME = 2_000_000;
  const EXPENSE = 2_300_000;

  await prep.addTransaction({ amount: INCOME, merchant: '월급', type: 'income' });
  await prep.addTransaction({ amount: EXPENSE, merchant: '이사 비용' });
  await prep.setHomeHero('income_expense');

  await home.open();
  await home.waitReady();
  await expect(home.hero.delta).toHaveText(formatSignedCurrency(INCOME - EXPENSE));
  // 큰 숫자만 보면 무엇에서 무엇을 뺀 값인지 모른다. 아래 두 칸이 그 근거다.
  await expect(home.hero.income).toHaveText(formatSignedCurrency(INCOME));
  await expect(home.hero.monthSpent).toHaveText(formatCurrency(EXPENSE));

  await calendar.open();
  await calendar.waitReady();
  await expect(calendar.totals.delta).toHaveText(formatSignedCurrency(INCOME - EXPENSE));
});

/**
 * 종류를 잘못 적어 고치는 순간.
 *
 * 분류의 종류와 거래의 종류가 맞는지는 서버가 안 본다. 수입으로 바꿀 때 붙어 있던
 * 분류를 떼는 것은 화면 한 줄뿐이라, 그 줄이 깨지면 리포트 수입 탭에 '식비' 로
 * 들어온 돈이 뜬다.
 */
test('지출을 수입으로 바꾸면 붙어 있던 분류가 떨어지고, 되돌리면 되살아난다', async ({
  calendar,
  prep,
  report,
}) => {
  const AMOUNT = 20_000;
  await prep.addTransaction({
    amount: AMOUNT,
    merchant: '중고거래',
    categoryId: await prep.categoryIdByName('식비'),
  });

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('중고거래');
  await calendar.edit.waitOpen();
  await expect(calendar.edit.pickedCategory).toHaveText(/식비/);

  await calendar.edit.kindButton('수입').click();
  // 고른 것이 떨어지는 것으로 끝이 아니다. 고를 수 있는 칩도 수입 것으로 갈려야 한다.
  await expect(calendar.edit.pickedCategory).toHaveCount(0);
  await expect(calendar.edit.categoryChip('식비')).toHaveCount(0);
  await expect(calendar.edit.categoryChip('월급')).toBeVisible();

  // 잘못 눌렀으면 물러날 길이 있어야 한다. 되돌리면 처음 붙어 있던 것이 그대로 온다.
  await calendar.edit.kindButton('지출').click();
  await expect(calendar.edit.pickedCategory).toHaveText(/식비/);

  await calendar.edit.kindButton('수입').click();
  await calendar.edit.pickCategory('월급');
  await calendar.edit.done();

  await report.open({ month: THIS_MONTH });
  await report.waitReady();
  await report.modeTab('수입').click();
  await expect(report.amount('월급')).toHaveText(formatSignedCurrency(AMOUNT));
  // '식비' 로 들어온 수입은 어느 화면에서도 말이 안 된다.
  await expect(report.row('식비')).toHaveCount(0);
});

/**
 * 결산의 「돈 흐름」 카드.
 *
 * 남은 예산도 순자산도 아니고 그 달에 들고 난 돈만 말하는 자리다. 지금까지 이 카드에서
 * 확인한 것은 「쓴 돈」 한 줄뿐이라, 번 돈이 0 이 아닌 화면도 「옮긴 돈」 줄도
 * 그려진 적이 없다.
 *
 * 값만 따로 보면 번 돈 자리에 쓴 돈 금액이 들어가도 통과한다. 줄째로 잡아 이름표와
 * 숫자를 함께 본다.
 */
test('결산 돈 흐름이 번 돈·차액·옮긴 돈을 말하고, 안 옮긴 달에는 그 줄이 없다', async ({
  prep,
  report,
}) => {
  const INCOME = 1_240_000;
  const EXPENSE = 830_000;
  const TRANSFER = 200_000;
  const QUIET_EXPENSE = 50_000;

  await prep.addTransaction({ amount: INCOME, on: day(LAST_MONTH, '05'), type: 'income' });
  await prep.addTransaction({ amount: EXPENSE, on: day(LAST_MONTH, '06') });
  await prep.addTransaction({ amount: TRANSFER, on: day(LAST_MONTH, '07'), type: 'transfer' });
  await prep.addTransaction({ amount: QUIET_EXPENSE, on: day(TWO_MONTHS_AGO, '05') });

  await report.open({ month: LAST_MONTH });
  await report.waitReady();
  await report.closing.open();
  await report.closing.nextButton.click();
  await expect(report.closing.title).toHaveText('돈 흐름');

  await expect(report.closing.flowRow('income')).toContainText('번 돈');
  await expect(report.closing.flowRow('income')).toContainText(formatCurrency(INCOME));
  await expect(report.closing.flowRow('expense')).toContainText('쓴 돈');
  await expect(report.closing.flowRow('expense')).toContainText(formatCurrency(EXPENSE));
  await expect(report.closing.flowRow('delta')).toContainText('차액');
  await expect(report.closing.flowRow('delta')).toContainText(
    formatSignedCurrency(INCOME - EXPENSE),
  );
  // 옮긴 돈은 차액에 안 들어간다. 위 차액에 더해지면 여기서 드러난다.
  await expect(report.closing.flowRow('transfer')).toContainText('옮긴 돈');
  await expect(report.closing.flowRow('transfer')).toContainText(formatCurrency(TRANSFER));

  // 한 번도 안 옮긴 달에는 무슨 말인지 모를 0원 대신 줄을 아예 뺀다.
  await report.open({ month: TWO_MONTHS_AGO });
  await report.waitReady();
  await report.closing.open();
  await report.closing.nextButton.click();
  await expect(report.closing.title).toHaveText('돈 흐름');

  await expect(report.closing.flowRow('expense')).toContainText(formatCurrency(QUIET_EXPENSE));
  await expect(report.closing.flowRow('delta')).toContainText(formatSignedCurrency(-QUIET_EXPENSE));
  await expect(report.closing.flowRow('transfer')).toHaveCount(0);
});
