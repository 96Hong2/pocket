import { expect, test } from '../support/fixtures';

/**
 * 기억한 분류.
 *
 * 저절로 쌓이는 목록은 쓸수록 길어진다. 그래서 셋을 확인한다.
 * 손으로 걸 수 있다는 것, 손으로 건 것을 가려 볼 수 있다는 것,
 * 스무 줄을 넘으면 잘라 두고 검색으로 찾는다는 것.
 *
 * 저절로 쌓이는 쪽(저장하면서 기억)은 `nl-input.spec.ts` 가 이미 지킨다.
 */

/** 화면이 한 번에 보여 주는 최대 줄 수. 정본은 `features/imports/MerchantRuleList.tsx` 다. */
const VISIBLE_LIMIT = 20;

test('손으로 건 분류가 목록 맨 위에 서고, 내가 건 것만 가려 볼 수 있다', async ({
  categories,
  prep,
}) => {
  const ids = await prep.categoryIds();
  // 앱이 기억한 것 하나. 손으로 건 것보다 먼저 있었는데도 아래로 밀려야 한다.
  await prep.addMerchantRule('올리브영', ids.get('생활')!);

  await categories.open();
  await categories.waitReady();

  await categories.rules.add('스타벅스', '카페·간식');

  await expect(categories.rules.row('스타벅스')).toBeVisible();
  await expect(categories.rules.mineBadge('스타벅스')).toBeVisible();

  await test.step('내가 건 것만 남기고 다시 전체로 돌아온다', async () => {
    await categories.rules.filter('내가 걸어둔 것').click();
    await expect(categories.rules.rows).toHaveCount(2);

    await categories.rules.filter('전체').click();
    await expect(categories.rules.rows).toHaveCount(2);
  });
});

test('같은 상호를 다시 걸면 줄이 늘지 않고 분류만 바뀐다', async ({ categories }) => {
  await categories.open();
  await categories.waitReady();

  await categories.rules.add('스타벅스', '카페·간식');
  await expect(categories.rules.row('스타벅스')).toContainText('카페·간식');

  // 띄어쓰기가 달라도 같은 가게다. 서버가 정규화해서 견준다.
  await categories.rules.add('스타 벅스', '식비');

  await expect(categories.rules.rows).toHaveCount(1);
  await expect(categories.rules.row('스타 벅스')).toContainText('식비');
});

test('스무 줄까지만 보여 주고, 나머지는 검색으로 찾는다', async ({ categories, prep }) => {
  const ids = await prep.categoryIds();
  const food = ids.get('식비')!;
  // 스물다섯 줄. 다섯이 잘린다.
  for (let index = 0; index < VISIBLE_LIMIT + 5; index += 1) {
    await prep.addMerchantRule(`가게${String(index).padStart(2, '0')}`, food);
  }

  await categories.open();
  await categories.waitReady();

  await expect(categories.rules.rows).toHaveCount(VISIBLE_LIMIT);
  await expect(categories.rules.moreNotice).toContainText('5개');

  await test.step('상호로 찾으면 감춰졌던 줄도 나온다', async () => {
    // 24 번은 뒤쪽이라 첫 스무 줄에 들지 않는다.
    await expect(categories.rules.row('가게24')).toHaveCount(0);

    await categories.rules.search.fill('가게24');
    await expect(categories.rules.rows).toHaveCount(1);
    await expect(categories.rules.row('가게24')).toBeVisible();
  });

  await test.step('없는 상호를 치면 비었다고 말한다', async () => {
    await categories.rules.search.fill('없는가게');
    await expect(categories.rules.rows).toHaveCount(0);
    await expect(categories.rules.noMatch).toBeVisible();
  });
});

test('목록이 짧으면 검색칸을 두지 않는다', async ({ categories, prep }) => {
  const ids = await prep.categoryIds();
  await prep.addMerchantRule('올리브영', ids.get('생활')!);

  await categories.open();
  await categories.waitReady();

  // 세 줄짜리 목록 위의 검색칸은 도움이 아니라 방해다.
  await expect(categories.rules.rows).toHaveCount(1);
  await expect(categories.rules.search).toHaveCount(0);
  await expect(categories.rules.moreNotice).toHaveCount(0);
});
