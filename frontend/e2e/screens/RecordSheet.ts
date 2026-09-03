import { expect, type Locator, type Page } from '@playwright/test';

import { TEST_IDS } from '../../src/shared/testIds';

/**
 * 기록 바텀시트.
 *
 * 저장해도 시트는 닫히지 않고 안쪽이 입력에서 피드백으로 바뀐다.
 * 그래서 저장 전후가 같은 dialog 안이고, 화면 객체도 하나다.
 */
export class RecordSheet {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('dialog', { name: '10초 기록' });
  }

  get isVisible(): Promise<boolean> {
    return this.root.isVisible();
  }

  async waitOpen(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async waitClosed(): Promise<void> {
    await expect(this.root).toBeHidden();
  }

  // ── 입력 단계 ────────────────────────────────────────

  /** 지금 눌러 둔 금액. `12,000원` 처럼 포맷된 문자열이다. */
  get amountText(): Locator {
    return this.root.getByTestId(TEST_IDS.recordAmount);
  }

  categoryChip(name: string): Locator {
    return this.root.getByRole('button', { name, exact: true });
  }

  /**
   * 금액을 키패드로 찍는다.
   *
   * `fill` 로 우회하지 않는다. 실제로 누르지 않으면 앞자리 0 규칙 같은 것이 검증되지 않는다.
   * 몇 번을 눌렀는지는 `keyStrokesFor` 가 알려 준다.
   */
  async enterAmount(amount: number): Promise<void> {
    for (const key of keyStrokesFor(amount)) {
      await this.root.getByRole('button', { name: key, exact: true }).click();
    }
  }

  /** 카테고리를 누르는 것이 곧 저장이다. 저장 버튼이 따로 없다. */
  async pickCategory(name: string): Promise<void> {
    await this.categoryChip(name).click();
  }

  // ── 피드백 단계 ──────────────────────────────────────

  get savedLabel(): Locator {
    return this.root.getByText('저장했어요', { exact: true });
  }

  get feedbackHeadline(): Locator {
    return this.root.getByTestId(TEST_IDS.feedbackHeadline);
  }

  get undoButton(): Locator {
    return this.root.getByRole('button', { name: '되돌리기' });
  }

  get confirmButton(): Locator {
    return this.root.getByRole('button', { name: '확인' });
  }

  async waitSaved(): Promise<void> {
    await expect(this.savedLabel).toBeVisible();
  }

  async undo(): Promise<void> {
    await this.undoButton.click();
  }
}

/**
 * 금액을 키패드 키 순서로 바꾼다.
 *
 * 키패드에 두 자리 키가 `00` 하나뿐이라 뒤에서부터 0 을 둘씩 묶는다.
 * 12000 이면 `1` `2` `00` `0` 네 번이다.
 */
export function keyStrokesFor(amount: number): string[] {
  const digits = String(Math.trunc(amount));
  const keys: string[] = [];

  let index = 0;
  while (index < digits.length) {
    // 앞자리에는 0 을 못 쓴다. 첫 키가 아닐 때만 `00` 으로 묶는다.
    if (index > 0 && digits.startsWith('00', index)) {
      keys.push('00');
      index += 2;
    } else {
      keys.push(digits[index]);
      index += 1;
    }
  }
  return keys;
}
