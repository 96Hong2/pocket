import { expect, type Locator, type Page } from '@playwright/test';

import { TEST_IDS } from '../../src/shared/testIds';

import { EditSheetArea } from './CalendarScreen';

/**
 * 리포트 분류 줄을 눌러 들어오는 화면. 맨 위 이름과 합계, 아래 날짜별 기록 줄.
 *
 * 줄을 누르면 달력과 같은 「기록 수정」 시트가 뜬다. 그 시트는 `edit` 가 든다.
 */
export class ReportCategoryScreen {
  private readonly page: Page;
  readonly edit: EditSheetArea;

  constructor(page: Page) {
    this.page = page;
    this.edit = new EditSheetArea(page);
  }

  async waitReady(): Promise<void> {
    await expect(this.total).toBeVisible();
  }

  get name(): Locator {
    return this.page.getByTestId(TEST_IDS.reportCategoryName);
  }

  get total(): Locator {
    return this.page.getByTestId(TEST_IDS.reportCategoryTotal);
  }

  get count(): Locator {
    return this.page.getByTestId(TEST_IDS.reportCategoryCount);
  }

  /** 기록 줄 하나. 제목(상호, 없으면 분류 이름)으로 찾는다. */
  row(title: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^${title}`) });
  }

  get empty(): Locator {
    return this.page.getByRole('status').filter({ hasText: '이 분류에 남은 기록이 없어요' });
  }

  get url(): URL {
    return new URL(this.page.url());
  }
}
