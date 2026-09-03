import { request, type APIRequestContext } from '@playwright/test';

import { E2E_API_URL } from './env';

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

  /** 며칠 전 지출을 심는다. `daysAgo` 가 0 이면 오늘이다. */
  async addExpense(options: {
    amount: number;
    daysAgo: number;
    categoryId?: string;
  }): Promise<void> {
    const occurredAt = new Date(Date.now() - options.daysAgo * 24 * 60 * 60 * 1000);

    const response = await this.context.post('/api/v1/transactions', {
      data: {
        occurred_at: occurredAt.toISOString(),
        amount: String(options.amount),
        type: 'expense',
        source: 'keypad',
        confidence: 1,
        excluded_from_budget: false,
        category_id: options.categoryId ?? null,
      },
    });
    expectOk(response.status(), await response.text(), '거래를 심지 못했다');
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
