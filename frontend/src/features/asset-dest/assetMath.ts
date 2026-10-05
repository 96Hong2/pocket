import type { AssetItemOut } from '../../shared/api';
import { holdingOf, QUANTITY_DECIMALS } from '../assets';

/**
 * 팔 때 수익 미리보기. 서버 `asset_ledger._sell`, `_portion`, `rate_percent` 와 같은 정수 계산이다.
 *
 * 금액은 원 단위 정수, 수량은 1e8 을 곱한 정수로 바꿔 BigInt 로만 센다.
 * 판 몫의 넣은 돈과 수익률만 반올림하고(ROUND_HALF_UP, 0 에서 먼 쪽), 전부 팔면 남은 넣은 돈을 그대로 뺀다.
 */

const SCALE = 10n ** BigInt(QUANTITY_DECIMALS);
const QUANTITY_PATTERN = /^(\d*)(?:\.(\d*))?$/;
const WON_PATTERN = /^(-?\d+)(?:\.0*)?$/;

/** `"0.003"` → `300000n`(1e8 배). 숫자가 아니거나 소수가 8자리를 넘으면 null. */
export function parseQuantity(raw: string | null | undefined): bigint | null {
  if (raw == null) return null;
  const match = QUANTITY_PATTERN.exec(raw.trim());
  if (match == null) return null;
  const whole = match[1] ?? '';
  const fraction = match[2] ?? '';
  if (whole === '' && fraction === '') return null;
  if (fraction.length > QUANTITY_DECIMALS) return null;
  return (
    BigInt(whole === '' ? '0' : whole) * SCALE + BigInt(fraction.padEnd(QUANTITY_DECIMALS, '0'))
  );
}

/** 1e8 배 정수를 뒤 0 없는 수량 문자열로. `300000n` → `"0.003"`. */
export function formatScaledQuantity(scaled: bigint): string {
  const whole = scaled / SCALE;
  const fraction = (scaled % SCALE).toString().padStart(QUANTITY_DECIMALS, '0').replace(/0+$/, '');
  return fraction === '' ? whole.toString() : `${whole}.${fraction}`;
}

/** 저장 본문에 실을 수량. 비었거나 0 이면 null, 아니면 뒤 0 과 끝 점을 뗀 문자열. */
export function quantityValue(raw: string | null | undefined): string | null {
  const scaled = parseQuantity(raw);
  return scaled == null || scaled <= 0n ? null : formatScaledQuantity(scaled);
}

/** 원 단위 금액. 서버 문자열(`"500000"`, `"500000.00"`)과 정수 숫자를 받는다. 못 읽으면 null. */
export function parseWon(value: string | number | null | undefined): bigint | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isSafeInteger(value) ? BigInt(value) : null;
  const match = WON_PATTERN.exec(value.trim());
  return match == null ? null : BigInt(match[1] ?? '0');
}

/** 나누고 반올림(ROUND_HALF_UP). 음수는 0 에서 먼 쪽으로 올린다(파이썬 Decimal 과 같다). */
function divHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  let quotient = abs / denominator;
  if ((abs % denominator) * 2n >= denominator) quotient += 1n;
  return negative ? -quotient : quotient;
}

/** 수익률(%) 문자열, 소수 첫째 자리. 서버 `rate_percent` 와 같은 모양(`"20.0"`, `"-15.4"`). 기준이 0 이하면 null. */
export function ratePercent(gain: bigint, base: bigint): string | null {
  if (base <= 0n) return null;
  const tenths = divHalfUp(gain * 1000n, base);
  const abs = tenths < 0n ? -tenths : tenths;
  return `${tenths < 0n ? '-' : ''}${abs / 10n}.${abs % 10n}`;
}

export type SellInput =
  | {
      holding: 'quantity';
      /** 지금 보유 수량. */
      heldQuantity: string;
      /** 남은 넣은 돈(원). */
      costBasis: number | string;
      soldQuantity: string;
      /** 받은 돈(원). */
      received: number | string;
    }
  | {
      holding: 'amount';
      /** 금액 종목의 지금 금액(원). */
      currentAmount: number | string;
      /** 넣은 돈(원). 모르면 null. */
      costBasis: number | string | null;
      received: number | string;
      /** 팔고 남은 금액(원). 0 이면 전부. null 이면 옛 규칙(받은 돈 ÷ 지금 금액). */
      remaining: number | string | null;
      /** 넣은 돈을 모를 때 적은 이 항목에 넣은 돈 전체(원). 비우면 null. */
      totalCost?: number | string | null;
    };

/** 미리보기를 못 세우는 까닭. `over_sell` 이면 「저장」 을 끈다. */
export type SellBlock = 'no_quantity' | 'no_amount' | 'over_sell';

export interface SellPreview {
  /** 판 몫의 넣은 돈(원). 넣은 돈을 모르면 null. */
  soldCost: number | null;
  /** 실현 수익(원) = 받은 돈 − 판 몫의 넣은 돈. 넣은 돈을 모르면 null. */
  gain: number | null;
  /** 실현 수익률(%) 문자열. 판 몫의 넣은 돈이 0 이면 null. */
  rate: string | null;
  /** 보유를 전부 팔았나(금액 종목은 지금 금액을 전부 뺐나). */
  all: boolean;
  /** 판 뒤 보유 수량. 금액 종목은 null. */
  remainingQuantity: string | null;
  /** 판 뒤 넣은 돈(원). 넣은 돈을 모르면 null. */
  remainingCost: number | null;
  /** 금액 종목의 판 뒤 지금 금액(원). 수량 종목은 null. */
  remainingAmount: number | null;
}

export type SellCheck = { ok: true; preview: SellPreview } | { ok: false; reason: SellBlock };

export function previewSell(input: SellInput): SellCheck {
  const received = parseWon(input.received) ?? 0n;

  if (input.holding === 'quantity') {
    const cost = parseWon(input.costBasis) ?? 0n;
    const held = parseQuantity(input.heldQuantity) ?? 0n;
    const sold = parseQuantity(input.soldQuantity);
    if (sold == null || sold <= 0n) return { ok: false, reason: 'no_quantity' };
    if (sold > held) return { ok: false, reason: 'over_sell' };
    if (received <= 0n) return { ok: false, reason: 'no_amount' };
    const all = sold === held;
    const soldCost = all ? cost : divHalfUp(cost * sold, held);
    return {
      ok: true,
      preview: {
        soldCost: Number(soldCost),
        gain: Number(received - soldCost),
        rate: ratePercent(received - soldCost, soldCost),
        all,
        remainingQuantity: formatScaledQuantity(held - sold),
        remainingCost: Number(cost - soldCost),
        remainingAmount: null,
      },
    };
  }

  const current = parseWon(input.currentAmount) ?? 0n;
  // 넣은 돈을 모르면 이 기록에 적은 넣은 돈 전체를 쓴다. 그것도 없으면 수익을 세지 않는다.
  const cost = parseWon(input.costBasis) ?? parseWon(input.totalCost ?? null);
  if (received <= 0n) return { ok: false, reason: 'no_amount' };
  const rest = parseWon(input.remaining);
  let whole: bigint;
  let left: bigint;
  if (rest == null) {
    if (received > current) return { ok: false, reason: 'over_sell' };
    whole = current;
    left = current - received;
  } else {
    // 판 몫 = 받은 돈 ÷ (받은 돈 + 남은 금액). 받은 돈이 지금 금액보다 커도 된다.
    whole = received + rest;
    left = rest;
  }
  const all = left === 0n;
  const soldCost =
    cost == null ? null : received === whole ? cost : divHalfUp(cost * received, whole);
  return {
    ok: true,
    preview: {
      soldCost: soldCost == null ? null : Number(soldCost),
      gain: soldCost == null ? null : Number(received - soldCost),
      rate: soldCost == null ? null : ratePercent(received - soldCost, soldCost),
      all,
      remainingQuantity: null,
      remainingCost: cost == null || soldCost == null ? null : Number(cost - soldCost),
      remainingAmount: Number(left),
    },
  };
}

/** 금액으로 파는 화면의 「남은 금액」 처음 값. 지금 금액 − 받은 돈, 0 아래면 0. */
export function defaultRemaining(
  currentAmount: number | string,
  received: number | string,
): number {
  const current = parseWon(currentAmount) ?? 0n;
  const got = parseWon(received) ?? 0n;
  return current > got ? Number(current - got) : 0;
}

export type ValuationInput =
  | {
      holding: 'quantity';
      quantity: string;
      costBasis: number | string;
      unitPrice: number | string;
    }
  | { holding: 'amount'; currentAmount: number | string; costBasis: number | string };

export interface Valuation {
  /** 지금 가치(원). 수량 종목은 수량 × 지금 1주 가격을 원 단위로 반올림. */
  value: number;
  gain: number;
  /** 평가 수익률(%) 문자열. 넣은 돈이 0 이면 null. */
  rate: string | null;
}

/** 평가 수익률. 서버 `item_value`, `item_rate` 의 평가 쪽과 같다. */
export function previewValuation(input: ValuationInput): Valuation {
  const cost = parseWon(input.costBasis) ?? 0n;
  let value: bigint;
  if (input.holding === 'quantity') {
    const quantity = parseQuantity(input.quantity) ?? 0n;
    value = divHalfUp(quantity * (parseWon(input.unitPrice) ?? 0n), SCALE);
  } else {
    value = parseWon(input.currentAmount) ?? 0n;
  }
  return {
    value: Number(value),
    gain: Number(value - cost),
    rate: ratePercent(value - cost, cost),
  };
}

/** 금액으로 파는 화면의 칸. 남은 금액(0 이면 전부)과, 넣은 돈을 모를 때 적은 넣은 돈 전체. */
export interface AmountSellFields {
  remaining: number | string | null;
  totalCost?: number | string | null;
}

/**
 * 「어디에」 로 고른 항목에서 바로 미리보기. 팔 수 없는 항목(통장, 부채)이면 null.
 * 금액 종목의 지금 금액은 `amount` 다. 넣은 돈(`cost_basis`)이 null 이면 모르는 것이다.
 */
export function sellPreviewOf(
  item: AssetItemOut,
  soldQuantity: string,
  received: number | string,
  fields: AmountSellFields = { remaining: null },
): SellCheck | null {
  const holding = holdingOf(item.group, item.kind);
  if (holding === 'quantity') {
    return previewSell({
      holding,
      heldQuantity: item.quantity ?? '0',
      costBasis: item.cost_basis ?? item.amount,
      soldQuantity,
      received,
    });
  }
  if (holding === 'amount') {
    return previewSell({
      holding,
      currentAmount: item.amount,
      costBasis: item.cost_basis ?? null,
      received,
      remaining: fields.remaining,
      totalCost: fields.totalCost ?? null,
    });
  }
  return null;
}
