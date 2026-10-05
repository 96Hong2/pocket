import { expect, type Locator, type Page } from '@playwright/test';

import { TEST_IDS } from '../../src/shared/testIds';

/**
 * 한 달 시작일 시트. 관리 탭 예산 줄, 앱 설정 줄, 리포트 기간 줄이 같은 시트를 연다.
 *
 * 세 화면이 함께 쓰므로 `CategoryComposeArea` 처럼 파일 하나로 둔다.
 */
export class MonthStartArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get sheet(): Locator {
    return this.page.getByRole('dialog', { name: '한 달 시작일', exact: true });
  }

  /** 날짜 칸 하나. 이름이 `25일` 이다. */
  day(day: number): Locator {
    return this.sheet
      .getByRole('group', { name: '시작일' })
      .getByRole('button', { name: `${day}일`, exact: true });
  }

  /** 고른 날로 오늘이 든 기간을 말하는 줄. */
  get preview(): Locator {
    return this.sheet.getByTestId(TEST_IDS.monthStartPreview);
  }

  get saveButton(): Locator {
    return this.sheet.getByRole('button', { name: '저장', exact: true });
  }

  /** 날을 고르고 저장한다. 시트가 닫힐 때까지 기다린다. */
  async save(day: number): Promise<void> {
    await this.day(day).click();
    await expect(this.day(day)).toHaveAttribute('aria-pressed', 'true');
    await this.saveButton.click();
    await expect(this.sheet).toHaveCount(0);
  }
}
