import type { Locator, Page } from '@playwright/test';

/**
 * 기록 고치기 맨 위 그림을 눌러 여는 「카테고리 바꾸기」. 개인·공유 고치기가 같은 것을 쓴다.
 *
 * 화면을 덮는 한 장이고 포털로 `body` 에 붙어 감싼 시트의 root 로는 안 잡힌다.
 */
export class CategoryPickArea {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('dialog', { name: '카테고리 바꾸기' });
  }

  get dialog(): Locator {
    return this.root;
  }

  private get group(): Locator {
    return this.root.getByRole('group', { name: '카테고리 고르기' });
  }

  chip(name: string): Locator {
    return this.group.getByRole('button', { name, exact: true });
  }

  /** 지금 골라 둔 칩. 처음부터 다 펼쳐 있어 「더 보기」 가 없다. */
  get picked(): Locator {
    return this.group.locator('button[aria-pressed="true"]');
  }

  get moreButton(): Locator {
    return this.group.getByRole('button', { name: '더 보기', exact: true });
  }

  get newCategoryButton(): Locator {
    return this.group.getByRole('button', { name: '새 분류', exact: true });
  }
}
