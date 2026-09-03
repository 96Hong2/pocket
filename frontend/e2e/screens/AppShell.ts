import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';

export type TabLabel = '홈' | '리포트' | '관리';

const TAB_PATHS: Record<TabLabel, string> = {
  홈: ROUTES.home,
  리포트: ROUTES.report,
  관리: ROUTES.manage,
};

/**
 * 앱 껍데기. 마운트 지점과 하단 3탭을 가진다.
 *
 * 화면 안쪽(홈 카드·키패드·피드백)은 아직 자리표시자라 여기 없다.
 * 화면이 실제로 생기면 screens/ 에 그 화면의 객체를 따로 만든다.
 */
export class AppShell {
  private readonly page: Page;
  private readonly tabBar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tabBar = page.getByRole('navigation', { name: '주요 화면' });
  }

  async open(path: string = ROUTES.home): Promise<void> {
    await this.page.goto(path);
  }

  /** 리액트가 실제로 그렸는지. 빈 화면으로 뜨는 사고를 여기서 잡는다. */
  async expectMounted(): Promise<void> {
    await expect(this.page.locator('#root')).not.toBeEmpty();
  }

  async expectTabsVisible(): Promise<void> {
    await expect(this.tabBar.getByRole('link')).toHaveCount(3);
  }

  async goToTab(label: TabLabel): Promise<void> {
    await this.tabBar.getByRole('link', { name: label }).click();
    await expect.poll(() => new URL(this.page.url()).pathname).toBe(TAB_PATHS[label]);
  }
}
