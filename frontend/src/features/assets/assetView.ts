import { parseDecimalOr } from '../../shared/api';
import type { AssetGroup, AssetHistoryPointOut, AssetItemOut, InvestKind } from '../../shared/api';
import { formatCurrency, formatNumber, shiftMonth } from '../../shared/lib/format';

/** 투자 종류 칩 차례와 이름. */
export const INVEST_KINDS: readonly InvestKind[] = [
  'stock',
  'etf',
  'fund',
  'coin',
  'bond',
  'other',
];

export const INVEST_KIND_LABEL: Record<InvestKind, string> = {
  stock: '주식',
  etf: 'ETF',
  fund: '펀드',
  coin: '코인',
  bond: '채권',
  other: '기타',
};

const UNIT: Record<InvestKind, string> = {
  stock: '주',
  etf: '주',
  fund: '좌',
  coin: '개',
  bond: '매',
  other: '개',
};

/** 수량으로 적는 종류. 나머지 투자는 금액으로 적는다. 서버 `QUANTITY_KINDS` 와 같다. */
const QUANTITY_KINDS: ReadonlySet<InvestKind> = new Set(['stock', 'etf', 'coin']);

/** 수량은 소수 8자리까지 받는다(서버와 같은 한도). */
export const QUANTITY_DECIMALS = 8;

/**
 * 항목이 값을 어떻게 갖나. 서버 `holding_of` 와 같은 규칙이다.
 * 종류 없는 투자 항목(캡처로 금액만 들어온 것)은 넣은 돈을 모르는 금액 종목이다.
 */
export type Holding = 'quantity' | 'amount' | 'balance' | 'debt';

export function holdingOf(group: AssetGroup, kind: InvestKind | null | undefined): Holding {
  if (group === 'debt') return 'debt';
  if (group === 'investment') {
    return kind != null && QUANTITY_KINDS.has(kind) ? 'quantity' : 'amount';
  }
  return 'balance';
}

export function unitOf(kind: InvestKind | null | undefined): string {
  return kind == null ? '개' : UNIT[kind];
}

/** `1234.5` → `1,234.5`. 서버가 뒤 0 을 떼어 보내므로 소수부는 그대로 둔다. */
export function formatQuantity(raw: string | null | undefined): string {
  if (raw == null || raw === '') return '0';
  const [intPart, fraction] = raw.split('.');
  const whole = formatNumber(Number(intPart));
  return fraction ? `${whole}.${fraction}` : whole;
}

/**
 * 수량 칸에 친 글자를 거른다. 숫자와 소수점 하나만, 소수는 `QUANTITY_DECIMALS` 자리까지.
 * 앞의 0 은 하나만 남긴다(`007` → `7`, `0.5` 는 그대로).
 */
export function sanitizeQuantityInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const dot = cleaned.indexOf('.');
  let intPart = dot === -1 ? cleaned : cleaned.slice(0, dot);
  const fraction =
    dot === -1
      ? null
      : cleaned
          .slice(dot + 1)
          .replace(/\./g, '')
          .slice(0, QUANTITY_DECIMALS);
  intPart = intPart.replace(/^0+(?=\d)/, '');
  if (fraction == null) return intPart;
  return `${intPart === '' ? '0' : intPart}.${fraction}`;
}

/** 수익률 % 표기. `20` → `+20%`, `-3.25` → `−3.3%`. 소수 첫째 자리까지, `.0` 은 뗀다. 0 은 부호 없이 `0%`. */
export function formatRate(rate: number): string {
  const rounded = Math.round(Math.abs(rate) * 10) / 10;
  if (rounded === 0) return '0%';
  return `${rate >= 0 ? '+' : '−'}${rounded}%`;
}

/** 부호 붙은 금액. 와이어프레임처럼 빼기는 `−` 로 적는다. */
export function formatSignedWon(value: number): string {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? '+' : '−'}${formatCurrency(Math.abs(rounded))}`;
}

export interface RateChip {
  text: string;
  tone: 'up' | 'down' | 'soft';
}

/** 항목 줄 오른쪽 아래 칩. 수익률이 있으면 그것, 수량 종목인데 1주 가격이 없으면 「현재가 없음」. */
export function rateChipOf(item: AssetItemOut): RateChip | null {
  if (item.rate != null && item.rate !== '') {
    const rate = parseDecimalOr(item.rate, 0);
    const text = `${formatRate(rate)}${item.rate_kind === 'realized' ? ' 실현' : ''}`;
    return { text, tone: rate >= 0 ? 'up' : 'down' };
  }
  if (holdingOf(item.group, item.kind) === 'quantity' && item.unit_price == null) {
    return { text: '현재가 없음', tone: 'soft' };
  }
  return null;
}

/**
 * 이름 아래 한 줄. 수량 종목은 「2주 보유, 넣은 돈 500,000원」, 금액 종목은 「넣은 돈 …」.
 * 넣은 돈을 모르면 넣은 돈을 적지 않는다. 다 팔아 남은 것이 없으면 「보유 없음」.
 */
export function itemMetaOf(item: AssetItemOut): string | null {
  const holding = holdingOf(item.group, item.kind);
  const cost = parseDecimalOr(item.cost_basis, 0);
  if (holding === 'quantity') {
    const qty = parseDecimalOr(item.quantity, 0);
    const held =
      qty > 0 ? `${formatQuantity(item.quantity)}${unitOf(item.kind)} 보유` : '보유 없음';
    return cost > 0 ? `${held}, 넣은 돈 ${formatCurrency(cost)}` : held;
  }
  if (holding === 'amount') {
    if (parseDecimalOr(item.amount, 0) <= 0) return '보유 없음';
    if (item.cost_basis != null) return `넣은 돈 ${formatCurrency(cost)}`;
  }
  return null;
}

/** 줄에 적을 지금 가치. 서버가 센 `value` 가 있으면 그것, 없으면 `amount`. */
export function itemValueOf(item: AssetItemOut): number {
  return parseDecimalOr(item.value ?? item.amount, 0);
}

/** 매달 칩. 매달 넣는 돈이 0 보다 크면 매달 넣는 항목이다. 서버 이름 맞추기와 분석도 같은 기준이다. */
export function isMonthly(item: AssetItemOut): boolean {
  return parseDecimalOr(item.monthly_amount, 0) > 0;
}

/** 추이 점의 순자산 숫자들. 오래된 달부터. */
export function trendValues(points: readonly AssetHistoryPointOut[]): number[] {
  return points.map((point) => parseDecimalOr(point.net_worth, 0));
}

/**
 * 지난달보다 얼마 늘었나. 마지막 점(이번 달)과 바로 앞 달 점을 견준다.
 * 앞 달 점이 없으면(이번 달에 처음 적었으면) null.
 */
export function monthOverMonth(points: readonly AssetHistoryPointOut[]): number | null {
  const last = points.at(-1);
  if (last == null) return null;
  const previous = points.find((point) => point.month === shiftMonth(last.month, -1));
  if (previous == null) return null;
  return parseDecimalOr(last.net_worth, 0) - parseDecimalOr(previous.net_worth, 0);
}

/** 큰 그래프 아래 달 이름. 마지막 점은 「지금」. `2026-09` → `9월`. */
export function pointLabel(month: string, isLast: boolean): string {
  if (isLast) return '지금';
  return `${Number(month.slice(5, 7))}월`;
}
