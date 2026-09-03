import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';
import { pressSystemBack } from '../support/aitMock';

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

  /** 하위 화면에는 탭바가 아예 그려지지 않는다. 지금 탭 루트가 아니라는 증거다. */
  async expectTabsHidden(): Promise<void> {
    await expect(this.tabBar).toHaveCount(0);
  }

  /** 지금 켜져 있는 탭. 탭바가 선택 상태를 스크린리더에 알리는 방식 그대로 본다. */
  async expectCurrentTab(label: TabLabel): Promise<void> {
    await expect(this.tabBar.getByRole('link', { name: label })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }

  /** 어느 화면에 있는지를 제목과 리드 문구로 확인한다. 주소가 아니라 화면으로 본다. */
  async expectScreen(title: string, lead: string): Promise<void> {
    const heading = this.page.getByRole('heading', { level: 1, name: title, exact: true });
    await expect(heading).toBeVisible();
    await expect(this.page.getByText(lead, { exact: true })).toBeVisible();
  }

  /** 화면 안 링크로 하위 화면에 들어간다. 탭바가 아닌 곳에서 옮겨 갈 때 쓴다. */
  async followLink(name: string): Promise<void> {
    await this.page.getByRole('link', { name, exact: true }).click();
  }

  /**
   * 토스 앱의 시스템 뒤로가기를 누른다.
   *
   * 브라우저 뒤로가기가 아니다. 앱이 이 이벤트를 어떻게 가로채는지가 볼거리다.
   * 시트가 떠 있으면 시트를 먼저 닫고, 하위 화면이면 부모로 가고, 탭 루트면 미니앱이 닫힌다.
   */
  async pressBack(): Promise<void> {
    await pressSystemBack(this.page);
  }

  /** 지금 열려 있는 경로. */
  get pathname(): string {
    return new URL(this.page.url()).pathname;
  }

  async goToTab(label: TabLabel): Promise<void> {
    await this.tabBar.getByRole('link', { name: label }).click();
    await expect.poll(() => new URL(this.page.url()).pathname).toBe(TAB_PATHS[label]);
  }

  /**
   * 본문에 놓인 하위 화면 입구 목록. 탭바 링크가 아니라 그 화면이 데리고 있는 갈래다.
   * `관리 하위 화면`·`설정 하위 화면` 처럼 그 nav 의 접근성 이름으로 집는다.
   */
  subScreenLinks(navLabel: string): Locator {
    return this.page.getByRole('navigation', { name: navLabel }).getByRole('link');
  }

  /**
   * 아직 데이터가 붙지 않은 점선 카드의 이름표.
   * 카드에 role 도 testid 도 없어 라벨 글자로 집는다.
   */
  placeholderLabel(label: string): Locator {
    return this.page.getByText(label, { exact: true });
  }

  /** 그 자리에 무엇이 들어올지 적어 둔 예고 한 줄. 카드가 통째로 잡힌다. */
  placeholderNote(note: string): Locator {
    return this.page.getByText(note);
  }

  /** 플랫폼 상단바가 읽는 제목. 화면을 옮길 때마다 바뀐다. */
  async expectDocumentTitle(title: string): Promise<void> {
    await expect(this.page).toHaveTitle(title);
  }
}
