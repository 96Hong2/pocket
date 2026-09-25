import { expect, test } from '../support/fixtures';

/**
 * 태그. 카테고리와 다른 축으로 기록을 묶는다.
 *
 * 확인할 것은 다섯이다: 만들고 고치고 지운다, 저장한 뒤에 단다, 목록 줄에 표식이 붙는다,
 * 리포트에서 묶음별로 갈린다, **지출 태그와 수입 태그가 섞이지 않는다.**
 *
 * 마지막 것이 이 기능에서 제일 중요하다. 섞이면 리포트가 번 돈과 쓴 돈을 한 조각에 더한다.
 */

test('만들고 고치고, 쓰인 건수까지 보여준다', async ({ tags }) => {
  await tags.open();
  await tags.waitReady();

  await tags.create('지출 태그', '출장');
  await expect(tags.group('지출 태그').getByText('출장', { exact: true })).toBeVisible();
  // 아직 아무 기록에도 안 달렸다. 0건이 정상이다.
  await expect(tags.usageCount('출장')).toHaveText('0건');

  await test.step('이름을 고치면 목록이 바로 바뀐다', async () => {
    await tags.editButton('출장').click();
    await expect(tags.sheet('태그 고치기')).toBeVisible();
    await tags.nameInput.fill('외근');
    await tags.saveButton('고치기').click();
    await expect(tags.group('지출 태그').getByText('외근', { exact: true })).toBeVisible();
  });
});

test('지출 태그와 수입 태그는 같은 이름을 따로 쓴다', async ({ tags }) => {
  await tags.open();
  await tags.waitReady();

  await tags.create('지출 태그', '출장');
  await tags.create('수입 태그', '출장');

  // 「출장」 이 지출에도 수입에도 있는 사람이 있다. 목록이 갈려 있으니 이름도 갈린다.
  await expect(tags.group('지출 태그').getByText('출장', { exact: true })).toBeVisible();
  await expect(tags.group('수입 태그').getByText('출장', { exact: true })).toBeVisible();
});

test('저장한 뒤에 태그를 달고, 목록 줄에 표식이 붙는다', async ({
  home,
  recordSheet,
  tags,
}) => {
  await tags.open();
  await tags.waitReady();
  await tags.create('지출 태그', '출장');

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(12000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  /*
    **저장이 끝난 다음에 묻는다.** 적는 화면에 칸이 하나 더 서면 10초 약속이 깨진다.
    결제 수단과 같은 자리, 같은 규칙이다.
  */
  await recordSheet.feedback.tagChip('출장').click();
  await expect(recordSheet.feedback.tagChip('출장')).toHaveAttribute('aria-pressed', 'true');
  await recordSheet.closeByEsc();

  // 목록 줄에 표식이 붙는다. 무엇이 어느 묶음인지 훑으면서 알 수 있어야 한다.
  await expect(home.today.row('출장')).toBeVisible();
});

test('눌린 태그를 다시 누르면 떨어진다', async ({ home, recordSheet, tags }) => {
  await tags.open();
  await tags.waitReady();
  await tags.create('지출 태그', '출장');

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(9000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  await recordSheet.feedback.tagChip('출장').click();
  await expect(recordSheet.feedback.tagChip('출장')).toHaveAttribute('aria-pressed', 'true');

  // 잘못 단 태그를 되무를 길이 이것뿐이다.
  await recordSheet.feedback.tagChip('출장').click();
  await expect(recordSheet.feedback.tagChip('출장')).toHaveAttribute('aria-pressed', 'false');
});

test('태그가 하나도 없어도 어디서 만드는지 알려준다', async ({ home, recordSheet }) => {
  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(5000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  // 「태그가 없어요」 만 적으면 어디서 만드는지 모른다.
  await expect(recordSheet.feedback.tagManageLink).toBeVisible();
});

/**
 * 태그를 만든 뒤에도 그 길이 남는다.
 *
 * 예전에는 하나도 없을 때만 보여 줬다. 하나 만들고 나면 둘째를 만들러 갈 자리가 화면에서
 * 사라져, 기록을 적다 「이건 따로 묶고 싶다」 고 생각한 순간에 갈 곳이 없었다.
 */
test('태그가 있어도 관리로 가는 길이 남는다', async ({ calendar, prep, recordSheet, home, tags }) => {
  await tags.open();
  await tags.waitReady();
  await tags.create('지출 태그', '데이트');

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(5000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await expect(recordSheet.feedback.tagChip('데이트')).toBeVisible();
  await expect(recordSheet.feedback.tagManageLink).toBeVisible();
  await recordSheet.closeByEsc();

  await test.step('고치는 시트에도 있다', async () => {
    await prep.addTransaction({ amount: 9000, merchant: '영화관' });
    await calendar.open();
    await calendar.waitReady();
    await calendar.list.pick('영화관');
    await calendar.edit.waitOpen();
    await expect(calendar.edit.tagManageLink).toBeVisible();
  });
});

test('리포트에서 태그별로 갈린다', async ({ home, recordSheet, report, tags }) => {
  await tags.open();
  await tags.waitReady();
  await tags.create('지출 태그', '출장');

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(30000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.tagChip('출장').click();
  await expect(recordSheet.feedback.tagChip('출장')).toHaveAttribute('aria-pressed', 'true');
  await recordSheet.closeByEsc();

  await report.open();
  await report.waitReady();

  await expect(report.tagCard('지출')).toBeVisible();
  // 태그를 단 돈 안에서의 비중이다. 한 건뿐이니 100% 다.
  await expect(report.tagRow('출장')).toContainText('100%');
});

test('지운 태그는 목록에서 사라지고 기록은 남는다', async ({
  home,
  recordSheet,
  tags,
}) => {
  await tags.open();
  await tags.waitReady();
  await tags.create('지출 태그', '출장');

  await home.open();
  await home.waitReady();
  await home.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(12000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();
  await recordSheet.feedback.tagChip('출장').click();
  await expect(recordSheet.feedback.tagChip('출장')).toHaveAttribute('aria-pressed', 'true');
  await recordSheet.closeByEsc();

  await tags.open();
  await tags.waitReady();
  // 지우기 전에 몇 건이 이 태그를 잃는지 먼저 말한다.
  await expect(tags.usageCount('출장')).toHaveText('1건');

  await tags.editButton('출장').click();
  await tags.deleteButton.click();
  await expect(tags.confirmSheet).toBeVisible();
  await expect(tags.confirmSheet).toContainText('기록과 금액은 그대로 남아요');
  await tags.confirmDelete.click();

  await expect(tags.group('지출 태그').getByText('출장', { exact: true })).toHaveCount(0);

  // 지운 것은 태그지 그날 쓴 돈이 아니다.
  await home.open();
  await home.waitReady();
  await expect(home.today.row('식비')).toBeVisible();
});

/**
 * 색은 **파스텔 열넷, 한 줄에 일곱씩 두 줄**이다.
 *
 * 처음에는 진한 여덟 색이었다. 칩이 여러 개 선 화면이 시끄러웠고, 여덟으로는 비슷한
 * 묶음 둘을 갈라 놓을 색이 모자랐다. 개수와 줄 수를 여기서 못 박는다. flex 로 접히게
 * 두면 폭에 따라 6개·8개로 갈려 줄이 들쭉날쭉해진다.
 */
test('색은 열네 개가 두 줄로 선다', async ({ tags }) => {
  await tags.open();
  await tags.waitReady();

  await tags.newButton('지출 태그').click();
  await expect(tags.sheet('새 태그')).toBeVisible();

  await expect(tags.colorButtons).toHaveCount(14);
  expect(await tags.colorRowCount(), '색 칸이 두 줄로 안 선다').toBe(2);

  await test.step('고른 색이 그대로 목록 표식이 된다', async () => {
    await tags.nameInput.fill('데이트');
    await tags.colorButton('라벤더').click();
    await tags.saveButton('만들기').click();
    await expect(tags.sheet('새 태그')).toHaveCount(0);

    const mark = tags.group('지출 태그').locator('.tags-row__mark');
    /*
      **hex 를 여기 적지 않는다.** 적어 뒀더니 팔레트를 손볼 때마다 이 검사가 이유 없이
      빨개졌다. 재려는 것은 「라벤더를 골랐으면 라벤더가 칠해진다」 이지 그 색의 값이 아니다.
    */
    const lilac = await mark.evaluate((node) => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--tag-lilac)';
      node.appendChild(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    });
    await expect(mark).toHaveCSS('background-color', lilac);
  });
});

/** 카드가 딱 붙어 있으면 긴 목록에서 지출이 어디서 끝나는지 안 읽힌다. */
test('지출 묶음과 수입 묶음 사이에 여백이 있다', async ({ tags }) => {
  await tags.open();
  await tags.waitReady();

  const boxes = await tags.groupCards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { top: box.y, bottom: box.y + box.height };
    }),
  );
  expect(boxes).toHaveLength(2);
  expect(boxes[1].top - boxes[0].bottom, '두 묶음이 붙어 있다').toBeGreaterThanOrEqual(10);
});

/** 무엇에 쓰는 것인지 한 줄로 말한다. 예시가 「출장」 하나뿐이라 쓸 자리가 안 떠올랐다. */
test('태그 화면이 무엇에 쓰는지 한 줄로 말한다', async ({ page, tags }) => {
  await tags.open();
  await tags.waitReady();

  await expect(page.getByText('카테고리와는 별개로 통계가 나와요. 「정산완료」 「데이트」 처럼요')).toBeVisible();
});

/**
 * 달력에서도 태그를 단다.
 *
 * 고친 자리가 홈에만 있으면, 지난 날을 되짚다 「이건 데이트였지」 하고 떠올린 그 순간에
 * 갈 곳이 없다. 달력의 수정 시트와 그 날에 적는 시트 **둘 다** 확인한다.
 */
test('달력에서 고칠 때도 태그를 단다', async ({ calendar, prep, tags }) => {
  await tags.open();
  await tags.waitReady();
  await tags.create('지출 태그', '데이트');

  await prep.addTransaction({ amount: 12000, merchant: '영화관' });

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('영화관');
  await calendar.edit.waitOpen();

  await calendar.edit.tagChip('데이트').click();
  await calendar.edit.done();

  // 목록 줄에 표식이 붙는다. 무엇을 달았는지 목록에서 바로 읽힌다.
  await expect(calendar.list.tagMark('데이트')).toBeVisible();
});

test('달력에서 그 날에 적을 때도 태그를 단다', async ({ calendar, recordSheet, tags }) => {
  await tags.open();
  await tags.waitReady();
  await tags.create('지출 태그', '정산완료');

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.recordButton.click();
  await recordSheet.waitOpen();
  await recordSheet.input.enterAmount(8000);
  await recordSheet.input.pickCategory('식비');
  await recordSheet.feedback.waitSaved();

  // 저장이 끝난 뒤에 묻는다. 적는 화면에 칸이 하나 더 서면 10초 약속이 깨진다.
  await recordSheet.feedback.tagChip('정산완료').click();
  await recordSheet.feedback.confirmButton.click();
  await recordSheet.waitClosed();

  await expect(calendar.list.tagMark('정산완료')).toBeVisible();
});
