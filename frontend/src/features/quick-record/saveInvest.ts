/** 기록의 저축·투자에서 쓰는 순수 계산. 금액과 수량은 정수와 BigInt 로만 다룬다. */

import type { QuantityShape } from '../../shared/analytics';
import { parseQuantity, parseWon } from '../asset-dest';

/** 서버와 미리보기의 수익률 문자열(`"20.0"`, `"-15.4"`)을 화면 글자로. 자산 화면과 같은 꼴이다. 0 은 부호 없이 `0%`. */
export function rateText(rate: string): string {
  const negative = rate.startsWith('-');
  const abs = negative ? rate.slice(1) : rate;
  const trimmed = abs.endsWith('.0') ? abs.slice(0, -2) : abs;
  if (/^0(\.0*)?$/.test(trimmed)) return '0%';
  return `${negative ? '−' : '+'}${trimmed}%`;
}

/** 로그에 싣는 수량의 꼴. 값은 싣지 않는다. */
export function quantityShapeOf(quantity: string | null): QuantityShape {
  if (quantity == null) return 'none';
  return quantity.includes('.') ? 'decimal' : 'int';
}

/** 1주(1개)의 평균 넣은 돈(원). 반올림은 0.5 에서 올린다. 보유가 없으면 null. */
export function averageCostOf(
  costBasis: string | number | null | undefined,
  heldQuantity: string | null | undefined,
): number | null {
  const cost = parseWon(costBasis);
  const held = parseQuantity(heldQuantity);
  if (cost == null || held == null || held <= 0n || cost < 0n) return null;
  const scale = parseQuantity('1') ?? 1n;
  return Number((2n * cost * scale + held) / (2n * held));
}

/** 키패드로 친 수량이 보유 수량과 같은가. 「전부」 를 누른 뒤 그대로 저장했는지 가른다. */
export function sameQuantity(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = parseQuantity(a);
  return left != null && left === parseQuantity(b);
}
