import { formatCurrency, formatNumber } from '../../src/shared/lib/format';
import { logsNamed } from '../support/aitMock';
import { E2E_API_URL } from '../support/env';
import { expect, test } from '../support/fixtures';

/**
 * 이미 적어 둔 것을 고치고 지우는 자리. **끝이 안 좋게 났을 때 무엇이 남는가.**
 *
 * 잘 되는 길은 `ledger.spec.ts` 가 이미 밟는다. 여기서 보는 것은 그 길이 끊겼을 때,
 * 그리고 목록이 아니라 검색 결과에서 같은 일을 할 때다. 고친 값이 사라지면 지하철에서
 * 다시 쳐 넣을 사람이 없고, 지운 줄 알았던 줄이 남아 있으면 다음에 그 줄을 다시 보고도
 * 무엇이 맞는지 알 수 없어진다.
 */

test.describe('통신이 끊겼을 때', () => {
  test.use({
    // 우리가 일부러 막은 응답이다. 브라우저가 적는 줄이고 앱이 낸 오류가 아니다.
    consoleErrorAllowList: [/Failed to load resource[\s\S]*500|net::ERR_FAILED/],
  });

  test('수정 저장이 실패하면 시트가 닫히지 않고 고친 값이 그대로 남는다', async ({
    calendar,
    page,
    prep,
  }) => {
    await prep.addTransaction({ amount: 12_000, merchant: '스타벅스' });

    await calendar.open();
    await calendar.waitReady();

    await page.route(`${E2E_API_URL}/api/v1/transactions/*`, async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 500, body: '{}' });
        return;
      }
      await route.continue();
    });

    await calendar.list.pick('스타벅스');
    await calendar.edit.waitOpen();
    await calendar.edit.merchant.fill('스타벅스 강남');
    await calendar.edit.amount.fill('15000');
    await calendar.edit.doneButton.click();

    // 시트가 닫히면 방금 친 것을 처음부터 다시 쳐야 한다. 거기서 그만두는 사람이 있다.
    await calendar.edit.waitOpen();
    await expect(calendar.edit.notice).toBeVisible();
    await expect(calendar.edit.merchant).toHaveValue('스타벅스 강남');
    await expect(calendar.edit.amount).toHaveValue(formatNumber(15_000));

    // 안 간 저장이 간 것처럼 보이면 안 된다. 다시 열어 서버에 남은 것을 본다.
    await calendar.open();
    await calendar.waitReady();
    await expect(calendar.list.row('스타벅스')).toBeVisible();
    await expect(calendar.list.row('스타벅스 강남')).toHaveCount(0);
    await expect(calendar.totals.expense).toHaveText(formatCurrency(12_000));
  });

  test('삭제가 실패하면 물음이 닫히고 기록은 그대로 남는다', async ({ calendar, page, prep }) => {
    await prep.addTransaction({ amount: 9_000, merchant: '편의점' });

    await calendar.open();
    await calendar.waitReady();

    await page.route(`${E2E_API_URL}/api/v1/transactions/*`, async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    await calendar.list.pick('편의점');
    await calendar.edit.waitOpen();
    await calendar.edit.askDelete();
    await calendar.edit.confirmDeleteButton.click();

    // 물음이 그대로 떠 있으면 같은 버튼을 계속 누르게 된다.
    await expect(calendar.edit.deleteConfirm).toHaveCount(0);
    // 시트가 닫히면 지워진 줄 알고 넘어갔다가 나중에 그 줄을 다시 본다.
    await calendar.edit.waitOpen();
    /*
      지우기를 시도한 사람에게 하는 말이어야 한다. 예전에는 고칠 때와 같은 한 줄이 떠서
      「입력한 값은 그대로 있어요」 라고 했는데, 이 사람이 궁금한 것은 지워졌는지다.

      **화면을 떠나기 전에 본다.** 달력으로 돌아간 뒤에 보면 시트가 이미 없어서,
      무엇이 적혀 있었든 「없다」 로 지나간다.
    */
    await expect(calendar.edit.notice).toHaveText('지우지 못했어요. 기록은 그대로 있어요.');

    await calendar.open();
    await calendar.waitReady();
    await expect(calendar.list.row('편의점')).toBeVisible();
    await expect(calendar.totals.expense).toHaveText(formatCurrency(9_000));
  });
});

test('검색 결과에서 고치고 지우면 결과 목록과 건수가 함께 줄어든다', async ({ calendar, prep }) => {
  await prep.addTransaction({ amount: 12_000, merchant: '카페 노랑', minutesAgo: 1 });
  await prep.addTransaction({ amount: 8_000, merchant: '카페 파랑', minutesAgo: 2 });

  await calendar.open();
  await calendar.waitReady();

  // 검색 중에는 달력과 그 날 목록이 사라지고 결과만 남는다.
  await calendar.search.find('카페');
  await expect(calendar.search.resultCount).toHaveText('검색 결과 2건');

  // 잘못 적은 것을 찾아낸 그 자리에서 고칠 수 있어야 한다. 목록으로 돌아가게 하면 또 찾아야 한다.
  await calendar.list.pick('카페 노랑');
  await calendar.edit.waitOpen();
  await calendar.edit.merchant.fill('문구점 노랑');
  await calendar.edit.done();

  // 검색어에 더는 안 맞으니 결과에서 빠지고 건수도 함께 줄어야 한다.
  await expect(calendar.list.row('카페 노랑')).toHaveCount(0);
  await expect(calendar.search.resultCount).toHaveText('검색 결과 1건');
  await expect(calendar.list.row('카페 파랑')).toBeVisible();

  // 지우는 길도 같다. 검색 중이라고 다른 규칙이 되면 안 된다.
  await calendar.list.pick('카페 파랑');
  await calendar.edit.waitOpen();
  await calendar.edit.remove();

  await expect(calendar.search.resultCount).toHaveText('검색 결과 0건');
  await expect(calendar.search.noResult).toBeVisible();

  // 검색을 지우면 고친 줄이 그 날 목록에도 그대로 있다. 결과 목록에서만 바뀐 것이 아니다.
  await calendar.search.clear();
  await expect(calendar.list.row('문구점 노랑')).toBeVisible();
  await expect(calendar.list.row('카페 파랑')).toHaveCount(0);
  await expect(calendar.totals.expense).toHaveText(formatCurrency(12_000));
});

/**
 * 열어서 보기만 하고 닫는 사람이 제일 많다.
 *
 * 이때 요청이 나가면 화면이 통째로 다시 그려지고, 고친 것이 없는 'edit' 한 줄이 쌓여
 * 「어디서 얼마나 고생하나」 를 읽을 때 없는 고생이 섞인다.
 */
test('아무것도 안 바꾸고 완료를 누르면 요청이 나가지 않는다', async ({ calendar, page, prep }) => {
  await prep.addTransaction({ amount: 7_000, merchant: '분식집' });

  let patches = 0;
  await page.route(`${E2E_API_URL}/api/v1/transactions/*`, async (route) => {
    if (route.request().method() === 'PATCH') patches += 1;
    await route.continue();
  });

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('분식집');
  await calendar.edit.waitOpen();

  // 켰다 다시 끈 것은 안 건드린 것과 같다. 되돌린 값까지 보내면 이 규칙이 반쪽이 된다.
  await calendar.edit.excludeToggle.click();
  await expect(calendar.edit.excludeToggle).toHaveAttribute('aria-checked', 'true');
  await calendar.edit.excludeToggle.click();
  await expect(calendar.edit.excludeToggle).toHaveAttribute('aria-checked', 'false');

  await calendar.edit.done();

  expect(patches, '고친 것이 없는데 저장 요청이 나갔다').toBe(0);
  const changed = await logsNamed(page, 'record_changed');
  expect(
    changed.map((log) => log.params.action),
    '고친 것이 없는데 고쳤다는 로그가 남았다',
  ).toEqual([]);
});

/**
 * 이체 줄을 고칠 때.
 *
 * 이체는 쓴 돈이 아니라 옮긴 돈이라 집계에서 통째로 빠진다. 그래서 결제 수단도 분류도
 * 지출과 같은 규칙을 쓰면 안 된다. 검토 화면(`CandidateRow`)은 이미 그렇게 가른다.
 */
test('이체 줄에는 결제 수단 칸이 서지 않는다', async ({ calendar, prep }) => {
  await prep.addTransaction({ amount: 300_000, type: 'transfer', merchant: '적금 자동이체' });

  await calendar.open();
  await calendar.waitReady();
  await expect(calendar.list.chip('이체')).toBeVisible();

  await calendar.list.pick('적금 자동이체');
  await calendar.edit.waitOpen();

  // 무엇으로 냈는지가 없는 돈이다. 골라도 저장되지 않으니 자리를 세우면 안 된다.
  await expect(calendar.edit.paymentGroup).toHaveCount(0);
});

/*
  이체 줄의 「새 분류」.

  만들기 폼은 지출·수입만 만든다(`fixedKind` 가 그 둘뿐이다). 그래서 이체 줄에서 만들면
  **지출 분류가 만들어져 그 이체에 붙었다.** 목록과 리포트가 서로 다른 말을 하게 된다.

  만들기 폼에 이체를 더하는 길도 있었지만, 이체는 집계 밖이라 분류가 할 일이 없다.
  고칠 수 없는 입구를 세워 두는 대신 입구를 걷었다.
*/
test('이체 줄에는 새 분류 입구가 서지 않는다', async ({ calendar, prep }) => {
  await prep.addTransaction({ amount: 300_000, type: 'transfer', merchant: '적금 자동이체' });

  await calendar.open();
  await calendar.waitReady();
  await calendar.list.pick('적금 자동이체');
  await calendar.edit.waitOpen();

  // 「더 보기」 를 펴도 만들기가 없다. 앞자리에만 없는 것이 아니라 아예 없어야 한다.
  await expect(calendar.edit.newCategoryButton).toHaveCount(0);
  if ((await calendar.edit.moreCategoriesButton.count()) > 0) {
    await calendar.edit.moreCategoriesButton.click();
    await expect(calendar.edit.newCategoryButton).toHaveCount(0);
  }

  // 지출 줄에는 그대로 있다. 이체에서만 걷은 것이지 기능을 없앤 것이 아니다.
  await calendar.edit.doneButton.click();
  await calendar.edit.waitClosed();
});
