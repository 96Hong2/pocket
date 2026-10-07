import { lastMonth } from '../support/api';
import { expect, test } from '../support/fixtures';

/**
 * 앱이 그리는 뒤로 버튼은 어느 시트와 창에도 없다.
 *
 * 상단바의 ‹ 는 토스가 그린다. 시트나 창 머리에 하나 더 그리면 뒤로가기가 둘로 보여 검토에서
 * 반려된다(「내비게이션 바의 뒤로가기 버튼과 미니앱 자체 헤더 및 뒤로가기 버튼이 함께 노출돼요」).
 * 뒤로 가는 길은 토스 ‹, 폰 뒤로가기, Esc, 아래로 미는 손짓이다.
 *
 * 창을 하나씩 열어 그 창이 실제로 선 것을 본 뒤, 이름이 「뒤로」, 「이전」, ‹, ← 인 버튼을 센다.
 * 경로 화면은 `assets.spec.ts`, `goal.spec.ts` 가 같은 자로 잰다.
 */

test('기록 시트의 고르는 화면, 날짜, 금액, 태그, 새 분류, 저장 뒤 화면에 뒤로 버튼이 없다', async ({
  appShell,
  home,
  prep,
  recordSheet,
}) => {
  await prep.addTag('출장');

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await expect(recordSheet.wayGroup).toBeVisible();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);

  await recordSheet.dayButton.click();
  await expect(recordSheet.dayRow('오늘')).toBeVisible();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);
  await appShell.pressBack();
  await expect(recordSheet.wayGroup).toBeVisible();

  await recordSheet.next();
  await expect(recordSheet.amountTitle).toBeVisible();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);

  await recordSheet.tagChip.click();
  await expect(recordSheet.tagGroup).toBeVisible();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);
  await appShell.pressBack();
  await expect(recordSheet.amountTitle).toBeVisible();

  await recordSheet.input.openNewCategory();
  await expect(recordSheet.input.newCategoryForm.title).toBeVisible();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);
  await appShell.pressBack();
  await expect(recordSheet.amountTitle).toBeVisible();

  await recordSheet.input.enterAmount(12_000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);
});

test('글로 쓰기와 캡처로 정리의 적는 화면과 검토 화면에 뒤로 버튼이 없다', async ({
  appShell,
  home,
  recordSheet,
}) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();

  await recordSheet.chooseWay('글로 쓰기');
  await expect(recordSheet.nl.textarea).toBeVisible();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);
  await recordSheet.nl.analyze('점심 12000');
  await expect(recordSheet.nl.cancelButton).toBeVisible();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);
  await recordSheet.leavePanel();

  await recordSheet.chooseWay('캡처');
  await recordSheet.capture.pick();
  await expect(recordSheet.capture.cancelButton).toBeVisible();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);
});

test('저축·투자의 「다른 곳」 목록, 「새 종목이나 통장」, 저장 뒤 화면에 뒤로 버튼이 없다', async ({
  appShell,
  home,
  prep,
  recordSheet,
}) => {
  await prep.putAssets([
    { group: 'cash', amount: 1_000_000, label: '청년도약계좌' },
    { group: 'cash', amount: 500_000, label: '비상금통장' },
  ]);

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.chooseKind('저축·투자');

  await recordSheet.openOtherDest();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);

  await recordSheet.openNewDest();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);

  // 토스 ‹ 가 한 단계씩 물린다. 폼 → 목록 → 금액 화면.
  await appShell.pressBack();
  await expect(recordSheet.destList).toBeVisible();
  await appShell.pressBack();
  await expect(recordSheet.amountTitle).toBeVisible();

  await recordSheet.input.enterAmount(300_000);
  await recordSheet.pickDest('청년도약계좌');
  await recordSheet.input.saveButton.click();
  await expect(recordSheet.assetsButton).toBeVisible();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);
  // 저장 뒤 화면에서 토스 ‹ 는 「확인」 과 같이 창을 닫는다.
  await appShell.pressBack();
  await recordSheet.waitClosed();
});

test('기록 고치기에서 여는 「카테고리 바꾸기」, 「새 분류 만들기」, 「어디에」 창에 뒤로 버튼이 없다', async ({
  appShell,
  calendar,
  prep,
}) => {
  const food = await prep.categoryIdByName('식비');
  await prep.addTransaction({ amount: 12_000, merchant: '스타벅스', categoryId: food });
  const assets = await prep.putAssets([
    { group: 'cash', amount: 1_000_000, label: '청년도약계좌' },
    { group: 'cash', amount: 500_000, label: '비상금통장' },
  ]);
  const saving = assets.items.find((row) => row.label === '청년도약계좌');
  if (saving?.item_key == null) throw new Error('항목 키가 없다');
  await prep.addAssetTransfer({ amount: 300_000, itemKey: saving.item_key, memo: '도약 납입' });

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('스타벅스');
  await calendar.edit.waitOpen();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);

  const pick = calendar.edit.categoryPick;
  await calendar.edit.headCategoryButton.click();
  await expect(pick.dialog).toBeVisible();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);

  await pick.newCategoryButton.click();
  await expect(calendar.edit.newCategoryTitle).toBeVisible();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);
  // 토스 ‹ 는 만들기 한 겹만 접는다. 고치던 시트는 남는다.
  await appShell.pressBack();
  await expect(calendar.edit.newCategoryTitle).toHaveCount(0);
  await calendar.edit.waitOpen();
  await appShell.pressBack();
  await calendar.edit.waitClosed();

  await calendar.list.pick('도약 납입');
  await calendar.edit.waitOpen();
  await calendar.edit.headDestButton.click();
  await expect(calendar.edit.destPage).toBeVisible();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);
  await appShell.pressBack();
  await expect(calendar.edit.destPage).toHaveCount(0);
  await calendar.edit.waitOpen();
});

test('자산 화면의 항목 창, 순자산 창, 「바뀐 것만 고쳐요」 창에 뒤로 버튼이 없다', async ({
  appShell,
  assets,
  home,
  prep,
}) => {
  await prep.putAssets([
    { group: 'cash', label: '카카오뱅크', amount: 1_000_000 },
    { group: 'debt', label: '학자금', amount: 300_000 },
  ]);
  await prep.moveLatestAssetSnapshot(`${lastMonth()}-15`);

  await home.open();
  await home.waitReady();
  await home.assetCheckin.changedButton.click();
  await expect(assets.checkin.dialog).toBeVisible();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);
  await appShell.pressBack();
  await expect(assets.checkin.dialog).toHaveCount(0);

  await assets.openEdit('카카오뱅크');
  await assets.sheet.waitOpen();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);
  await appShell.pressBack();
  await assets.sheet.waitClosed();

  await assets.netWorthButton.click();
  await expect(assets.detailSheet).toBeVisible();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);
  await appShell.pressBack();
  await expect(assets.detailSheet).toHaveCount(0);
});

test('공유 가계부에 적은 뒤 화면에 뒤로 버튼이 없다', async ({
  appShell,
  home,
  prep,
  recordSheet,
}) => {
  await prep.createBook({ name: '우리 집', myName: '은홍' });

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.destination.pill('우리 집').click();
  await recordSheet.next();
  await recordSheet.input.enterAmount(32_000);
  await recordSheet.input.pickCategory('장보기');

  await expect(recordSheet.bookFeedback.savedLabel('우리 집')).toBeVisible();
  await expect(appShell.selfDrawnBackControls).toHaveCount(0);
  // 토스 ‹ 는 「확인」 과 같이 창을 닫는다.
  await appShell.pressBack();
  await recordSheet.waitClosed();
});
