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

  /**
   * 화면 안 줄을 눌러 하위 화면에 들어간다. 탭바가 아닌 곳에서 옮겨 갈 때 쓴다.
   *
   * 링크일 수도 버튼일 수도 있다. 관리 탭 줄 넷은 들어가는 길에 광고가 한 편 서서
   * 화면이 순서를 쥐어야 하므로 버튼이고, 설정 탭 줄은 그대로 링크다.
   * 들어가는 사람에게는 둘이 같은 줄이라 검사도 같은 자로 잰다.
   */
  async followRow(name: string): Promise<void> {
    const byLink = this.page.getByRole('link', { name, exact: true });
    await byLink.or(this.page.getByRole('button', { name, exact: true })).click();
    /*
      광고가 붙는 줄이면 누른 뒤 확인 창이 한 번 선다(2026-09-23 반려 대응).
      광고가 안 설 자리에서는 안 뜨므로 그때는 그냥 지나간다.
    */
    const confirm = this.page
      .getByRole('alertdialog', { name: '광고가 한 번 나와요' })
      .getByRole('button', { name: '광고 보고 열기' });
    if (await confirm.isVisible()) await confirm.click();
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
   * `설정 하위 화면` 처럼 그 nav 의 접근성 이름으로 집는다.
   */
  subScreenLinks(navLabel: string): Locator {
    return this.page.getByRole('navigation', { name: navLabel }).getByRole('link');
  }

  /**
   * 같은 목록을 **줄을 담은 항목**으로 센다.
   *
   * 관리 탭 줄은 들어가는 길에 광고가 한 편 서느라 링크가 아니라 버튼이다. 그 목록에
   * 무엇이 있는지를 물을 때 링크만 세면 넷이 통째로 빠진다. 설정 탭에는 갈 곳 없는
   * 줄(버전·CSV)도 섞여 있어 이쪽 자를 쓰면 안 된다. 그래서 둘을 나눠 둔다.
   */
  subScreenRows(navLabel: string): Locator {
    return this.page.getByRole('navigation', { name: navLabel }).getByRole('listitem');
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

  /**
   * 앱이 스스로 그린 뒤로가기 후보.
   *
   * 상단바는 토스가 그린다. 우리가 하나 더 그리면 화면에 뒤로가기가 둘로 보여 심사에서 막힌다.
   * 이름으로 좁혀 세므로 화면에 버튼이 아무리 많아도 여기 잡히는 것은 뒤로가기뿐이다.
   * 시트 안의 닫기는 시트를 닫는 것이라 이름에서 뺐다.
   */
  get selfDrawnBackControls(): Locator {
    return this.page.getByRole('button', { name: /뒤로|이전|←|‹/ });
  }

  /** 플랫폼 상단바가 읽는 제목. 화면을 옮길 때마다 바뀐다. */
  async expectDocumentTitle(title: string): Promise<void> {
    await expect(this.page).toHaveTitle(title);
  }
}
