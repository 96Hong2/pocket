import { formatCurrency } from '../../../src/shared/lib/format';
import { thisMonth, type PrepApi } from '../../support/api';
import { CAPTURE_DATA_URI, mockImagesSeeded, seedMockImages } from '../../support/deviceMock';
import { expect, test } from '../support/director';

/**
 * 기록하기의 넷째 종류 「저축·투자」 세 장면.
 *
 * 63 은 키패드로 한 건. 분류 대신 「어디에」 를 고르고, 저장하면 내 자산이 움직이고
 * 홈 남은 예산은 그대로다. 64 와 65 는 캡처와 글로 내 자산을 한 번에 채운다.
 * 둘 다 같은 검토 화면을 지나 저장하면 기록 목록이 아니라 내 자산 화면으로 간다.
 *
 * 사진과 글은 서버 스텁이 읽는다. 캡처는 그림을 보지 않고 늘 같은 다섯 줄(잔액 셋, 보유 종목 둘)을
 * 내고, 글은 「삼성전자 10주 72만원」 같은 모양을 규칙으로 읽는다(backend/app/integrations/llm/stub.py).
 * 여기서 보이는 것은 읽는 솜씨가 아니라 읽은 것을 화면이 어떻게 다루는가다.
 */

/** 홈이 빈 화면이나 음수로 서지 않게 이번 달 월급과 지출 두 건을 심는다. */
async function seedMonth(prep: PrepApi): Promise<void> {
  await prep.addTransaction({
    amount: 3_200_000,
    type: 'income',
    merchant: '월급',
    categoryId: await prep.categoryIdByName('월급'),
    on: `${thisMonth()}-01`,
  });
  await prep.addTransaction({ amount: 8_000, merchant: '김밥천국', categoryId: await prep.categoryIdByName('식비') });
  await prep.addTransaction({ amount: 4_500, merchant: '스타벅스', categoryId: await prep.categoryIdByName('카페·간식') });
}

test('63 저축·투자를 고르고 적금에 넣은 돈을 적는다', async ({ assets, demo, home, prep, recordSheet }) => {
  await prep.putAssets([
    { group: 'cash', label: '카카오뱅크 적금', amount: 1_200_000, monthly: 300_000 },
    { group: 'cash', label: '청년도약계좌', amount: 3_300_000, monthly: 700_000 },
    { group: 'investment', label: '삼성전자', kind: 'stock', quantity: '10', cost: 720_000, amount: 780_000 },
  ]);
  await prep.setBudget(1_500_000);
  await prep.addTransaction({ amount: 8_000, merchant: '김밥천국', categoryId: await prep.categoryIdByName('식비') });
  await prep.addTransaction({ amount: 32_900, merchant: '쿠팡', daysAgo: 1, categoryId: await prep.categoryIdByName('쇼핑') });
  const left = 1_500_000 - 8_000 - 32_900;

  await home.open();
  await home.waitReady();
  await demo.open('저축·투자 기록', '적금에 넣은 돈은 쓴 돈과 따로 적는다');
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(left));

  await demo.step('기록하기를 누르면 먼저 언제, 어떻게, 무엇을 적을지 고른다');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await expect(recordSheet.dayButton).toContainText('오늘');
  await expect(recordSheet.kindChip('지출')).toHaveAttribute('aria-checked', 'true');
  await demo.beat(2);

  await demo.step('종류에서 저축·투자를 고르고 다음을 누른다');
  await recordSheet.kindChip('저축·투자').click();
  await expect(recordSheet.kindChip('저축·투자')).toHaveAttribute('aria-checked', 'true');
  await demo.beat();
  await recordSheet.next();
  await expect(recordSheet.amountTitle).toHaveText('얼마를 어디에 넣었어요?');
  await demo.beat();

  await demo.step('분류 대신 어디에 넣었는지 고른다. 내 자산의 통장과 종목이 선다');
  await expect(recordSheet.destCell('카카오뱅크 적금')).toBeVisible();
  await expect(recordSheet.destCell('청년도약계좌')).toBeVisible();
  await demo.beat(2);

  await demo.step('카카오뱅크 적금을 누르고 300,000원을 친다');
  await recordSheet.pickDest('카카오뱅크 적금');
  await expect(recordSheet.destPicked).toContainText('카카오뱅크 적금');
  await recordSheet.input.enterAmount(300_000);
  await demo.beat();

  await demo.step('저장하면 어디에 얼마 넣었는지 말한다');
  await recordSheet.input.saveButton.click();
  await expect(recordSheet.feedback.headline).toHaveText('카카오뱅크 적금에 300,000원 넣었어요');
  await demo.beat(3);

  await demo.step('자산 보기를 누르면 내 자산 화면이다. 적금이 그만큼 늘었다');
  await recordSheet.assetsButton.click();
  await recordSheet.waitClosed();
  await assets.waitReady();
  await expect(assets.row('카카오뱅크 적금')).toContainText(formatCurrency(1_500_000));
  await demo.beat(3);

  await demo.step('쓴 돈이 아니라서 홈의 남은 예산은 그대로다');
  await home.open();
  await home.waitReady();
  await expect(home.hero.remainingBudget).toHaveText(formatCurrency(left));
  await expect(home.today.rowSubtitle('카카오뱅크 적금')).toHaveText('저축·투자');
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('64 캡처 한 장으로 내 자산을 채운다', async ({ assets, demo, home, page, prep, recordSheet }) => {
  await seedMockImages(CAPTURE_DATA_URI)(page);
  await seedMonth(prep);
  await prep.putAssets([
    { group: 'cash', label: '청년도약계좌', amount: 3_300_000, monthly: 700_000 },
    { group: 'cash', label: '카카오뱅크', amount: 1_000_000 },
  ]);

  await home.open();
  await home.waitReady();
  expect(await mockImagesSeeded(page), '목에 사진이 안 심겼다').toBe(true);
  await demo.open('캡처로 자산 채우기', '은행과 증권 앱 화면을 캡처한 사진 한 장으로');

  await demo.step('기록하기에서 캡처로 정리를 고르고 종류는 저축·투자');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('캡처로 정리').click();
  await recordSheet.kindChip('저축·투자').click();
  await expect(recordSheet.nextButton).toHaveText('사진 고르기');
  await demo.beat(2);

  await demo.step('읽는 동안 광고가 한 번 지나간다고 버튼 바로 아래에 먼저 적혀 있다');
  await expect(recordSheet.assetFill.adLine).toBeVisible();
  await demo.beat(2);

  await demo.step('사진 고르기를 누르고 캡처 한 장을 고른다');
  await recordSheet.next();
  await recordSheet.assetFill.waitStep('review');
  await expect(recordSheet.assetFill.rows).toHaveCount(5);
  await demo.beat(2);

  await demo.step('이미 있는 통장은 그대로인지, 얼마 늘었는지가 줄마다 붙는다');
  await expect(recordSheet.assetFill.row('청년도약계좌')).toContainText('그대로');
  await expect(recordSheet.assetFill.row('카카오뱅크')).toContainText(`+${formatCurrency(250_000)}`);
  await demo.beat(3);

  await demo.step('처음 보는 연금과 주식은 새 항목으로 온다');
  await expect(recordSheet.assetFill.row('연금저축펀드')).toContainText('새 항목, 연금');
  await expect(recordSheet.assetFill.row('엔비디아')).toContainText('새 항목, 투자');
  await recordSheet.assetFill.row('마이크로소프트').scrollIntoViewIfNeeded();
  await demo.beat(3);

  await demo.step('넣지 않을 줄은 눌러서 끈다. 버튼 숫자가 함께 준다');
  await recordSheet.assetFill.row('마이크로소프트').click();
  await expect(recordSheet.assetFill.row('마이크로소프트')).toHaveAttribute('aria-checked', 'false');
  await expect(recordSheet.assetFill.saveButton).toHaveText('4줄 저장');
  await demo.beat(2);

  await demo.step('저장하면 내 자산 화면으로 가서 채워진 것을 보여 준다');
  await recordSheet.assetFill.saveButton.click();
  await recordSheet.waitClosed();
  await assets.waitArrived();
  await expect(assets.row('카카오뱅크')).toContainText(formatCurrency(1_250_000));
  await expect(assets.groupTotal('연금')).toHaveText(formatCurrency(2_100_000));
  await expect(assets.row('엔비디아')).toBeVisible();
  await expect(assets.row('마이크로소프트')).toHaveCount(0);
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});

test('65 글 한 줄로 내 자산을 채운다', async ({ assets, demo, home, prep, recordSheet }) => {
  await seedMonth(prep);
  await home.open();
  await home.waitReady();
  await demo.open('글로 자산 채우기', '가진 종목과 통장을 한 줄로 적는다');

  await demo.step('기록하기에서 글로 쓰기를 고르고 종류는 저축·투자');
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.methodTab('글로 쓰기').click();
  await recordSheet.kindChip('저축·투자').click();
  await expect(recordSheet.kindChip('저축·투자')).toHaveAttribute('aria-checked', 'true');
  await demo.beat(2);

  await demo.step('다음을 누르면 어디에 얼마 있는지 적는 칸이 선다');
  await recordSheet.next();
  await expect(recordSheet.assetFill.textarea).toBeVisible();
  await demo.beat(2);

  await demo.step('삼성전자 10주와 적금을 한 줄에 적고 분석을 누른다');
  await recordSheet.assetFill.textarea.fill('삼성전자 10주 72만원, 카카오뱅크 적금 300만원');
  await demo.beat(2);
  await recordSheet.assetFill.analyzeButton.click();
  await recordSheet.assetFill.waitStep('review');
  await expect(recordSheet.assetFill.rows).toHaveCount(2);
  await demo.beat();

  await demo.step('종목은 몇 주를 얼마에 샀는지, 통장은 어느 그룹인지 갈라 읽는다');
  await expect(recordSheet.assetFill.row('삼성전자')).toContainText('새 항목, 투자');
  await expect(recordSheet.assetFill.row('삼성전자')).toContainText(`10주 보유, 넣은 돈 ${formatCurrency(720_000)}`);
  await expect(recordSheet.assetFill.row('카카오뱅크 적금')).toContainText('새 항목, 예적금·현금');
  await demo.beat(4);

  await demo.step('2줄 저장을 누르면 내 자산 화면이다');
  await expect(recordSheet.assetFill.saveButton).toHaveText('2줄 저장');
  await recordSheet.assetFill.saveButton.click();
  await recordSheet.waitClosed();
  await assets.waitArrived();
  await expect(assets.row('삼성전자')).toContainText(formatCurrency(720_000));
  await expect(assets.row('카카오뱅크 적금')).toContainText(formatCurrency(3_000_000));
  await demo.beat(3);

  await demo.step('순자산이 적은 만큼 맨 위에 선다');
  await expect(assets.netWorth).toHaveText(formatCurrency(3_720_000));
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
