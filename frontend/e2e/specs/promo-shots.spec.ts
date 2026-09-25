import { mkdirSync } from 'node:fs';

import type { Page } from '@playwright/test';

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

test.describe('스토어 스크린샷용 화면', () => {
  test.skip(OUT == null, 'POCKET_SHOT_OUT 을 주면 그 폴더에 화면을 남긴다');

  test.beforeAll(() => {
    if (OUT != null) mkdirSync(OUT, { recursive: true });
  });

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
  async function shoot(page: Page, name: string): Promise<void> {
    await page.addStyleTag({
      content: '.ait-panel-toggle,.ait-panel,[data-ait-slot-id]{display:none!important}',
    });
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }

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
    await recordSheet.methodTab('줄글').click();

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
