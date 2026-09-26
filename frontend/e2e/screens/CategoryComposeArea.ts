import type { Locator, Page } from '@playwright/test';

/**
 * 어디서 열어도 같은 「새 분류 만들기」 화면.
 *
 * 기록 시트의 키패드 탭은 시트 안쪽을 통째로 바꿔서 이 화면을 만들고, 검토 줄과 기록
 * 고치기는 화면을 덮는 한 장(`CategoryComposeOverlay`)으로 올린다. 그린 자리는 달라도
 * **폼은 한 벌이다**(`CategoryEditForm layout="page"`). 그래서 여기 하나로 센다.
 * 자리마다 셀렉터를 따로 두면 한쪽만 고쳐 놓고 다른 쪽이 낡은 것을 모른다.
 *
 * 덮는 한 장은 포털로 `body` 에 붙어 감싼 시트의 root 로는 안 잡힌다.
 * 그래서 이 객체는 **페이지 전체**를 본다.
 */
export class CategoryComposeArea {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** 맨 위 줄의 제목. 이 화면이 떠 있는지 가리는 값이다. */
  get title(): Locator {
    return this.page.getByText('새 분류 만들기', { exact: true });
  }

  get nameField(): Locator {
    return this.page.getByLabel('이름', { exact: true });
  }

  /** 맨 위 오른쪽. 아이콘 격자를 아무리 내려도 늘 보인다. */
  get saveButton(): Locator {
    return this.page.getByRole('button', { name: '저장', exact: true });
  }

  /** 만들지 않고 왔던 화면으로. 저장과 한 줄에 나란히 있다. */
  get backButton(): Locator {
    return this.page.getByRole('button', { name: '이전', exact: true });
  }

  /**
   * 저장이 왜 회색인지 적는 한 줄. 버튼 바로 아래에 있다.
   *
   * 이름이 비었을 때와 겹칠 때가 서로 다른 말을 한다. 겹침은 서버를 다녀오지 않고 화면이 막는다.
   */
  get reason(): Locator {
    return this.page.locator('.cat-sheet__notice');
  }

  /** 종류는 부른 자리가 이미 정했다. 여기서 다시 묻지 않는다. */
  get kindToggle(): Locator {
    return this.page.getByRole('group', { name: '분류의 종류' });
  }

  /** 접힌 격자를 펴는 줄. 아직 아무것도 안 골랐을 때의 글자다. */
  get openIconsButton(): Locator {
    return this.page.getByRole('button', { name: '아이콘 고르기', exact: true });
  }

  /** 한 번 고른 뒤의 글자. 격자가 접혔다는 증거이기도 하다. */
  get reopenIconsButton(): Locator {
    return this.page.getByRole('button', { name: '아이콘 다시 고르기', exact: true });
  }

  /** 색 고르기. **아이콘을 고르기 전에는 아예 없다.** */
  get colorGroup(): Locator {
    return this.page.getByRole('group', { name: '색', exact: true });
  }

  /** 펼쳐진 아이콘 격자. 접혀 있으면 아예 없다. */
  get iconGrid(): Locator {
    return this.page.getByRole('group', { name: '아이콘' });
  }

  /** 격자 칸 하나. 읽어 주는 이름은 파일 이름에서 앞 번호를 뗀 영어다(`16_paw` 는 `paw`). */
  iconCell(label: string): Locator {
    return this.iconGrid.getByRole('button', { name: label, exact: true });
  }

  /**
   * 새로 만들 때 격자는 **펴진 채로** 열린다. 고르면 접힌다.
   *
   * 접힌 상태에서도 부를 수 있게 한 겹을 둔다. 만드는 길과 고치는 길이 이 함수를
   * 같이 쓰는데, 고치는 쪽은 이미 고른 사람이라 접힌 채로 열린다.
   */
  async pickIcon(label: string): Promise<void> {
    if ((await this.iconGrid.count()) === 0) await this.openIconsButton.click();
    await this.iconCell(label).click();
  }

  async create(name: string, iconLabel: string): Promise<void> {
    await this.nameField.fill(name);
    await this.pickIcon(iconLabel);
    await this.saveButton.click();
  }

  /**
   * 본문(「아이콘」 이름표)을 잡고 아래로 끌어내린다. 버튼이 아니라 누르기로 안 읽힌다.
   * 열린 직후에는 굴리는 손짓으로 쳐 막히므로 부르는 쪽이 조금 쉰 뒤 부른다.
   */
  async dragDown(distance = 230): Promise<void> {
    const box = await this.page
      .locator('.cat-sheet__field--icon > .cat-sheet__label')
      .boundingBox();
    if (box == null) throw new Error('끌어내릴 자리를 찾지 못했다');
    const x = box.x + box.width / 2;
    const y = box.y + Math.min(40, box.height / 3);

    await this.page.mouse.move(x, y);
    await this.page.mouse.down();
    for (let step = 1; step <= 5; step += 1) {
      await this.page.mouse.move(x, y + (distance * step) / 5);
    }
    await this.page.mouse.up();
  }

  /** 이름만 적고 저장한다. 아이콘도 색도 안 고른 채로 만들어지는지 보는 자리다. */
  async createByName(name: string): Promise<void> {
    await this.nameField.fill(name);
    await this.saveButton.click();
  }
}
