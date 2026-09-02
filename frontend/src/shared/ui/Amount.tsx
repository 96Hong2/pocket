import type { HTMLAttributes } from 'react';

import { cx } from '../lib/cx';
import { formatCurrency, formatSignedCurrency } from '../lib/format';

/**
 * 금액 표시는 전부 여기를 지난다.
 * 금액 자체는 항상 양수로 저장하므로 부호와 색은 거래 종류가 정한다.
 */
export type AmountTone =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'refund'
  | 'neutral';

export interface AmountProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** 양수로 넘긴다. */
  value: number;
  tone?: AmountTone;
  /** 예산 계산에서 빠진 거래. 색이 muted 로 눌린다. */
  excluded?: boolean;
  /** px. 기본 15. */
  size?: number;
  weight?: 500 | 600 | 700 | 800;
}

/** 수입만 `+` 를 붙인다. 나머지는 부호 없이 적는다. */
function toneClass(tone: AmountTone, excluded: boolean): string {
  if (excluded || tone === 'transfer' || tone === 'refund') {
    return 'pk-amount--muted';
  }
  if (tone === 'income') return 'pk-amount--income';
  return 'pk-amount--ink';
}

export function Amount({
  value,
  tone = 'neutral',
  excluded = false,
  size = 15,
  weight = 700,
  className,
  style,
  ...rest
}: AmountProps) {
  const text =
    tone === 'income' ? formatSignedCurrency(Math.abs(value)) : formatCurrency(value);

  return (
    <span
      data-numeric=""
      className={cx('pk-amount', toneClass(tone, excluded), className)}
      style={{ fontSize: `${size}px`, fontWeight: weight, ...style }}
      {...rest}
    >
      {text}
    </span>
  );
}
