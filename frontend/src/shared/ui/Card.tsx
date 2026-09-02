import type { HTMLAttributes } from 'react';

import { cx } from '../lib/cx';

/**
 * md 16 / lg 18 / header 14·16 / list 4·16.
 * list 는 안쪽에 TransactionRow 를 세로로 쌓을 때 쓴다.
 */
export type CardPadding = 'md' | 'lg' | 'header' | 'list' | 'none';

const PADDING_CLASS: Record<CardPadding, string | false> = {
  md: 'pk-card--md',
  lg: 'pk-card--lg',
  header: 'pk-card--header',
  list: 'pk-card--list',
  none: false,
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

export function Card({
  padding = 'md',
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div className={cx('pk-card', PADDING_CLASS[padding], className)} {...rest}>
      {children}
    </div>
  );
}
