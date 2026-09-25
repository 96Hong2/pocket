import type { Locator } from '@playwright/test';

import { expect, test } from '../support/fixtures';

/**
 * 🔴 **고른 색이 목록에서 사라지던 자리**(2026-09-25 사용자 신고).
 *
 * 「카테고리 추가에서 아이콘 색 핑크색으로 변경했는데 저장 완료 후 달력이랑 사용 내역에서는
 * 그대로 기본 배경색으로 나와.」
 *
 * 원인은 `TransactionRow` 에 `color` 칸이 아예 없었던 것이다. 부르는 쪽은 전부
 * `{...iconOf(category)}` 를 펴서 색까지 넘기고 있었는데, 받는 칸이 없으니 타입도
 * 아무 말을 안 하고 값만 조용히 버려졌다. **만들기 화면과 관리 목록은 맞았고 여기만
 * 틀려서** 「저장은 됐는데 목록이 안 바뀐다」 로 보였다.
 *
 * 그래서 재는 것은 한 가지다. **분류에 건 색이 목록 줄의 동그라미에 실제로 칠해지나.**
 */

/** 화면에 실제로 칠해진 바탕색. 변수 이름이 아니라 브라우저가 푼 값을 본다. */
async function avatarBackground(locator: Locator): Promise<string> {
  return locator.evaluate((node) => getComputedStyle(node).backgroundColor);
}

/** 팔레트의 그 색을 브라우저가 푼 값으로. hex 를 검사에 적어 두지 않으려고 이 길로 돈다. */
async function paletteColor(locator: Locator, name: string): Promise<string> {
  return locator.evaluate((node, key: string) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = `var(--tag-${key})`;
    node.appendChild(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  }, name);
}

test.describe('분류에 건 색이 목록까지 간다', () => {
  test('홈 목록 줄의 동그라미가 고른 색으로 칠해진다', async ({ prep, home }) => {
    const pink = await prep.addCategory('반려동물', '16_paw', 'rose');
    await prep.addTransaction({ amount: 24_000, categoryId: pink, merchant: '동물병원' });

    await home.open();
    await home.waitReady();

    const avatar = home.today.rowAvatar('동물병원');
    await expect(avatar).toBeVisible();
    await expect(avatar).toHaveClass(/pk-avatar--tinted/);

    /*
      실제로 칠해진 색이 팔레트의 그 색인지 본다. **hex 를 여기 적지 않는다.**
      적어 두면 팔레트를 손볼 때마다 이 검사가 이유 없이 빨개진다. 토큰을 그 자리에서 풀어 쓴다.
    */
    const painted = await avatarBackground(avatar);
    // 토큰이 사라져 둘 다 투명이면 같아진다. 신고된 화면과 똑같은데 초록이 된다.
    expect(painted).not.toBe('rgba(0, 0, 0, 0)');
    expect(painted).toBe(await paletteColor(avatar, 'rose'));
  });

  test('색을 안 건 분류는 무채색 기본 바탕 그대로다', async ({ prep, home }) => {
    const plain = await prep.addCategory('세차', '16_paw');
    await prep.addTransaction({ amount: 18_000, categoryId: plain, merchant: '손세차장' });

    await home.open();
    await home.waitReady();

    const avatar = home.today.rowAvatar('손세차장');
    await expect(avatar).toBeVisible();
    await expect(avatar).not.toHaveClass(/pk-avatar--tinted/);
  });

  test('두 분류에 다른 색을 걸면 목록에서도 서로 다르다', async ({ prep, home }) => {
    const rose = await prep.addCategory('반려동물', '16_paw', 'rose');
    const sky = await prep.addCategory('자기계발', '23_document', 'sky');
    await prep.addTransaction({ amount: 24_000, categoryId: rose, merchant: '동물병원' });
    await prep.addTransaction({ amount: 30_000, categoryId: sky, merchant: '교보문고' });

    await home.open();
    await home.waitReady();

    const a = await avatarBackground(home.today.rowAvatar('동물병원'));
    const b = await avatarBackground(home.today.rowAvatar('교보문고'));
    expect(a).not.toBe(b);
  });

  test('달력에서 고른 날 목록에도 같은 색이 간다', async ({ prep, calendar }) => {
    const rose = await prep.addCategory('반려동물', '16_paw', 'rose');
    await prep.addTransaction({ amount: 24_000, categoryId: rose, merchant: '동물병원' });

    await calendar.open();
    await calendar.waitReady();

    const avatar = calendar.list.rowAvatar('동물병원');
    await expect(avatar).toBeVisible();
    await expect(avatar).toHaveClass(/pk-avatar--tinted/);
  });
});
