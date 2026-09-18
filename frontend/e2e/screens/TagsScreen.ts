import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';

/**
 * 태그 관리. 관리 탭 아래 하위 화면이라 URL 이 달라 별도 화면이다.
 *
 * 지출과 수입이 서로 다른 목록이고, 화면에도 묶음이 둘이다. 셀렉터는 이 파일 안에만 둔다.
 */
export class TagsScreen {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async open(): Promise<void> {
    await this.page.goto(ROUTES.tags);
  }

  /** 두 묶음이 다 그려진 뒤. 태그가 하나도 없어도 묶음 자체는 선다. */
  async waitReady(): Promise<void> {
    await expect(this.group('지출 태그')).toBeVisible();
  }

  /** 종류 묶음 하나. 「지출 태그」·「수입 태그」 */
  group(name: string): Locator {
    return this.page.getByRole('region', { name, exact: true });
  }

  /** 그 묶음의 「＋ 새 태그」. 상한에 닿으면 이름이 바뀌어 안 잡힌다(그게 맞다). */
  newButton(group: string): Locator {
    return this.group(group).getByRole('button', { name: '＋ 새 태그', exact: true });
  }

  /** 그 이름의 태그 줄 안 「고치기」. 줄 자체는 버튼이 아니라 이쪽으로 연다. */
  editButton(name: string): Locator {
    return this.page
      .getByText(name, { exact: true })
      .locator('..')
      .getByRole('button', { name: '고치기', exact: true });
  }

  /** 만들기·고치기 시트. 제목으로 어느 쪽인지 가른다. */
  sheet(title: '새 태그' | '태그 고치기'): Locator {
    return this.page.getByRole('dialog', { name: title, exact: true });
  }

  get nameInput(): Locator {
    return this.page.getByRole('dialog').getByLabel('이름', { exact: true });
  }

  /** 색 고르기. 이름은 스크린리더가 읽는 색 이름이다(「초록」·「파랑」…). */
  colorButton(colorName: string): Locator {
    return this.page.getByRole('dialog').getByRole('button', { name: colorName, exact: true });
  }

  saveButton(label: '만들기' | '고치기'): Locator {
    return this.page.getByRole('dialog').getByRole('button', { name: label, exact: true });
  }

  /** 태그 하나를 만든다. 다른 확인의 사전 조건으로 쓴다. */
  async create(group: string, name: string, colorName = '파랑'): Promise<void> {
    await this.newButton(group).click();
    await expect(this.sheet('새 태그')).toBeVisible();
    await this.nameInput.fill(name);
    await this.colorButton(colorName).click();
    await this.saveButton('만들기').click();
    await expect(this.sheet('새 태그')).toHaveCount(0);
  }

  /** 그 태그가 목록에 몇 건으로 적혀 있나. */
  usageCount(name: string): Locator {
    return this.page.getByText(name, { exact: true }).locator('..').getByText(/^\d+건$/);
  }

  get deleteButton(): Locator {
    return this.page.getByRole('button', { name: '이 태그 지우기', exact: true });
  }

  get confirmSheet(): Locator {
    return this.page.getByRole('dialog', { name: '태그를 지울까요?', exact: true });
  }

  get confirmDelete(): Locator {
    return this.confirmSheet.getByRole('button', { name: '지우기', exact: true });
  }
}
