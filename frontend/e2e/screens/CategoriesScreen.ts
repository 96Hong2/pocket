import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';

/**
 * 카테고리 관리 화면.
 *
 * 관리 탭과 URL 이 달라 별도 화면 객체다. 한 화면이 구획 둘(기본 · 내가 만든 것)과
 * 시트 하나를 데리고 있어 시트만 안쪽 객체로 나눠 뒀다.
 *
 * 셀렉터는 이 파일 안에만 둔다. 단언은 spec 이 한다.
 */
export class CategoriesScreen {
  private readonly page: Page;

  /** 만들기와 고치기가 같은 시트다. 제목만 다르다. */
  readonly sheet: CategorySheet;

  constructor(page: Page) {
    this.page = page;
    this.sheet = new CategorySheet(page);
  }

  async open(): Promise<void> {
    await this.page.goto(ROUTES.categories);
  }

  /**
   * 목록 조회가 끝난 뒤.
   *
   * 조회 중에는 자리표시자만 있고 만들기 버튼이 아예 없다. 버튼이 보이면 목록이 온 것이다.
   */
  async waitReady(): Promise<void> {
    await expect(this.addButton).toBeVisible();
  }

  /** 처음부터 있는 카테고리 구획. 여기 줄은 누를 수 없다. */
  get basicSection(): Locator {
    return this.page.getByRole('region', { name: '기본 카테고리', exact: true });
  }

  /** 내가 만든 카테고리 구획. 하나도 없으면 안내만 있다. */
  get mineSection(): Locator {
    return this.page.getByRole('region', { name: '내가 만든 카테고리', exact: true });
  }

  get addButton(): Locator {
    return this.page.getByRole('button', { name: '카테고리 만들기', exact: true });
  }

  /** 내가 만든 것이 하나도 없을 때 그 구획에 뜨는 안내. */
  get emptyNotice(): Locator {
    return this.mineSection.getByText('아직 만든 카테고리가 없어요', { exact: true });
  }

  get basicRows(): Locator {
    return this.basicSection.getByRole('listitem');
  }

  get mineRows(): Locator {
    return this.mineSection.getByRole('listitem');
  }

  /**
   * 기본 구획 안에서 누를 수 있는 것 전부.
   *
   * 여기가 0 이어야 기본 카테고리에 고치기·지우기 입구가 없는 것이다.
   * 비활성 버튼을 두는 것과 아예 두지 않는 것은 다르다.
   */
  get basicButtons(): Locator {
    return this.basicSection.getByRole('button');
  }

  /** 어느 구획에 있든 그 이름의 줄. 몇 개 있는지 셀 때 쓴다. */
  row(name: string): Locator {
    return this.allRows.filter({ has: this.page.getByText(name, { exact: true }) });
  }

  /** 기본 구획 안에 적힌 그 이름. */
  basicRow(name: string): Locator {
    return this.basicSection.getByText(name, { exact: true });
  }

  /** 내 구획 안에 적힌 그 이름. 기본 이름이 여기 없다는 것도 이걸로 본다. */
  mineRow(name: string): Locator {
    return this.mineSection.getByText(name, { exact: true });
  }

  /**
   * 내가 만든 줄. 이 줄만 버튼이고, 접근성 이름이 이름 그대로가 아니라 `{이름} 고치기` 다.
   */
  mineButton(name: string): Locator {
    return this.mineSection.getByRole('button', { name: `${name} 고치기`, exact: true });
  }

  /**
   * 화면을 위에서 아래로 읽은 줄 이름.
   *
   * 두 구획을 이어서 한 줄기로 본다. 줄 안에는 이름 뒤에 꼬리표가 하나 더 붙는데,
   * 기본 줄은 `기본` 배지이고 내 줄은 `고치기` 안내다. 이름만 남기려고 그것을 떼어 낸다.
   */
  async rowNames(): Promise<string[]> {
    const texts = await this.allRows.allTextContents();
    return texts.map((text) => text.replace(/(기본|고치기)$/, '').trim());
  }

  /** 새로 만든다. 이름을 적고 아이콘을 고르고 저장한다. 시트가 닫히면 저장이 끝난 것이다. */
  async create(name: string, iconLabel: string): Promise<void> {
    await this.addButton.click();
    await this.sheet.waitOpen();
    await this.sheet.nameField.fill(name);
    await this.sheet.pickIcon(iconLabel);
    await this.sheet.saveButton.click();
    await this.sheet.waitClosed();
  }

  /** 내가 만든 줄을 눌러 고치기 시트를 연다. 무엇이 들어 있는지는 spec 이 본다. */
  async openEdit(name: string): Promise<void> {
    await this.mineButton(name).click();
    await this.sheet.waitOpen();
  }

  /**
   * 두 구획의 줄 전부. 화면에 놓인 순서 그대로다.
   *
   * 이 화면에서 목록은 두 구획이 전부다. 다른 자리에는 목록이 없어 구획 안으로만 좁힌다.
   */
  private get allRows(): Locator {
    return this.page.getByRole('region').getByRole('listitem');
  }
}

/**
 * 카테고리 시트. 만들 때와 고칠 때가 같은 시트이고 제목만 다르다.
 *
 * 지우기는 한 단을 더 받는다. 처음 누르면 확인 자리가 펼쳐지고, 거기 있는 지우기가 진짜다.
 */
class CategorySheet {
  private readonly page: Page;
  private readonly root: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByRole('dialog', { name: /^카테고리 (만들기|고치기)$/ });
  }

  /** 시트 자체. 저장이 막혔을 때 닫히지 않고 남아 있는지 볼 때 쓴다. */
  get dialog(): Locator {
    return this.root;
  }

  /** 새로 만드는 시트. 제목으로 갈린다. */
  get createDialog(): Locator {
    return this.page.getByRole('dialog', { name: '카테고리 만들기', exact: true });
  }

  /** 이미 있는 것을 고치는 시트. */
  get editDialog(): Locator {
    return this.page.getByRole('dialog', { name: '카테고리 고치기', exact: true });
  }

  get nameField(): Locator {
    return this.root.getByLabel('이름', { exact: true });
  }

  get saveButton(): Locator {
    return this.root.getByRole('button', { name: '저장', exact: true });
  }

  /** 고치는 시트에만 있다. 누르면 확인 자리가 펼쳐진다. */
  get deleteButton(): Locator {
    return this.root.getByRole('button', { name: '지우기', exact: true });
  }

  /** 지우기를 누른 뒤 펼쳐지는 확인 자리. */
  get confirmArea(): Locator {
    return this.root.getByRole('group', { name: '지우기 확인' });
  }

  /**
   * 확인 자리가 하는 약속.
   *
   * 남는 것(기록)과 함께 사라지는 것(한도·기억한 분류)을 둘 다 적는다.
   * 되돌릴 수 없는 것을 빼고 적으면 확인 한 단을 둔 뜻이 없다.
   */
  get confirmText(): Locator {
    return this.confirmArea.getByText(/^지울까요\? .*한도와 기억한 분류는 함께 사라지고/);
  }

  /** 확인 자리 안의 지우기. 바깥의 같은 이름과 섞이지 않게 여기서만 찾는다. */
  get confirmDeleteButton(): Locator {
    return this.confirmArea.getByRole('button', { name: '지우기', exact: true });
  }

  /** 왜 막혔는지 말하는 한 줄. 문구는 서버가 정한다. */
  get errorText(): Locator {
    return this.root.getByRole('alert');
  }

  /** 헤더의 X. */
  get closeButton(): Locator {
    return this.root.getByRole('button', { name: '닫기', exact: true });
  }

  /**
   * 아이콘 격자의 한 칸.
   *
   * 격자 칸이 스크린리더에 읽어 주는 이름은 파일 이름에서 앞 번호를 뗀 영어다.
   * `16_paw` 는 `paw` 이고, `35_paint_palette` 는 `paint palette` 다.
   */
  iconCell(label: string): Locator {
    return this.root.getByRole('group', { name: '아이콘' }).getByRole('button', {
      name: label,
      exact: true,
    });
  }

  async waitOpen(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async waitClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0);
  }

  /** 아이콘 하나를 고른다. 고른 칸만 눌린 상태가 된다. */
  async pickIcon(label: string): Promise<void> {
    const cell = this.iconCell(label);
    await cell.click();
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
  }

  /** 지우기를 눌러 확인까지 마친다. 시트가 닫히면 지워진 것이다. */
  async remove(): Promise<void> {
    await this.deleteButton.click();
    await this.confirmDeleteButton.click();
    await this.waitClosed();
  }
}
