import type { HTMLAttributes } from 'react';

import { cx } from '../lib/cx';

/**
 * excluded 예산에서 빠진 거래 / kind 거래 종류 / caution 주의 /
 * sage 강조 / coach 코치 한마디.
 */
export type ChipVariant = 'excluded' | 'kind' | 'caution' | 'sage' | 'coach';

const VARIANT_CLASS: Record<ChipVariant, string> = {
  excluded: 'pk-chip--excluded',
  kind: 'pk-chip--kind',
  caution: 'pk-chip--caution',
  sage: 'pk-chip--sage',
  coach: 'pk-chip--coach',
};

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
}

export function Chip({
  variant = 'kind',
  className,
  children,
  ...rest
}: ChipProps) {
  return (
    <span
      className={cx('pk-chip', VARIANT_CLASS[variant], className)}
      {...rest}
    >
      {children}
    </span>
  );
}
