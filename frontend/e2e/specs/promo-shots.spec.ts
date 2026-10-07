import { mkdirSync } from 'node:fs';

import type { Page } from '@playwright/test';

import type { AssetsOut } from '../../src/shared/api/types';
import { shiftDay, shiftMonth, toLedgerDate } from '../../src/shared/lib/format';
import { type AssetSeed, lastMonth, PrepApi } from '../support/api';
import { CAPTURE_DATA_URI, seedMockImages } from '../support/deviceMock';
import { expect, test } from '../support/fixtures';

/**
 * 스토어 스크린샷에 넣을 **실제 앱 화면**을 찍는다.
 *
 * `POCKET_SHOT_OUT` 을 주지 않으면 건너뛴다. 평소에 돌 이유가 없고, CI 에서 자동으로
 * 돌면 없는 폴더에 쓰다가 애먼 곳이 빨개진다.
 *
 * **진짜 화면을 쓰는 이유가 있다.** 그려서 만든 목업은 실제와 조금씩 어긋나는데,
 * 스토어 그림을 보고 들어온 사람이 그 차이를 바로 알아챈다.
 *
 * 빈 화면도 못 쓴다. 「걸어 둔 것이 없어요」 가 찍히면 기능이 없는 앱으로 보인다.
 * 그래서 각 검사가 찍기 전에 볼 만한 데이터를 먼저 심는다.
 */

const OUT = process.env.POCKET_SHOT_OUT;
/**
 * 어느 판을 찍나. 비우거나 `basic` 이면 기본 판(캡처, 줄글, 도넛, 분류, 엑셀, 태그),
 * `shared` 면 같이 쓰는 가계부 판, `assets` 면 내 자산 판.
 * 한 번에 한 판만 찍어 폴더에 다른 판 그림이 섞이지 않게 한다.
 */
const SET = process.env.POCKET_SHOT_SET ?? '';
const BASIC = SET === '' || SET === 'basic';

/**
 * 개발용 표식 둘을 감추고 화면을 찍는다.
 *
 * - `.ait-panel-toggle` 오른쪽 아래 파란 동그라미(「AIT」). devtools 패널을 여는 버튼이다
 * - `[data-ait-slot-id]` 배너가 설 자리에 목이 대신 그리는 점선 상자.
 *   운영에서는 진짜 광고가 서는 자리라, 스토어 그림에 「Banner Ad」 글자가 들어가면 안 된다
 *
 * 이름은 목 소스에서 직접 확인했다(`devtools/dist/panel/index.js` 의 `PANEL_STYLES`,
 * `devtools/dist/mock/3x.js` 의 `placeholder.dataset.aitSlotId`).
 *
 * **`beforeEach` 에 넣으면 안 된다.** 그때는 아직 빈 문서라, 넣어 둔 style 태그가
 * 첫 이동에서 통째로 사라진다. 찍기 직전에 그 문서에 직접 넣는다.
 */
async function shoot(
  page: Page,
  name: string,
  options: { fullPage?: boolean; hide?: string[] } = {},
): Promise<void> {
  const hidden = ['.ait-panel-toggle', '.ait-panel', '[data-ait-slot-id]', ...(options.hide ?? [])];
  // 데스크톱 크롬이 시트 오른쪽에 스크롤바 줄을 그린다. 폰 웹뷰에는 없는 줄이다.
  await page.addStyleTag({
    content: `${hidden.join(',')}{display:none!important}*{scrollbar-width:none!important}`,
  });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: options.fullPage });
}

/**
 * 배너 자리를 통째로 걷는다. 점선 상자만 감추면 그 높이만큼 빈 틈이 남아, 위아래 카드를
 * 한 장에 담을 수 없다. 스크롤 위치를 정하기 전에 불러야 자리가 어긋나지 않는다.
 */
async function hideBanners(page: Page): Promise<void> {
  await page.addStyleTag({ content: '[data-testid="ad-slot"]{display:none!important}' });
}

test.describe('스토어 스크린샷용 화면', () => {
  test.skip(OUT == null || !BASIC, 'POCKET_SHOT_OUT 을 주면 그 폴더에 화면을 남긴다');

  test.beforeAll(() => {
    if (OUT != null) mkdirSync(OUT, { recursive: true });
  });

  /**
   * 기록하기 › 캡처로 정리에서 사진 한 장을 읽은 검토 화면. 첫 장 「캡처 한 장이면」 의 재료다.
   *
   * 서버 스텁이 그림을 안 읽고 정해 둔 여섯 줄을 낸다. 스텁이라는 안내 줄은 운영에 없어 감춘다.
   * 스텁은 GS25 를 「생활」 로 내므로, 사람이 건 상호 규칙으로 「편의점」 에 앉힌다.
   */
  test('캡처로 읽은 검토 화면', async ({ page, prep, home, recordSheet }) => {
    const convenience = (await prep.categoryIds()).get('편의점');
    if (convenience == null) throw new Error("기본 분류 '편의점' 이 없다");
    await prep.addMerchantRule('GS25', convenience);
    await seedMockImages(CAPTURE_DATA_URI)(page);
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.chooseWay('캡처');
    await recordSheet.capture.pick();
    await expect(recordSheet.capture.rows).toHaveCount(6);
    await page.waitForTimeout(500);

    await shoot(page, 'shot-capture-review', { hide: ['.capture__stub'] });
  });

  /**
   * 줄글 탭에 **적는 중인** 화면.
   *
   * 읽어 온 목록이 아니라 적는 자리를 찍는다. 스토어에서 보여 줘야 하는 것은
   * 「이렇게만 쓰면 된다」 이지 「고칠 것이 이만큼 나온다」 가 아니다.
   */
  test('줄글로 적는 중', async ({ page, home, recordSheet }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.chooseWay('줄글');

    await recordSheet.nl.textarea.fill(
      '어제 김밥천국 8000원\n그제 스타벅스 4500원\n오늘 아침 편의점 3200원',
    );
    // 커서 깜빡임이 찍히면 어느 판은 밑줄이 남는다. 포커스를 뺀다.
    await recordSheet.nl.textarea.blur();
    await page.waitForTimeout(400);

    await shoot(page, 'shot-nl');
  });

  /** 리포트의 도넛. 카테고리별 비중이 보여야 해서 종류를 여럿 심는다. */
  test('리포트 도넛', async ({ page, prep, report }) => {
    // 기본 분류를 그대로 쓴다. 같은 이름으로 새로 만들면 서버가 409 로 막는다.
    const byName = await prep.categoryIds();
    const seeds = [
      ['식비', 412_000, '김밥천국'],
      ['카페·간식', 138_000, '스타벅스'],
      ['생활', 96_000, 'GS25'],
      ['교통', 74_000, '카카오T'],
      ['여가·취미', 52_000, 'CGV'],
    ] as const;
    for (const [name, amount, merchant] of seeds) {
      const id = byName.get(name);
      if (id == null) throw new Error(`기본 분류 '${name}' 이 없다`);
      await prep.addTransaction({ amount, categoryId: id, merchant, daysAgo: 1 });
    }

    await report.open();
    await report.waitReady();
    await expect(report.donut).toBeVisible();
    /*
      **카드 한 장이 통째로 들어와야 한다.** 가운데로 맞췄더니 아래 두 줄이 떠 있는
      탭바에 가려, 스토어 그림에 「교통」 이 반쯤 잘려 나왔다. 카드 아래를 화면 아래에
      맞춘 다음 탭바 높이(96)보다 조금 더 밀어 올린다.
    */
    await report.donut.evaluate((node) => {
      const card = node.closest('.report__breakdown') ?? node;
      card.scrollIntoView({ block: 'end' });
      window.scrollBy(0, 130);
    });
    await page.waitForTimeout(700);

    await shoot(page, 'shot-report-donut');
  });

  /**
   * 새 분류 만들기 창.
   *
   * 이름을 적어 둔 채로 찍는다. 빈 칸만 있으면 무엇을 하는 화면인지 안 보인다.
   * 아이콘 격자는 펴진 채로 열리니 그대로 둔다.
   */
  test('새 분류 만들기', async ({ page, home, recordSheet }) => {
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();

    await recordSheet.input.enterAmount(24_000);
    await recordSheet.input.openNewCategory();
    const form = recordSheet.input.newCategoryForm;
    await expect(form.title).toBeVisible();
    await form.nameField.fill('반려동물');
    await form.nameField.blur();
    await expect(form.iconGrid).toBeVisible();
    await page.waitForTimeout(400);

    await shoot(page, 'shot-category-new');
  });

  /**
   * 태그 넷. **이름도 색도 건수도 실제로 쓸 법해야** 무엇에 쓰는 것인지 보인다.
   *
   * 「0건」 만 늘어서 있으면 아직 아무것도 안 한 화면으로 읽힌다. 색이 다 같아도
   * 태그를 색으로 가른다는 것이 안 보인다. 두 장(목록·리포트)이 같은 넷을 써서
   * 붙여 놨을 때 한 이야기가 되게 한다.
   */
  const PROMO_TAGS = [
    { name: '데이트 통장', color: 'rose', amount: 186_000 },
    { name: '정산필요', color: 'amber', amount: 124_000 },
    { name: '캐시백 예정', color: 'sky', amount: 68_000 },
    { name: '정산완료', color: 'sage', amount: 45_000 },
  ] as const;

  test('태그 목록', async ({ page, prep, tags }) => {
    for (const tag of PROMO_TAGS) {
      const tagId = await prep.addTag(tag.name, tag.color);
      await prep.addTransaction({ amount: tag.amount, tagId, merchant: tag.name, daysAgo: 1 });
    }

    await tags.open();
    await tags.waitReady();
    await page.waitForTimeout(700);

    await shoot(page, 'shot-tags');
  });

  /** 리포트의 태그별 지출. 위 목록과 같은 넷을 써야 두 장을 붙여 놨을 때 한 이야기가 된다. */
  test('리포트 태그별 지출', async ({ page, prep, report }) => {
    for (const tag of PROMO_TAGS) {
      const tagId = await prep.addTag(tag.name, tag.color);
      await prep.addTransaction({ amount: tag.amount, tagId, merchant: tag.name, daysAgo: 1 });
    }

    await report.open();
    await report.waitReady();
    const card = report.tagCard('지출');
    await expect(card).toBeVisible();
    // 카드가 화면 가운데 오게 굴린다. 떠 있는 탭바(아래 96px)에 아랫줄이 가리면 못 쓴다.
    await card.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(700);

    await shoot(page, 'shot-report-tags');
  });

  /** 엑셀로 내보내기 시트. 기간 고르개와 안내 세 줄이 함께 들어와야 한다. */
  test('엑셀로 내보내기', async ({ page, prep, settings }) => {
    await prep.addTransaction({ amount: 12_000, daysAgo: 0, merchant: '김밥천국' });
    await prep.addTransaction({ amount: 4_500, daysAgo: 1, merchant: '스타벅스' });

    await settings.open();
    await settings.waitReady();
    await settings.ledgerExport.openButton.click();
    await expect(settings.ledgerExport.sheet).toBeVisible();
    await page.waitForTimeout(400);

    await shoot(page, 'shot-export');
  });
});

/**
 * 같이 쓰는 가계부 판. `POCKET_SHOT_SET=shared` 일 때만 돈다.
 *
 * 사람 이름은 흔한 가명(민지·준호·서연·지훈), 적는 말은 가게 이름 없이 무엇에 썼는지로 쓴다.
 * 금액은 전부 양수이고 남은 예산도 넉넉히 남게 둔다. 빈 칸이나 0원이 찍히면 못 쓴다.
 */
test.describe('스토어 스크린샷용 화면: 같이 쓰는 가계부', () => {
  test.skip(OUT == null || SET !== 'shared', 'POCKET_SHOT_SET=shared 로 이 판만 찍는다');

  test.beforeAll(() => {
    if (OUT != null) mkdirSync(OUT, { recursive: true });
  });

  /** 오늘부터 며칠 전인 가계부 날짜. 달 초에 돌려도 이번 달 1일 앞으로는 안 넘어간다. */
  const daysBefore = (days: number) => {
    const today = toLedgerDate(new Date());
    return shiftDay(today, -Math.min(days, Number(today.slice(8)) - 1));
  };

  /** 둘이 번갈아 적은 이번 달 기록. 민지 105,000 · 준호 93,000 이라 정산 카드가 6,000원이다. */
  const DATE_ENTRIES = [
    { who: '준호', days: 0, amount: 23_000, title: '치킨 배달', category: '외식·배달' },
    { who: '민지', days: 1, amount: 28_000, title: '영화 두 장', category: '데이트' },
    { who: '준호', days: 2, amount: 46_000, title: '주말 장보기', category: '장보기' },
    { who: '민지', days: 4, amount: 42_000, title: '파스타 저녁', category: '외식·배달' },
    { who: '준호', days: 6, amount: 24_000, title: '전시회 티켓', category: '여가·취미' },
    { who: '민지', days: 9, amount: 35_000, title: '꽃다발', category: '데이트' },
  ] as const;

  test('공유 홈', async ({ page, prep, partner, home }) => {
    const bookId = await prep.createBook({ name: '데이트통장', myName: '민지' });
    await partner.prep.joinBook(await prep.bookInviteCode(bookId), '준호');
    await prep.setBookBudget(bookId, 500_000);
    for (const entry of DATE_ENTRIES) {
      const api = entry.who === '민지' ? prep : partner.prep;
      await api.addBookEntry(bookId, {
        amount: entry.amount,
        title: entry.title,
        category: entry.category,
        on: daysBefore(entry.days),
      });
    }

    await home.open();
    await home.waitReady();
    await home.book.switchTo('데이트통장');
    await expect(home.book.settleCard).toBeVisible();
    await page.waitForTimeout(700);

    await shoot(page, 'shot-book-home');
  });

  /**
   * 넷이 다녀온 여행 정산. 인원수대로 나눈 결과가 세 줄로 선다.
   * 민지 360,000 · 준호 172,000 · 서연 154,000 · 지훈 58,000, 한 사람 몫 186,000.
   */
  test('여행 정산', async ({ page, prep, anonKey, books }) => {
    const bookId = await prep.createBook({ kind: 'trip', name: '제주 여행', myName: '민지' });
    const code = await prep.bookInviteCode(bookId);
    const others = await Promise.all(
      ['junho', 'seoyeon', 'jihun'].map((tag) => PrepApi.create(`${anonKey}-${tag}`)),
    );
    try {
      const [junho, seoyeon, jihun] = others;
      await junho.joinBook(code, '준호');
      await seoyeon.joinBook(code, '서연');
      await jihun.joinBook(code, '지훈');
      const seeds = [
        [prep, 360_000, '숙소 2박', '숙소'],
        [junho, 148_000, '렌터카', '교통'],
        [junho, 24_000, '주유', '교통'],
        [seoyeon, 126_000, '흑돼지 저녁', '식비'],
        [seoyeon, 28_000, '바다 보이는 카페', '카페'],
        [jihun, 42_000, '해장국 아침', '식비'],
        [jihun, 16_000, '감귤 초콜릿', '기념품'],
      ] as const;
      for (const [api, amount, title, category] of seeds) {
        await api.addBookEntry(bookId, { amount, title, category, on: daysBefore(3) });
      }
    } finally {
      await Promise.all(others.map((api) => api.dispose()));
    }

    await books.openSettle(bookId);
    await books.settle.waitReady();
    await expect(books.settle.resultLine('지훈 → 민지 128,000원')).toBeVisible();
    await page.waitForTimeout(500);

    await shoot(page, 'shot-book-settle');
  });

  /** 링크를 받은 사람이 처음 여는 화면. 이름을 적어 둔 채로 찍어 「같이 쓰기」 가 켜져 있게 한다. */
  test('초대 받은 화면', async ({ page, partner, books }) => {
    const bookId = await partner.prep.createBook({ name: '데이트통장', myName: '민지' });
    await books.openJoin(await partner.prep.bookInviteCode(bookId));
    await expect(books.join.lockLine).toBeVisible();
    await books.join.nameInput.fill('준호');
    await books.join.nameInput.blur();
    await expect(books.join.joinButton).toBeEnabled();
    await page.waitForTimeout(400);

    await shoot(page, 'shot-book-join');
  });

  /** 만들기 첫 단계. 누구와 쓰는지 네 가지 카드. 셋째 장 후보로 같이 찍어 둔다. */
  test('만들기 유형 카드', async ({ page, books }) => {
    await books.openNew();
    await expect(books.create.kindTitle).toBeVisible();
    await page.waitForTimeout(400);

    await shoot(page, 'shot-book-kinds');
  });
});

/**
 * 내 자산 판. `POCKET_SHOT_SET=assets` 일 때만 돈다.
 *
 * 사회 초년생 몇 해 차의 그럴듯한 자산을 심는다. 종목은 넣은 돈(cost)과 1주 가격(price)을
 * 함께 줘야 수익률이 뜬다. 금액은 수량 × 가격으로 맞춘다. 부채는 넣지 않는다(음수가 찍힌다).
 */
test.describe('스토어 스크린샷용 화면: 내 자산', () => {
  test.skip(OUT == null || SET !== 'assets', 'POCKET_SHOT_SET=assets 로 이 판만 찍는다');

  test.beforeAll(() => {
    if (OUT != null) mkdirSync(OUT, { recursive: true });
  });

  /**
   * 지난달 28일에 적어 둔 것. 순자산 흐름과 지난달 대비에 막대가 하나 더 서게 한다.
   * 25일에 넣은 돈이 이미 들어간 값이라 이번 달 늘어난 만큼이 이번 달 모은 돈과 비슷하다.
   */
  const LAST_MONTH: AssetSeed[] = [
    { group: 'cash', label: '카카오뱅크', amount: 1_500_000 },
    { group: 'cash', label: '청년도약계좌', amount: 1_700_000, monthly: 700_000 },
    { group: 'cash', label: '카카오뱅크 적금', amount: 700_000, monthly: 500_000 },
    { group: 'cash', label: '주택청약', amount: 900_000, monthly: 100_000 },
    stock('삼성전자', 'stock', 10, 650_000, 68_000),
    stock('TIGER 미국S&P500', 'etf', 30, 540_000, 20_800),
    stock('엔비디아', 'stock', 3, 600_000, 240_000),
    { group: 'pension', label: '연금저축펀드', amount: 1_200_000, monthly: 300_000 },
  ];

  /**
   * 오늘 적은 것. 아래 넣은 기록이 더해지기 전 값이다(지난달 25일 것까지 더해진다).
   * 다 더하면 980만원이 되게 맞췄다. 도넛 가운데가 만 단위 소수로 줄여 적는다.
   */
  const NOW: AssetSeed[] = [
    { group: 'cash', label: '카카오뱅크', amount: 1_318_500 },
    { group: 'cash', label: '청년도약계좌', amount: 1_000_000, monthly: 700_000 },
    { group: 'cash', label: '카카오뱅크 적금', amount: 200_000, monthly: 500_000 },
    { group: 'cash', label: '주택청약', amount: 900_000, monthly: 100_000 },
    stock('삼성전자', 'stock', 10, 650_000, 72_000),
    stock('TIGER 미국S&P500', 'etf', 30, 540_000, 21_500),
    stock('엔비디아', 'stock', 3, 600_000, 255_000),
    { group: 'pension', label: '연금저축펀드', amount: 1_200_000, monthly: 300_000 },
  ];

  function stock(
    label: string,
    kind: 'stock' | 'etf',
    quantity: number,
    cost: number,
    price: number,
  ): AssetSeed {
    return {
      group: 'investment',
      label,
      kind,
      quantity: String(quantity),
      cost,
      price,
      amount: quantity * price,
    };
  }

  function keyOf(assets: AssetsOut, label: string): string {
    const key = assets.items.find((item) => item.label === label)?.item_key;
    if (key == null) throw new Error(`심은 항목이 없다: ${label}`);
    return key;
  }

  /** 이번 달 안의 며칠 전. 달 초에 돌려도 지난달로 안 넘어간다. */
  function daysAgoInMonth(days: number): number {
    return Math.min(days, Number(toLedgerDate(new Date()).slice(8)) - 1);
  }

  /** 지난달과 이번 달 두 번 적고, 달마다 넣은 기록을 심는다. 큰 저축·투자 Top 5 의 재료다. */
  async function seedPortfolio(prep: PrepApi): Promise<void> {
    await prep.putAssets(LAST_MONTH);
    await prep.moveLatestAssetSnapshot(`${lastMonth()}-28`);
    const assets = await prep.putAssets(NOW);
    const key = (label: string) => keyOf(assets, label);
    await prep.addAssetTransfer({
      amount: 700_000,
      itemKey: key('청년도약계좌'),
      on: `${lastMonth()}-25`,
    });
    await prep.addAssetTransfer({
      amount: 500_000,
      itemKey: key('카카오뱅크 적금'),
      on: `${lastMonth()}-25`,
    });
    await prep.addAssetTransfer({
      amount: 700_000,
      itemKey: key('청년도약계좌'),
      daysAgo: daysAgoInMonth(6),
    });
    await prep.addAssetTransfer({
      amount: 500_000,
      itemKey: key('카카오뱅크 적금'),
      daysAgo: daysAgoInMonth(6),
    });
    await prep.addAssetTransfer({
      amount: 300_000,
      itemKey: key('연금저축펀드'),
      daysAgo: daysAgoInMonth(5),
    });
    await prep.addAssetTransfer({
      amount: 100_000,
      itemKey: key('주택청약'),
      daysAgo: daysAgoInMonth(5),
    });
    await prep.addAssetTransfer({
      amount: 144_000,
      itemKey: key('삼성전자'),
      quantity: '2',
      daysAgo: daysAgoInMonth(2),
    });
    await prep.addAssetTransfer({
      amount: 107_500,
      itemKey: key('TIGER 미국S&P500'),
      quantity: '5',
      daysAgo: daysAgoInMonth(1),
    });
  }

  /** 관리 › 자산관리. 순자산, 그룹, 종목 수익률이 한 장에 들어오게 화면 전체를 찍는다. */
  test('내 자산 화면', async ({ page, prep, assets }) => {
    await seedPortfolio(prep);
    await assets.open();
    await assets.waitReady();
    await expect(assets.row('삼성전자')).toBeVisible();
    await hideBanners(page);
    await page.waitForTimeout(700);

    await shoot(page, 'shot-asset-screen', { fullPage: true });
  });

  /** 내 자산 리포트. 확인 창과 짧은 전면 광고(목)를 지나 열린 뒤 화면 전체를 찍는다. */
  test('내 자산 리포트', async ({ page, prep, assetAnalysis }) => {
    await seedPortfolio(prep);
    await assetAnalysis.open('all');
    await assetAnalysis.adConsentConfirm.click();
    await assetAnalysis.waitOpen('all');
    await expect(assetAnalysis.charts.topSaveRows.first()).toBeVisible();
    await hideBanners(page);
    await page.waitForTimeout(900);

    await shoot(page, 'shot-asset-report', { fullPage: true });
  });

  /** 주식 리포트. 내 자산 리포트를 먼저 열어 두면 종류별은 광고 없이 열린다. */
  test('주식 리포트', async ({ page, prep, assetAnalysis }) => {
    await seedPortfolio(prep);
    await assetAnalysis.open('all');
    await assetAnalysis.adConsentConfirm.click();
    await assetAnalysis.waitOpen('all');
    await assetAnalysis.kindRow('stock').click();
    await assetAnalysis.waitOpen('stock');
    await expect(assetAnalysis.returns).toBeVisible();
    await hideBanners(page);
    await page.waitForTimeout(900);

    await shoot(page, 'shot-asset-stock-report', { fullPage: true });
  });

  /**
   * 기록하기 › 캡처로 정리 › 저축·투자 로 읽은 검토 화면.
   *
   * 스텁은 그림을 안 읽고 잔액 셋과 종목 둘을 낸다. 이미 적어 둔 둘을 심어 「바뀐 만큼」 이 보이게 한다.
   */
  test('캡처로 자산 채우기 검토', async ({ page, prep, home, recordSheet }) => {
    await seedMockImages(CAPTURE_DATA_URI)(page);
    await prep.putAssets([
      { group: 'cash', label: '청년도약계좌', amount: 3_000_000, monthly: 700_000 },
      { group: 'cash', label: '카카오뱅크', amount: 1_000_000 },
    ]);
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.methodTab('캡처로 정리').click();
    await recordSheet.kindChip('저축·투자').click();
    await recordSheet.next();
    await recordSheet.assetFill.waitStep('review');
    await expect(recordSheet.assetFill.rows).toHaveCount(5);
    await page.waitForTimeout(500);

    await shoot(page, 'shot-asset-capture-review');
  });

  /** 키패드로 적는 저축·투자. 적는 화면과 저장 직후를 둘 다 찍는다. */
  test('저축·투자 기록', async ({ page, prep, home, recordSheet }) => {
    await prep.putAssets([
      { group: 'cash', label: '카카오뱅크 적금', amount: 2_500_000, monthly: 300_000 },
      { group: 'cash', label: '청년도약계좌', amount: 4_200_000, monthly: 700_000 },
      { group: 'cash', label: '주택청약', amount: 1_200_000, monthly: 100_000 },
      stock('삼성전자', 'stock', 10, 650_000, 72_000),
      { group: 'pension', label: '연금저축펀드', amount: 3_100_000, monthly: 300_000 },
    ]);
    await home.open();
    await home.waitReady();
    await home.recordButton.click();
    await recordSheet.waitOpen();
    await recordSheet.chooseKind('저축·투자');
    await recordSheet.pickDest('카카오뱅크 적금');
    await recordSheet.input.enterAmount(300_000);
    await page.waitForTimeout(400);
    await shoot(page, 'shot-save-keypad');

    await recordSheet.input.saveButton.click();
    await expect(recordSheet.feedback.headline).toHaveText('카카오뱅크 적금에 300,000원 넣었어요');
    await page.waitForTimeout(600);
    await shoot(page, 'shot-save-done');
  });

  /**
   * 한 달 시작일 25일. 월급날부터 다음 달 24일까지를 한 달로 보는 리포트 머리와 고르는 시트.
   *
   * 이번 기간이 지난 기간 같은 날까지보다 덜 쓴 모양으로 심는다. 비교 줄이 빨갛게 늘어 보이면
   * 기능보다 「많이 썼다」 가 먼저 읽힌다.
   */
  test('한 달 시작일 25일', async ({ page, prep, report }) => {
    await prep.setMonthStartDay(25);
    const today = toLedgerDate(new Date());
    const day = Number(today.slice(8));
    const thisStart = day >= 25 ? `${today.slice(0, 8)}25` : `${lastMonth()}-25`;
    const prevStart = `${day >= 25 ? lastMonth() : shiftMonth(lastMonth(), -1)}-25`;
    const elapsed = daysBetween(thisStart, today);
    const byName = await prep.categoryIds();
    const id = (name: string) => {
      const value = byName.get(name);
      if (value == null) throw new Error(`기본 분류 '${name}' 이 없다`);
      return value;
    };

    const thisPeriod = [
      [0, 180_000, '관리비', '주거·고정비'],
      [1, 86_000, '이마트', '생활'],
      [2, 8_000, '김밥천국', '식비'],
      [3, 4_500, '스타벅스', '카페·간식'],
      [4, 32_900, '쿠팡', '쇼핑'],
      [6, 12_400, '카카오T', '교통'],
      [8, 28_000, 'CGV', '여가·취미'],
      [10, 9_000, '김밥천국', '식비'],
      [11, 3_200, 'GS25', '편의점'],
      [12, 4_800, '스타벅스', '카페·간식'],
    ] as const;
    const prevPeriod = [
      [0, 180_000, '관리비', '주거·고정비'],
      [1, 112_000, '이마트', '생활'],
      [3, 23_000, 'BBQ', '식비'],
      [4, 46_000, '무신사', '쇼핑'],
      [5, 6_500, '스타벅스', '카페·간식'],
      [7, 54_000, '교보문고', '여가·취미'],
      [10, 18_000, '김밥천국', '식비'],
      [11, 9_600, '카카오T', '교통'],
      [12, 12_000, '스타벅스', '카페·간식'],
    ] as const;

    await prep.addTransaction({
      amount: 3_200_000,
      type: 'income',
      merchant: '월급',
      categoryId: id('월급'),
      on: thisStart,
    });
    for (const [offset, amount, merchant, category] of thisPeriod) {
      if (offset > elapsed) continue;
      await prep.addTransaction({
        amount,
        merchant,
        categoryId: id(category),
        on: shiftDay(thisStart, offset),
      });
    }
    for (const [offset, amount, merchant, category] of prevPeriod) {
      await prep.addTransaction({
        amount,
        merchant,
        categoryId: id(category),
        on: shiftDay(prevStart, offset),
      });
    }
    await prep.setBudget(1_000_000);

    await report.open();
    await report.waitReady();
    await expect(report.periodLine).toBeVisible();
    await page.waitForTimeout(700);
    await shoot(page, 'shot-month-report');

    await report.periodLine.click();
    await expect(report.monthStart.sheet).toBeVisible();
    await expect(report.monthStart.day(25)).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(600);
    await shoot(page, 'shot-month-sheet');
  });
});

/** 두 가계부 날짜 사이 날 수. 정오끼리 견줘 서머타임 없는 날 계산으로 둔다. */
function daysBetween(from: string, to: string): number {
  const at = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(to) - at(from)) / 86_400_000);
}
