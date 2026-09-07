import { expect, type Locator, type Page } from '@playwright/test';

import { ROUTES } from '../../src/app/router/routes';
import { TEST_IDS } from '../../src/shared/testIds';

/** 화면에 적힌 그룹 이름 그대로다. 구획과 시트의 갈래가 같은 이름을 쓴다. */
export type AssetGroupLabel = '예적금·현금' | '투자' | '보증금·기타' | '부채';

/**
 * 자산 화면.
 *
 * 관리 탭 아래 하위 화면이라 URL 이 달라 별도 객체다. 한 화면이 순자산 카드와
 * 그룹 구획 넷, 시트 하나를 데리고 있어 시트만 안쪽 객체로 나눠 뒀다.
 *
 * 셀렉터는 이 파일 안에만 둔다. 무엇이 맞는지는 spec 이 정한다.
 */
export class AssetsScreen {
  private readonly page: Page;

  /** 더하기와 고치기가 같은 시트다. 제목만 다르다. */
  readonly sheet: AssetItemSheet;

  constructor(page: Page) {
    this.page = page;
    this.sheet = new AssetItemSheet(page);
  }

  async open(): Promise<void> {
    await this.page.goto(ROUTES.assets);
  }

  /**
   * 조회가 끝난 뒤.
   *
   * 적어 둔 것이 있으면 순자산이, 없으면 빈 상태 제목이 뜬다. 둘 중 하나가 보이면
   * 로딩 자리표시자가 걷힌 것이다.
   */
  async waitReady(): Promise<void> {
    await expect(this.netWorth.or(this.emptyTitle)).toBeVisible();
  }

  /** 순자산 금액. 자산 합에서 부채 합을 뺀 값이고 서버가 센다. */
  get netWorth(): Locator {
    return this.page.getByTestId(TEST_IDS.netWorth);
  }

  /** 순자산 위 한 줄. 언제 적은 것인지 기준일이 여기 적힌다. */
  get basisLabel(): Locator {
    return this.netWorthCard.getByText(/^내 순자산( · \d{1,2}월 \d{1,2}일 기준)?$/);
  }

  /** 순자산이 어디서 나왔는지 적은 줄. `자산 X − 부채 Y`. */
  get breakdown(): Locator {
    return this.netWorthCard.getByText(/^자산 .* − 부채 .*$/);
  }

  /** 한 줄도 없을 때의 제목. */
  get emptyTitle(): Locator {
    return this.page.getByText('아직 자산을 적지 않았어요', { exact: true });
  }

  /** 빈 상태에서 처음 적기 시작하는 버튼. */
  get startButton(): Locator {
    return this.page.getByRole('button', { name: '자산 적기', exact: true });
  }

  /** 못 불러왔을 때. 이 자리에는 더하기 입구를 두지 않는다. */
  get loadFailure(): Locator {
    return this.page.getByText('자산을 불러오지 못했어요', { exact: true });
  }

  /** 그 그룹 구획. 항목이 없어도 구획은 그려진다. */
  group(label: AssetGroupLabel): Locator {
    return this.page.getByRole('region', { name: label, exact: true });
  }

  /** 그 그룹의 소계. 서버가 센 값이다. */
  groupTotal(label: AssetGroupLabel): Locator {
    return this.group(label).getByTestId(TEST_IDS.assetGroupTotal);
  }

  /** 그 그룹 안의 항목 줄 전부. */
  rows(label: AssetGroupLabel): Locator {
    return this.group(label).getByTestId(TEST_IDS.assetItemRow);
  }

  /** 화면 어디에 있든 그 이름의 항목 줄. 몇 개인지 셀 때 쓴다. */
  row(name: string): Locator {
    return this.page
      .getByTestId(TEST_IDS.assetItemRow)
      .filter({ has: this.page.getByText(name, { exact: true }) });
  }

  /** 그 그룹에 항목을 더하는 버튼. 구획마다 이름이 달라 그것으로 집는다. */
  addButton(label: AssetGroupLabel): Locator {
    return this.page.getByRole('button', { name: `${label} 항목 추가`, exact: true });
  }

  /** 그 항목을 고치려고 누르는 줄. */
  editButton(name: string): Locator {
    return this.page.getByRole('button', { name: `${name} 고치기`, exact: true });
  }

  /** 빈 상태에서 첫 항목을 적는다. */
  async start(input: { group: AssetGroupLabel; name?: string; amount: number }): Promise<void> {
    await this.startButton.click();
    await this.sheet.waitOpen();
    await this.sheet.fill(input);
    await this.sheet.save();
  }

  /** 그 그룹에 항목 하나를 더한다. */
  async add(
    label: AssetGroupLabel,
    input: { group?: AssetGroupLabel; name?: string; amount: number },
  ): Promise<void> {
    await this.addButton(label).click();
    await this.sheet.waitOpen();
    await this.sheet.fill({ ...input, group: input.group ?? label });
    await this.sheet.save();
  }

  /** 이미 적어 둔 줄을 눌러 시트만 연다. 지금 무엇이 들어 있는지 볼 때 쓴다. */
  async openEdit(name: string): Promise<void> {
    await this.editButton(name).click();
    await this.sheet.waitOpen();
  }

  /** 이미 적어 둔 줄을 고친다. */
  async edit(
    name: string,
    input: { group?: AssetGroupLabel; name?: string; amount?: number },
  ): Promise<void> {
    await this.openEdit(name);
    await this.sheet.fill(input);
    await this.sheet.save();
  }

  /** 이미 적어 둔 줄을 지운다. */
  async remove(name: string): Promise<void> {
    await this.openEdit(name);
    await this.sheet.remove();
  }

  /**
   * 본문이 실제로 차지한 가로 폭과 화면에 보이는 폭.
   *
   * `innerWidth` 와 견주면 안 된다. 본문이 넘치면 브라우저가 축소하면서 `innerWidth` 도
   * 함께 커져 둘이 늘 같아진다(항진 명제다). 축소해도 안 움직이는 것은 visual viewport 다.
   */
  async widths(): Promise<{ content: number; visible: number }> {
    return this.page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      visible: Math.ceil(window.visualViewport?.width ?? window.innerWidth),
    }));
  }

  /** 순자산 카드. 그 안의 글자만 잡으려고 좁힌다. */
  private get netWorthCard(): Locator {
    return this.page.getByRole('region', { name: '순자산', exact: true });
  }
}

/** 자산 항목 시트. 더할 때와 고칠 때가 같은 시트이고 제목만 다르다. */
class AssetItemSheet {
  private readonly page: Page;
  private readonly root: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByRole('dialog', { name: /^자산 항목 (추가|고치기)$/ });
  }

  /** 시트 자체. 저장이 막혔을 때 닫히지 않고 남아 있는지 볼 때 쓴다. */
  get dialog(): Locator {
    return this.root;
  }

  get addDialog(): Locator {
    return this.page.getByRole('dialog', { name: '자산 항목 추가', exact: true });
  }

  get editDialog(): Locator {
    return this.page.getByRole('dialog', { name: '자산 항목 고치기', exact: true });
  }

  get nameField(): Locator {
    return this.root.getByLabel('이름 (선택)', { exact: true });
  }

  /**
   * 금액 입력칸.
   *
   * 라벨이 입력칸을 감싸는 모양이라 접근성 이름에 단위 `원` 까지 붙는다.
   * 이름을 못 박으면 잡히지 않는다. 예산 시트도 같은 이유로 부분일치로 집는다.
   */
  get amountField(): Locator {
    return this.root.getByLabel('금액');
  }

  get saveButton(): Locator {
    return this.root.getByRole('button', { name: '저장', exact: true });
  }

  /** 고치는 시트에만 있다. */
  get deleteButton(): Locator {
    return this.root.getByRole('button', { name: '지우기', exact: true });
  }

  /** 그룹 갈래 하나. 지금 고른 것은 `aria-checked` 로 알린다. */
  groupChoice(label: AssetGroupLabel): Locator {
    return this.root
      .getByRole('radiogroup', { name: '자산 그룹' })
      .getByRole('radio', { name: label, exact: true });
  }

  async waitOpen(): Promise<void> {
    await expect(this.root).toBeVisible();
  }

  async waitClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0);
  }

  /**
   * 그룹 갈래마다 이름이 몇 줄로 그려졌나.
   *
   * 넷을 한 줄에 늘어놓았다. 글자가 칸보다 넓으면 넘치는 게 아니라 **두 줄로 접혀서**,
   * 34px 짜리 칸 안에서 위아래가 잘린다. 그래서 폭이 아니라 줄 수를 센다.
   * 글자를 감싼 범위(Range)가 만든 줄 상자 개수가 곧 줄 수다.
   */
  async groupChoiceLines(): Promise<{ label: string; lines: number }[]> {
    return this.root.getByRole('radiogroup', { name: '자산 그룹' }).evaluate((group) =>
      [...group.querySelectorAll<HTMLElement>('[role="radio"]')].map((item) => {
        const range = document.createRange();
        range.selectNodeContents(item);
        return { label: item.textContent ?? '', lines: range.getClientRects().length };
      }),
    );
  }

  /** 넘긴 것만 채운다. 고칠 때 금액만 바꾸는 것과 이름만 바꾸는 것이 둘 다 된다. */
  async fill(input: { group?: AssetGroupLabel; name?: string; amount?: number }): Promise<void> {
    if (input.group != null) {
      await this.groupChoice(input.group).click();
      await expect(this.groupChoice(input.group)).toHaveAttribute('aria-checked', 'true');
    }
    if (input.name != null) await this.nameField.fill(input.name);
    if (input.amount != null) await this.amountField.fill(String(input.amount));
  }

  /** 저장한다. 시트가 닫히면 저장이 끝난 것이다. */
  async save(): Promise<void> {
    await this.saveButton.click();
    await this.waitClosed();
  }

  async remove(): Promise<void> {
    await this.deleteButton.click();
    await this.waitClosed();
  }
}
