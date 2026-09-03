import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Page, TestInfo } from '@playwright/test';

import { expect, test as base } from '../../support/fixtures';

import { installDemoOverlay } from './overlay';

/**
 * 데모 녹화의 진입점. 장면 파일은 여기서 test 와 expect 를 가져간다.
 *
 * 검증 spec 의 fixtures 를 그대로 확장한다. 익명키 격리·콘솔 오류 검사·개발 스택 감시가
 * 녹화에도 똑같이 걸린다. 영상에 찍히는 화면이 곧 테스트가 통과한 화면이어야 하기 때문이다.
 *
 * 검증 spec 과 다른 점은 둘뿐이다.
 * - 사람이 볼 수 있게 동작 사이에 멈춘다(`beat`). 검증에서 금지한 고정 대기를 여기서만 쓴다.
 * - 오버레이(제목 카드·단계 자막·클릭 물결)를 얹는다.
 */

/** 영상을 모을 곳. 레포 밖으로 내보낼 때는 환경변수로 준다. */
const OUT_DIR = process.env.POCKET_DEMO_OUT ?? path.resolve(process.cwd(), 'demo-videos');

/** 한 박자. 사람 눈이 화면 변화를 따라갈 최소 시간이다. */
const BEAT_MS = 750;

/** 제목 카드를 띄워 두는 시간. 읽고 넘어갈 만큼만. */
const TITLE_MS = 1900;

/**
 * 글꼴을 받아 오는 곳.
 *
 * 인터넷이 막힌 곳에서는 못 받고 폴백 글꼴로 그려진다. 배치는 그대로라 녹화에는 지장이 없다.
 * 이 실패만 눈감고, 다른 요청이 실패하면 그대로 터지게 둔다.
 */
const FONT_CDN = /cdn\.jsdelivr\.net/;

interface DemoWindow {
  __pocketDemoStep: (text: string) => void;
  __pocketDemoTitle: (eyebrow: string, main: string, sub: string) => void;
  __pocketDemoTitleOff: () => void;
}

/**
 * 장면을 연출한다.
 *
 * 화면을 조작하는 것은 여전히 `screens/` 의 화면 객체가 한다.
 * 이 객체는 언제 멈추고 무엇을 자막으로 띄울지만 안다.
 */
export class Director {
  private readonly page: Page;
  private readonly info: TestInfo;
  private stepCount = 0;

  constructor(page: Page, info: TestInfo) {
    this.page = page;
    this.info = info;
  }

  /** 제목 카드로 장면을 연다. 카드가 떠 있는 동안 뒤에서 화면이 준비된다. */
  async open(main: string, sub: string): Promise<void> {
    await this.page.evaluate(
      ([eyebrow, title, subtitle]) => {
        (window as unknown as DemoWindow).__pocketDemoTitle(eyebrow, title, subtitle);
      },
      ['10초 가계부', main, sub] as const,
    );
    await this.hold(TITLE_MS);
    await this.page.evaluate(() => {
      (window as unknown as DemoWindow).__pocketDemoTitleOff();
    });
    await this.hold(700);
  }

  /** 지금 무엇을 하는지 한 줄로 띄운다. 다음 step 이 덮어쓴다. */
  async step(text: string): Promise<void> {
    this.stepCount += 1;
    await this.page.evaluate((value) => {
      (window as unknown as DemoWindow).__pocketDemoStep(value);
    }, text);
    await this.hold(BEAT_MS);
  }

  /** 자막을 걷는다. 화면 전체를 보여줄 때 쓴다. */
  async clearStep(): Promise<void> {
    await this.page.evaluate(() => {
      (window as unknown as DemoWindow).__pocketDemoStep('');
    });
  }

  /** 한 박자 쉰다. 배수로 늘려 강조할 곳을 더 오래 보여준다. */
  async beat(times = 1): Promise<void> {
    await this.hold(BEAT_MS * times);
  }

  /**
   * 고정 대기. 검증 spec 에서는 금지된 것이고 여기서만 쓴다.
   *
   * 영상은 사람이 보는 것이라 "상태가 됐다" 와 "눈으로 따라갔다" 가 다르다.
   * 상태를 기다리는 것은 화면 객체의 단언이 하고, 이 대기는 그 뒤에 눈을 위해 붙는다.
   */
  private async hold(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  get steps(): number {
    return this.stepCount;
  }

  get outputPath(): string {
    return path.join(OUT_DIR, `${safeName(this.info.title)}.webm`);
  }
}

/** 테스트 제목을 파일 이름으로 바꾼다. 한글은 그대로 두고 경로에 못 쓰는 것만 바꾼다. */
export function safeName(title: string): string {
  return title
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

interface DemoFixtures {
  demo: Director;
}

export const test = base.extend<DemoFixtures>({
  // 폰트 CDN 이 막힌 곳에서 나는 콘솔 오류. 어느 요청이 실패했는지는 아래에서 따로 본다.
  consoleErrorAllowList: async ({}, use) => {
    await use([/Failed to load resource: net::ERR_/]);
  },

  // 오버레이를 얹는다. 부모 page 의 격리 트랩과 가드는 그대로 살아 있다.
  page: async ({ page }, use) => {
    await page.addInitScript(installDemoOverlay);

    const strayFailures: string[] = [];
    page.on('requestfailed', (request) => {
      if (FONT_CDN.test(request.url())) return;
      // 마지막에 페이지를 닫으면서 취소된 요청. 실패가 아니다.
      if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
      strayFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText}`);
    });

    await use(page);

    // 콘솔 오류를 넓게 눈감은 대신, 무엇이 실패했는지는 여기서 좁혀 본다.
    expect(strayFailures, `녹화 중 실패한 요청:\n${strayFailures.join('\n')}`).toEqual([]);
  },

  demo: async ({ page }, use, testInfo) => {
    const director = new Director(page, testInfo);
    await use(director);

    // 영상은 페이지를 닫아야 완성된다. saveAs 가 그 완성을 기다린 뒤 옮긴다.
    const video = page.video();
    if (video != null) {
      await mkdir(OUT_DIR, { recursive: true });
      await page.close();
      await video.saveAs(director.outputPath);
    }
  },
});

export { expect };
