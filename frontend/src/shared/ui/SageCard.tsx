import type { HTMLAttributes } from 'react';

import { cx } from '../lib/cx';

/** 세이지 배경 카드. 그림자가 없어 흰 카드와 위계가 갈린다. */
export function SageCard({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('pk-sage-card', className)} {...rest}>
      {children}
    </div>
  );
}
