import type { Locator, Page } from '@playwright/test';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 「받은 돈을 어디에 넣었어요?」 창. 팔고 난 저장 뒤 화면과 기록 고치기가 같은 것을 쓴다.
 *
 * 화면을 덮는 한 장이고 포털로 `body` 에 붙어 감싼 시트의 root 로는 안 잡힌다.
 * 뒤로 버튼과 닫기 버튼이 없다. 토스 ‹ 와 같은 신호(`appShell.pressBack()`)로 닫는다.
 */
export class ProceedsDestArea {
  private readonly root: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('dialog', { name: '받은 돈 넣을 곳', exact: true });
  }

  get dialog(): Locator {
    return this.root;
  }

  get title(): Locator {
    return this.root.getByRole('heading', { name: '받은 돈을 어디에 넣었어요?', exact: true });
  }

  /** 통장 줄 전부. 「새 통장」 과 「넣지 않기」 는 고른 표시가 없는 버튼이라 안 잡힌다. */
  get accounts(): Locator {
    return this.root.locator('button[aria-pressed]');
  }

  /** 통장 줄 하나. 이름 뒤에 지금 금액이 붙어 읽힌다. */
  account(name: string): Locator {
    return this.accounts.and(
      this.root.getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}`) }),
    );
  }

  /** 지금 넣을 곳으로 골라 둔 통장 줄. */
  get picked(): Locator {
    return this.root.locator('button[aria-pressed="true"]');
  }

  /** 맨 아래 「새 통장」. 누르면 이름 칸과 「확인」 으로 바뀐다. */
  get newButton(): Locator {
    return this.root.getByRole('button', { name: '새 통장', exact: true });
  }

  get nameInput(): Locator {
    return this.root.getByRole('textbox', { name: '새 통장', exact: true });
  }

  get okButton(): Locator {
    return this.root.getByRole('button', { name: '확인', exact: true });
  }

  /** 이미 넣을 곳이 있을 때만 선다. */
  get clearButton(): Locator {
    return this.root.getByRole('button', { name: '넣지 않기', exact: true });
  }
}
