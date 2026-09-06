import { request, type APIRequestContext } from '@playwright/test';

import type { TransactionType } from '../../src/shared/api/types';
import { shiftMonth, toLedgerDate } from '../../src/shared/lib/format';

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
  /**
   * 날짜를 직접 못 박는다(`2026-08-03`). `daysAgo` 보다 우선한다.
   *
   * `daysAgo` 로 몇 달 전을 만들면 달마다 길이가 달라 귀속 달이 흔들린다.
   * 월 경계를 재는 검사는 이걸 쓴다. 시각은 그 날 정오(KST)다.
   */
  on?: string;
  /**
   * 같은 날 안에서의 순서. 목록이 시각 내림차순이라 값이 클수록 아래에 놓인다.
   *
   * 그 날 정오를 기준으로 뒤로 센다. "지금부터 뒤로" 가 아니다.
   * 자정 직후에 돌리면 `minutesAgo: 2` 가 전날이 되어, 날짜로 고르는 화면이
   * 시간대 버그도 아닌 이유로 깨진다. 실제로 그렇게 깨진 적이 있다.
   */
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
    const occurredAt =
      seed.on != null ? dayNoon(seed.on) : seedTime(seed.daysAgo ?? 0, seed.minutesAgo ?? 0);

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

  /**
   * 같은 모양의 거래를 여러 건 심는다. 페이지 경계를 화면으로 증명할 때 쓴다.
   *
   * 한 건씩 기다리면 31건에 몇 초가 든다. 서로 의존이 없어 한꺼번에 보낸다.
   * 상호에 번호를 붙여 몇 번째 줄이 어느 페이지에 있는지 눈으로 확인할 수 있게 한다.
   */
  async addSeries(
    count: number,
    seed: Omit<TransactionSeed, 'merchant'> & { prefix: string },
  ): Promise<void> {
    const { prefix, ...rest } = seed;
    await Promise.all(
      Array.from({ length: count }, (_, index) =>
        this.addTransaction({
          ...rest,
          merchant: `${prefix}${String(index + 1).padStart(2, '0')}`,
          // 같은 시각으로 몰리면 순서가 흔들려 어느 줄이 어느 페이지인지 말할 수 없다.
          minutesAgo: (rest.minutesAgo ?? 0) + index,
        }),
      ),
    );
  }

  /** 며칠 전 지출을 심는다. `daysAgo` 가 0 이면 오늘이다. */
  async addExpense(options: {
    amount: number;
    daysAgo: number;
    categoryId?: string;
  }): Promise<void> {
    await this.addTransaction(options);
  }

  /**
   * 전체 예산을 심는다. `month` 를 주면 그 달에, 없으면 이번 달에 심는다.
   *
   * 지난달을 심는 것은 자동 이어쓰기를 화면으로 보기 위해서다. 서버가 끝난 기간의 쓰기를
   * 막으므로 e2e 스택에서만 잠금을 열어 둔다(`support/servers.ts`).
   */
  async setBudget(amount: number, month?: string): Promise<void> {
    const response = await this.context.put(`/api/v1/budgets${monthQuery(month)}`, {
      data: { amount: String(amount) },
    });
    expectOk(response.status(), await response.text(), '예산을 심지 못했다');
  }

  /** 예산을 지운다. 지운 자리(tombstone)가 자동 이어쓰기를 막는다. */
  async deleteBudget(month?: string): Promise<void> {
    const response = await this.context.delete(`/api/v1/budgets${monthQuery(month)}`);
    expectOk(response.status(), await response.text(), '예산을 지우지 못했다');
  }

  /** 카테고리 예산 하나를 심는다. 전체 예산이 먼저 있어야 한다. */
  async setCategoryBudget(categoryId: string, amount: number, month?: string): Promise<void> {
    const response = await this.context.put(
      `/api/v1/budgets/categories/${categoryId}${monthQuery(month)}`,
      { data: { amount: String(amount) } },
    );
    expectOk(response.status(), await response.text(), '카테고리 예산을 심지 못했다');
  }

  async deleteCategoryBudget(categoryId: string, month?: string): Promise<void> {
    const response = await this.context.delete(
      `/api/v1/budgets/categories/${categoryId}${monthQuery(month)}`,
    );
    expectOk(response.status(), await response.text(), '카테고리 예산을 지우지 못했다');
  }

  /** 자동 이어쓰기 설정. 끄면 다음 기간에 예산이 만들어지지 않는다. */
  async setAutoCarryover(enabled: boolean): Promise<void> {
    const response = await this.context.patch('/api/v1/preferences', {
      data: { budget_auto_carryover: enabled },
    });
    expectOk(response.status(), await response.text(), '이어쓰기 설정을 바꾸지 못했다');
  }

  /**
   * 카테고리 하나를 만든다. 만들어진 id 를 돌려준다.
   *
   * 만들기 자체를 확인하는 테스트는 화면으로 한다. 여기는 "이미 여럿 있는 상태" 처럼
   * 배경으로만 필요할 때 쓴다. 스무 개를 화면으로 만들면 그 테스트가 무엇을 보는지 흐려진다.
   */
  async addCategory(name: string, iconKey = '16_paw'): Promise<string> {
    const response = await this.context.post('/api/v1/categories', {
      data: { name, icon_key: iconKey },
    });
    expectOk(response.status(), await response.text(), `카테고리 '${name}' 을 만들지 못했다`);
    const body = (await response.json()) as { id: string };
    return body.id;
  }

  /** 홈 맨 위에 무엇을 보여줄지. 설정 화면을 거치지 않고 그 상태를 만든다. */
  async setHomeHero(hero: 'remaining_budget' | 'income_expense' | 'income_and_budget'): Promise<void> {
    const response = await this.context.patch('/api/v1/preferences', {
      data: { home_hero: hero },
    });
    expectOk(response.status(), await response.text(), '홈 표시 설정을 바꾸지 못했다');
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

/**
 * 가계부 시간대 기준 이번 달. `2026-09` 모양이다.
 *
 * 기기 시간대로 만들면 안 된다. UTC 로 도는 CI 런너에서는 KST 로 이미 다음 달인
 * 시각에 돌린 실행이 전달을 가리킨다.
 */
export function thisMonth(): string {
  return toLedgerDate(new Date()).slice(0, 7);
}

/** 가계부 시간대 기준 지난달. 이어쓰기를 보려면 여기에 예산을 심는다. */
export function lastMonth(): string {
  return shiftMonth(thisMonth(), -1);
}

/** 달을 주면 `?year=&month=`, 없으면 빈 문자열. 서버는 인자가 없으면 오늘이 속한 기간을 쓴다. */
function monthQuery(month?: string): string {
  if (month == null) return '';
  const [year, monthNumber] = month.split('-');
  return `?year=${Number(year)}&month=${Number(monthNumber)}`;
}

/** 그 날 정오(KST). 자정에 가까운 시각을 고르면 시간대 계산에서 하루가 밀린다. */
function dayNoon(day: string): Date {
  return new Date(`${day}T12:00:00+09:00`);
}

/**
 * 심을 시각. **가계부 시간대(Asia/Seoul)** 의 그 날 정오에서 분 단위로 뒤로 센다.
 *
 * 기준을 "지금" 으로 두면 자정 직후에 돌린 실행에서 같은 날에 심으려던 것들이
 * 전날로 흩어진다. 정오를 기준으로 두면 하루 안에서 700분까지 흔들려도 날이 안 바뀐다.
 *
 * 그 정오를 **기기 시간대로** 만들면 안 된다. CI 런너는 UTC 라 KST 로 이미 다음 날인
 * 시각에 돌리면 기준일이 하루 어긋나고, 화면이 보는 '오늘' 에 아무것도 안 심긴다.
 * 실제로 로컬은 초록인데 CI 만 9건 빨개졌다. 그래서 오프셋을 고정해 만든다.
 *
 * KST 는 서머타임이 없어서 24시간을 빼면 날짜가 정확히 하루 물러난다.
 */
function seedTime(daysAgo: number, minutesAgo: number): Date {
  // 화면·서버가 쓰는 것과 같은 시간대 기준의 오늘. LEDGER_TIME_ZONE 이 Asia/Seoul 이다.
  return new Date(
    dayNoon(toLedgerDate(new Date())).getTime() - daysAgo * 86_400_000 - minutesAgo * 60_000,
  );
}

function expectOk(status: number, body: string, what: string): void {
  if (status >= 200 && status < 300) return;
  throw new Error(`${what}. status=${status} body=${body}`);
}
