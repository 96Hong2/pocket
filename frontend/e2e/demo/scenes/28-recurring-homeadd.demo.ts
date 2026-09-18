import { expect, test } from '../support/director';

/**
 * 반복 지출과 홈 화면 추가 카드 한 장면.
 *
 * 둘 다 홈에 스스로 나타나는 카드다. 하나는 사실을 알리고(오늘 돈이 나간다) 하나는
 * 한 번뿐인 안내다. 영상에서도 그 둘이 어떻게 다른지가 보여야 한다.
 */

/** 오늘 날짜. 그날로 걸어야 카드가 뜬다. */
function today(): number {
  return new Date().getDate();
}

test.use({ showStarterCards: true });

test('57 매달 나가는 돈을 미리 적어 두고, 홈에 앱을 놓는다', async ({
  demo,
  home,
  page,
  recurring,
}) => {
  await recurring.open();
  await recurring.waitReady();
  await demo.open('반복 지출', '매달 같은 날 나가는 돈을 전날에 알려 준다');

  await demo.step('걸어 둔 것이 없으면 무엇을 하는 자리인지만 말한다');
  await expect(recurring.emptyTitle).toBeVisible();
  await demo.beat(3);

  await demo.step('무엇이·얼마·며칟날 셋만 받는다');
  await recurring.addButton.click();
  await expect(recurring.sheet('새 반복 지출')).toBeVisible();
  await demo.beat(2);

  await recurring.nameInput.fill('넷플릭스');
  await demo.beat(1);
  await page.getByRole('dialog').getByLabel('금액').fill('17000');
  await demo.beat(1);
  await recurring.daySelect.selectOption(String(today()));
  await demo.beat(2);
  await recurring.saveButton('만들기').click();
  await expect(recurring.row('넷플릭스')).toBeVisible();
  await demo.beat(3);

  // 하위 화면에는 탭바가 없다(세 탭 루트에서만 선다). 홈으로는 주소로 돌아간다.
  await demo.step('그날이 가까워지면 홈이 먼저 말한다');
  await home.open();
  await home.waitReady();
  await expect(home.recurring.card).toBeVisible();
  await demo.beat(4);

  await demo.step('자동으로 적지 않는다. 누르는 것은 사람이다');
  await expect(home.recurring.dismissButton).toBeVisible();
  await demo.beat(3);

  await demo.step('누르면 그 자리에서 기록이 된다');
  await home.recurring.recordButton.click();
  await expect(home.recurring.card).toHaveCount(0);
  await expect(home.today.row('넷플릭스')).toBeVisible();
  await demo.beat(4);

  await demo.step('한 번이라도 적으면 홈에 두라는 카드가 선다');
  await expect(home.addToHome.card).toBeVisible();
  await demo.beat(4);

  await demo.step('알림은 바로 아래 딴 카드다. 닫는 ✕ 도 따로다');
  await expect(home.remind.card).toBeVisible();
  await demo.beat(3);

  await demo.step('버튼 하나로 저녁 8시가 정해진다');
  await home.remind.turnOnButton.click();
  await expect(home.remind.card).toContainText('저녁 8시에 알려 드릴게요');
  await demo.beat(4);

  await demo.step('누르면 토스 메뉴 이름 그대로 세 단계를 알려 준다');
  await home.addToHome.openButton.click();
  await expect(home.addToHome.sheet).toBeVisible();
  await demo.beat(5);

  await home.addToHome.doneButton.click();

  await demo.step('닫으면 다시 안 뜬다. 한 번뿐인 안내다');
  await home.addToHome.closeButton.click();
  await expect(home.addToHome.card).toHaveCount(0);
  await demo.beat(3);

  await demo.step('예고는 알려 주기만 한다. 적는 것은 사람이 누른다');
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
