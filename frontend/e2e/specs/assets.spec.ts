import { formatCurrency } from '../../src/shared/lib/format';
import { expect, test } from '../support/fixtures';

/**
 * 자산 화면.
 *
 * 순자산은 남은 예산·이번 달 차액과 다른 숫자다. 그 값을 서버가 세고 화면이 그대로
 * 그리는지, 부채를 더하면 순자산이 **줄어드는지**를 화면에서 본다.
 */

const CASH = 1_000_000;
const DEBT = 300_000;

// 아주 긴 이름. 항목 이름은 80자까지라 그 상한에 가깝게 만든다.
const VERY_LONG = '아주아주 길고 긴 이름의 예금 계좌 이름을 여기에 적어 봅니다 어디까지 늘어나나';

test('관리 탭에서 자산으로 들어가면 빈 상태가 있다', async ({ appShell, assets, manage }) => {
  await manage.open();
  await manage.waitReady();

  // 자산은 목록 줄이 아니라 예산 위의 요약 카드다. 순자산을 그 자리에서 보여준다.
  await expect(appShell.subScreenLinks('관리 하위 화면')).toHaveText([
    '목표',
    '카테고리 관리',
    '알림 설정',
    '앱 설정',
  ]);

  await manage.assetsEntry.click();
  await appShell.expectScreen('자산', '대략 알아도 충분해요. 나중에 언제든 바꿀 수 있어요');
  await assets.waitReady();

  await expect(assets.emptyTitle).toBeVisible();
  await expect(assets.startButton).toBeVisible();
  // 한 줄도 없을 때 0원 순자산과 구획 넷을 함께 펼치지 않는다.
  await expect(assets.netWorth).toHaveCount(0);
  await expect(assets.group('부채')).toHaveCount(0);
});

test('예적금을 적으면 순자산이 그 금액이 된다', async ({ assets }) => {
  await assets.open();
  await assets.waitReady();

  await assets.start({ group: '예적금·현금', name: '토스뱅크', amount: CASH });

  await expect(assets.netWorth).toHaveText(formatCurrency(CASH));
  await expect(assets.groupTotal('예적금·현금')).toHaveText(formatCurrency(CASH));
  await expect(assets.row('토스뱅크')).toHaveCount(1);
  // 적은 것이 없는 그룹도 구획은 남는다. 어디에 무엇을 적을 수 있는지 보여야 한다.
  await expect(assets.groupTotal('부채')).toHaveText(formatCurrency(0));
  await expect(assets.rows('부채')).toHaveCount(0);
});

test('부채를 더하면 순자산이 줄어든다', async ({ assets, prep }) => {
  await prep.putAssets([{ group: 'cash', label: '토스뱅크', amount: CASH }]);

  await assets.open();
  await assets.waitReady();
  await expect(assets.netWorth).toHaveText(formatCurrency(CASH));

  await assets.add('부채', { name: '학자금', amount: DEBT });

  // 부채는 양수로 적지만 순자산에서는 빠진다. 더했는데 늘어나면 방향이 뒤집힌 것이다.
  await expect(assets.netWorth).toHaveText(formatCurrency(CASH - DEBT));
  await expect(assets.groupTotal('부채')).toHaveText(formatCurrency(DEBT));
  await expect(assets.breakdown).toHaveText(
    `자산 ${formatCurrency(CASH)} − 부채 ${formatCurrency(DEBT)}`,
  );
});

test('항목을 지우면 그 자리에서 순자산이 맞는다', async ({ assets, prep }) => {
  await prep.putAssets([
    { group: 'cash', label: '토스뱅크', amount: CASH },
    { group: 'debt', label: '학자금', amount: DEBT },
  ]);

  await assets.open();
  await assets.waitReady();
  await expect(assets.netWorth).toHaveText(formatCurrency(CASH - DEBT));

  await assets.remove('학자금');

  await expect(assets.row('학자금')).toHaveCount(0);
  await expect(assets.netWorth).toHaveText(formatCurrency(CASH));
  await expect(assets.groupTotal('부채')).toHaveText(formatCurrency(0));
  // 남은 줄은 그대로다. 목록을 통째로 보내는 저장이라 한 줄을 지울 때 나머지가 함께 사라질 수 있다.
  await expect(assets.row('토스뱅크')).toHaveCount(1);
});

test('금액을 고치면 그 줄과 순자산이 함께 바뀐다', async ({ assets, prep }) => {
  await prep.putAssets([{ group: 'investment', label: '주식', amount: 700_000 }]);

  await assets.open();
  await assets.waitReady();

  await assets.openEdit('주식');
  // 지금 적혀 있는 값이 시트에 들어 있어야 한다. 빈 칸으로 열면 얼마였는지 다시 찾아야 한다.
  await expect(assets.sheet.amountField).toHaveValue('700,000');
  await expect(assets.sheet.nameField).toHaveValue('주식');
  await expect(assets.sheet.groupChoice('투자')).toHaveAttribute('aria-checked', 'true');

  await assets.sheet.fill({ amount: 900_000 });
  await assets.sheet.save();

  await expect(assets.netWorth).toHaveText(formatCurrency(900_000));
  await expect(assets.groupTotal('투자')).toHaveText(formatCurrency(900_000));
});

test('다시 들어와도 남아 있고 기준일이 보인다', async ({ appShell, assets, manage }) => {
  await assets.open();
  await assets.waitReady();
  await assets.start({ group: '보증금·기타', name: '전월세 보증금', amount: 50_000_000 });

  // 화면을 나갔다 들어온다. 저장 응답만 맞고 다음 조회가 비어 있으면 여기서 걸린다.
  await appShell.pressBack();
  await appShell.expectScreen('관리', '예산과 분류를 손봐요');
  await manage.waitReady();
  await manage.assetsEntry.click();
  await assets.waitReady();

  await expect(assets.netWorth).toHaveText(formatCurrency(50_000_000));
  await expect(assets.row('전월세 보증금')).toHaveCount(1);
  // 언제 적은 것인지 함께 적는다. 날짜가 없으면 오래된 숫자를 지금 값으로 읽는다.
  await expect(assets.basisLabel).toHaveText(/^내 순자산 · \d{1,2}월 \d{1,2}일 기준$/);
});

test('이름을 안 적으면 그룹 이름으로 부른다', async ({ assets }) => {
  await assets.open();
  await assets.waitReady();

  await assets.start({ group: '예적금·현금', amount: 250_000 });

  // '이름 없음' 으로 적지 않는다. 이름은 선택이라고 해 두고 빈자리로 표시하지 않는다.
  await expect(assets.row('예적금·현금')).toHaveCount(1);
  await expect(assets.netWorth).toHaveText(formatCurrency(250_000));
});

test('시스템 뒤로가기로 관리 탭에 돌아온다', async ({ appShell, assets, manage }) => {
  await manage.open();
  await manage.waitReady();
  await manage.assetsEntry.click();
  await assets.waitReady();

  // 하위 화면이라 탭바가 통째로 빠진다. 화면 안에 뒤로가기를 그리지도 않는다.
  await appShell.expectTabsHidden();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);
  await appShell.expectDocumentTitle('자산');

  await appShell.pressBack();
  await appShell.expectScreen('관리', '예산과 분류를 손봐요');
  await appShell.expectTabsVisible();
});

test('시트가 열려 있으면 뒤로가기가 시트를 먼저 닫는다', async ({ appShell, assets }) => {
  await assets.open();
  await assets.waitReady();

  await assets.startButton.click();
  await assets.sheet.waitOpen();

  await appShell.pressBack();

  // 시트가 열린 채 화면만 뒤로 빠지면 자산 화면 밖에 시트가 떠 있게 된다.
  await assets.sheet.waitClosed();
  await appShell.expectScreen('자산', '대략 알아도 충분해요. 나중에 언제든 바꿀 수 있어요');
});

test('긴 이름과 큰 금액에도 화면이 가로로 넘치지 않는다', async ({ assets, prep }) => {
  await prep.putAssets([
    { group: 'cash', label: VERY_LONG, amount: 98_765_432_100_000 },
    { group: 'debt', label: VERY_LONG, amount: 12_345_678_900_000 },
  ]);

  await assets.open();
  await assets.waitReady();
  await expect(assets.row(VERY_LONG)).toHaveCount(2);

  // 넘치면 브라우저가 화면을 축소해 탭바가 보이는 영역 밖으로 밀린다. 관리 탭으로 돌아갈 수 없다.
  const box = await assets.widths();
  expect(box.content, `${JSON.stringify(box)} 긴 이름이 화면을 가로로 밀었다`).toBeLessThanOrEqual(
    box.visible + 1,
  );
});

test('시트의 그룹 갈래 넷이 한 줄에 다 들어간다', async ({ assets }) => {
  await assets.open();
  await assets.waitReady();

  await assets.startButton.click();
  await assets.sheet.waitOpen();

  // 글자가 칸보다 넓으면 두 줄로 접혀서 34px 짜리 칸 안에서 위아래가 잘린다.
  for (const item of await assets.sheet.groupChoiceLines()) {
    expect(item.lines, `'${item.label}' 갈래가 두 줄로 접혔다`).toBe(1);
  }
});

test('진입 즉시 저절로 뜨는 시트가 없다', async ({ assets }) => {
  await assets.open();
  await assets.waitReady();

  // 자산을 묻는 시트가 저절로 열리면, 적을 준비가 안 된 사람이 닫는 것부터 배워야 한다.
  await expect(assets.sheet.dialog).toHaveCount(0);
});
