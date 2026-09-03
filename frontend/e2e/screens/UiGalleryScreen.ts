import { expect, type Locator, type Page } from '@playwright/test';

import { DEMO_PATH, SCREEN_TITLES } from '../../src/app/router/routes';

/**
 * 개발용 공용 UI 갤러리(/__demo).
 *
 * 제품 화면이 아니라 앱이 쓰는 부품을 한자리에 모아 둔 자리다. URL 이 달라 홈과 별도 객체로 둔다.
 * 같은 글자가 화면 곳곳에서 되풀이되므로('저장'·'기록하기'·'제외됨'·'다시 시도')
 * 잡는 자리를 섹션 안으로 좁힌다. 섹션 밖에서 이름만으로 잡으면 둘씩 걸린다.
 */

/** 갤러리의 섹션 제목. 화면의 h2 와 같은 글자다. 없는 제목을 쓰면 타입 검사가 막는다. */
export type GallerySectionTitle =
  | 'Button'
  | 'Card / SageCard'
  | 'Chip'
  | 'Gauge'
  | 'MonthStepper'
  | 'SegmentedControl / Toggle'
  | 'TransactionRow / Amount'
  | 'CategoryAvatar'
  | 'BottomSheet'
  | '상태 컴포넌트'
  | '색 토큰';

export class UiGalleryScreen {
  private readonly page: Page;

  /** 갤러리가 여는 바텀시트. 포털이라 섹션 밖 body 에 붙는다. */
  readonly sheet: GallerySheet;

  constructor(page: Page) {
    this.page = page;
    this.sheet = new GallerySheet(page);
  }

  async open(): Promise<void> {
    await this.page.goto(DEMO_PATH);
  }

  /** 화면 제목. 갤러리는 h1 이 하나뿐이다. */
  get title(): Locator {
    return this.page.getByRole('heading', { level: 1, name: '공용 UI 확인용 화면' });
  }

  /** 갤러리가 다 뜬 뒤를 기다린다. 지연 로딩이라 goto 직후에는 스피너만 있다. */
  async waitReady(): Promise<void> {
    await expect(this.title).toBeVisible();
  }

  /** 플랫폼 상단바가 읽는 제목. 문자열은 라우트 표에서 가져온다. */
  async expectDocumentTitle(): Promise<void> {
    await expect(this.page).toHaveTitle(SCREEN_TITLES[DEMO_PATH]);
  }

  section(title: GallerySectionTitle): GallerySection {
    return new GallerySection(this.page, title);
  }

  /** 그 섹션까지 내려 화면에 올린다. 갤러리는 세로로 길어 섹션마다 스크롤해야 보인다. */
  async scrollTo(title: GallerySectionTitle): Promise<GallerySection> {
    const section = this.section(title);
    await section.heading.scrollIntoViewIfNeeded();
    await expect(section.self).toBeInViewport();
    return section;
  }
}

/**
 * 섹션 하나. 제목과 그 아래 부품이 이 안에 들어 있다.
 *
 * 섹션은 이름 없는 `<section>` 이라 role 로 잡히지 않는다. 제목(h2)의 부모가 그 섹션이다.
 * 클래스로 잡지 않으려고 이 길을 쓴다. 제목이 섹션 밖으로 나가면 여기가 먼저 깨진다.
 */
export class GallerySection {
  /** 섹션 제목. 스크롤 기준점이다. */
  readonly heading: Locator;

  private readonly root: Locator;

  constructor(page: Page, title: GallerySectionTitle) {
    this.heading = page.getByRole('heading', { level: 2, name: title, exact: true });
    this.root = this.heading.locator('..');
  }

  /** 섹션 한 덩어리. 화면에 들어왔는지 볼 때 쓴다. */
  get self(): Locator {
    return this.root;
  }

  /** 이 섹션 안 버튼 전부. 몇 개가 놓였는지 셀 때. */
  get buttons(): Locator {
    return this.root.getByRole('button');
  }

  button(name: string): Locator {
    return this.root.getByRole('button', { name, exact: true });
  }

  /** SegmentedControl 의 칸. role 이 radio 라 button 으로는 하나도 안 걸린다. */
  radio(name: string): Locator {
    return this.root.getByRole('radio', { name, exact: true });
  }

  /** Toggle. role 이 switch 다. 켜짐·꺼짐은 aria-checked 가 말한다. */
  toggle(name: string): Locator {
    return this.root.getByRole('switch', { name, exact: true });
  }

  /** 게이지. 화면에 글자가 없어 aria-label 로 갈린다. */
  gauge(label: string): Locator {
    return this.root.getByRole('progressbar', { name: label, exact: true });
  }

  get gauges(): Locator {
    return this.root.getByRole('progressbar');
  }

  /** 상태 컴포넌트 한 장. 빈 화면·오류·로딩·권한·미지원이 모두 role=status 다. */
  get states(): Locator {
    return this.root.getByRole('status');
  }

  /** 그중 로딩 자리. 스켈레톤 목록과 스피너가 같은 이름을 쓴다. */
  get loadings(): Locator {
    return this.root.getByRole('status', { name: '불러오는 중이에요', exact: true });
  }

  /** 이름도 role 도 없는 글자. 칩·금액·라벨이 여기로 잡힌다. */
  text(value: string): Locator {
    return this.root.getByText(value, { exact: true });
  }

  /** 섹션 안에서 그 줄까지 굴린다. 섹션 제목만 올려 두면 아래쪽 줄은 화면 밖에 남는다. */
  async revealText(value: string): Promise<void> {
    await this.text(value).evaluate((element) => {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /**
   * 섹션 끝이 화면에 들어오게 굴린다.
   *
   * 색 견본처럼 글자도 role 도 없는 칸은 이름으로 집을 수 없다.
   * 섹션 아래끝을 화면에 올려 두는 것이 그것을 보여주는 유일한 방법이다.
   */
  async revealEnd(): Promise<void> {
    await this.root.evaluate((element) => {
      element.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }
}

/**
 * 갤러리가 띄우는 바텀시트.
 *
 * 제품의 기록 시트와 다른 시트다. 제목이 곧 접근성 이름이 된다.
 * 딤을 눌러도 닫히지만 딤에는 잡을 이름이 없어 여기에 두지 않는다.
 */
export class GallerySheet {
  private readonly page: Page;
  private readonly root: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByRole('dialog', { name: '거래 수정' });
  }

  get self(): Locator {
    return this.root;
  }

  /** 무엇으로 닫히는지 적어 둔 안내 한 줄. */
  get lead(): Locator {
    return this.root.getByText('Esc · 바깥 클릭 · 닫기 버튼 모두 닫힙니다.', { exact: true });
  }

  /** 헤더 오른쪽 X. */
  get closeButton(): Locator {
    return this.root.getByRole('button', { name: '닫기' });
  }

  /** 시트 안 저장. 갤러리 위쪽 Button 섹션에도 같은 이름이 있어 시트 안에서만 찾는다. */
  get saveButton(): Locator {
    return this.root.getByRole('button', { name: '저장', exact: true });
  }

  async waitOpen(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async waitClosed(): Promise<void> {
    await expect(this.root).toBeHidden();
  }

  async closeByEsc(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }
}
