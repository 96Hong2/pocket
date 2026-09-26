import { expect, test } from '../support/director';

/**
 * 태그와 메모 한 장면.
 *
 * 둘 다 **저장이 끝난 다음에** 묻는 값이다. 적는 화면에 칸이 하나 더 서면 10초 약속이
 * 깨지므로, 영상도 저장을 먼저 보여 주고 그 뒤에 두 칸이 나오는 순서를 그대로 따라간다.
 */

test('56 태그와 메모로 기록을 묶는다', async ({
  calendar,
  demo,
  home,
  recordSheet,
  report,
  tags,
}) => {
  await tags.open();
  await tags.waitReady();
  await demo.open('태그와 메모', '카테고리와 다른 축으로 묶고, 한마디를 남긴다');

  await demo.step('관리 › 태그에서 색을 골라 만든다');
  await tags.newButton('지출 태그').click();
  await expect(tags.sheet('새 태그')).toBeVisible();
  await demo.beat(2);

  await tags.nameInput.fill('출장');
  await demo.beat(1);
  await tags.colorButton('파랑').click();
  await demo.beat(2);
  await tags.saveButton('만들기').click();
  await expect(tags.group('지출 태그').getByText('출장', { exact: true })).toBeVisible();
  await demo.beat(2);

  await demo.step('지출 태그와 수입 태그는 서로 다른 목록이다');
  await expect(tags.group('수입 태그')).toBeVisible();
  await demo.beat(3);

  // 하위 화면에는 탭바가 없다(세 탭 루트에서만 선다). 홈으로는 주소로 돌아간다.
  await demo.step('이제 기록한다. 적는 화면은 그대로 열 걸음이다');
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(23000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await demo.beat(2);

  await demo.step('저장이 끝난 다음에 상호·메모·태그를 묻는다');
  await recordSheet.feedback.writeMerchant('부산 국밥');
  await demo.beat(1);
  await recordSheet.feedback.writeMemo('출장 첫날 저녁');
  await demo.beat(2);

  await demo.step('태그는 하나만 단다. 여럿 달면 비율이 거짓이 된다');
  await recordSheet.feedback.tagChip('출장').click();
  await expect(recordSheet.feedback.tagChip('출장')).toHaveAttribute('aria-pressed', 'true');
  await demo.beat(3);

  await recordSheet.closeByEsc();

  await demo.step('목록 줄은 분류 이름 대신 내가 적은 한마디를 보여 준다');
  await expect(home.today.row('부산 국밥')).toBeVisible();
  await expect(home.today.row('출장 첫날 저녁')).toBeVisible();
  await demo.beat(4);

  await demo.step('달력에서 태그 이름으로도 찾는다');
  await calendar.open();
  await calendar.waitReady();
  await calendar.search.find('출장');
  await expect(calendar.list.row('부산 국밥')).toBeVisible();
  await demo.beat(4);

  await demo.step('금액으로도 찾는다. 23,000원이면 23,000원대가 나온다');
  await calendar.search.find('23,000원');
  await expect(calendar.list.row('부산 국밥')).toBeVisible();
  await demo.beat(4);

  await demo.step('리포트에서는 묶음별로 얼마가 갔는지 본다');
  await report.open();
  await report.waitReady();
  // 카드가 화면 아래에 있다. 스크롤해서 보여 주지 않으면 영상에 안 찍힌다.
  await report.tagCard('지출').scrollIntoViewIfNeeded();
  await expect(report.tagCard('지출')).toBeVisible();
  await demo.beat(5);

  await demo.step('카테고리는 「무엇에 썼나」, 태그는 「어떤 묶음인가」');
  await demo.beat(3);

  await demo.clearStep();
  await demo.beat(2);
});
