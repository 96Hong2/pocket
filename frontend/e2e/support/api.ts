import { request, type APIRequestContext } from '@playwright/test';

import type { TransactionType } from '../../src/shared/api/types';

import { E2E_API_URL } from './env';

/**
 * 심을 거래 하나.
 *
 * 기록 시트로 만들 수 있는 것은 카테고리를 붙인 지출뿐이다. 이체·환불·수입·예산 제외와
 * 가맹점명은 화면에 입력할 자리가 없어 여기로 심는다.
 */
export interface TransactionSeed {
  amount: number;
  /** 며칠 전. 없으면 오늘이다. */
  daysAgo?: number;
  /** 같은 날 안에서의 순서. 목록이 시각 내림차순이라 값이 클수록 아래에 놓인다. */
  minutesAgo?: number;
  /** 없으면 지출. 종류에 따라 목록에 칩이 붙고 집계 규칙도 갈린다. */
  type?: TransactionType;
  /** 가맹점을 알면 행 제목이 이것이 되고 카테고리는 부제로 내려간다. */
  merchant?: string;
  categoryId?: string;
  /** 예산 계산에서만 뺀다. 목록에는 흐려진 채로 남는다. */
  excludedFromBudget?: boolean;
}

/**
 * 사전 조건을 만드는 통로.
 *
 * 준비는 API 로, 행동은 화면으로, 단언도 화면으로 한다.
 * 확인하려는 동작을 여기서 대신하지 않는다. 그 동작의 배경 상태만 심는다.
 * 브라우저와 같은 익명키를 쓰므로 서버에서 같은 사용자가 된다.
 */
export class PrepApi {
  private readonly context: APIRequestContext;

  private constructor(context: APIRequestContext) {
    this.context = context;
  }

  static async create(anonKey: string): Promise<PrepApi> {
    const context = await request.newContext({
      baseURL: E2E_API_URL,
      extraHTTPHeaders: { 'X-Anon-Key': anonKey, 'Content-Type': 'application/json' },
    });
    return new PrepApi(context);
  }

  async dispose(): Promise<void> {
    await this.context.dispose();
  }

  /** 거래 하나를 심는다. 종류·가맹점·예산 제외까지 정한다. */
  async addTransaction(seed: TransactionSeed): Promise<void> {
    const offsetMs = (seed.daysAgo ?? 0) * 24 * 60 * 60 * 1000 + (seed.minutesAgo ?? 0) * 60 * 1000;
    const occurredAt = new Date(Date.now() - offsetMs);

    const response = await this.context.post('/api/v1/transactions', {
      data: {
        occurred_at: occurredAt.toISOString(),
        amount: String(seed.amount),
        type: seed.type ?? 'expense',
        merchant: seed.merchant ?? null,
        source: 'keypad',
        confidence: 1,
        excluded_from_budget: seed.excludedFromBudget ?? false,
        category_id: seed.categoryId ?? null,
      },
    });
    expectOk(response.status(), await response.text(), '거래를 심지 못했다');
  }

  /** 며칠 전 지출을 심는다. `daysAgo` 가 0 이면 오늘이다. */
  async addExpense(options: {
    amount: number;
    daysAgo: number;
    categoryId?: string;
  }): Promise<void> {
    await this.addTransaction(options);
  }

  async setBudget(amount: number): Promise<void> {
    const response = await this.context.put('/api/v1/budgets', {
      data: { amount: String(amount) },
    });
    expectOk(response.status(), await response.text(), '예산을 심지 못했다');
  }

  /** 기본 카테고리 목록. 이름으로 id 를 찾을 때 쓴다. */
  async categoryIdByName(name: string): Promise<string> {
    const response = await this.context.get('/api/v1/categories');
    const body = (await response.json()) as { items: { id: string; name: string }[] };
    const found = body.items.find((item) => item.name === name);
    if (found == null) throw new Error(`카테고리 '${name}' 을 찾지 못했다`);
    return found.id;
  }
}

function expectOk(status: number, body: string, what: string): void {
  if (status >= 200 && status < 300) return;
  throw new Error(`${what}. status=${status} body=${body}`);
}
