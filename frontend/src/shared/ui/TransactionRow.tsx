import type { ReactNode } from 'react';

import { cx } from '../lib/cx';
import { Amount, type AmountTone } from './Amount';
import { CategoryAvatar } from './CategoryAvatar';
import type { IconName } from './icons';

/**
 * 거래 한 줄. 홈·달력·예산·통계·캡처 확인이 전부 이 컴포넌트를 쓴다.
 * 화면마다 다른 건 아바타 크기와 줄 간격뿐이다.
 */
export interface TransactionRowProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  /** 양수로 넘긴다. */
  amount: number;
  tone?: AmountTone;
  /** 예산 계산에서 빠진 거래. 줄 전체가 흐려지고 금액이 muted 가 된다. */
  excluded?: boolean;
  /** 지름(px). 홈 54 / 달력·예산 48 / 통계 44 / 캡처 50 / 수정 58. */
  avatarSize?: number;
  /** 홈처럼 줄이 촘촘한 목록은 compact(11px). 기본은 13px. */
  density?: 'default' | 'compact';
  /** 목록 마지막 줄에서 구분선을 지운다. */
  hideDivider?: boolean;
  /** 제목 아래 칩. 제외됨·종류 칩을 넣는다. */
  chips?: ReactNode;
  /** 금액 자리에 다른 걸 그려야 할 때만 쓴다. */
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function TransactionRow({
  icon,
  title,
  subtitle,
  amount,
  tone = 'expense',
  excluded = false,
  avatarSize = 48,
  density = 'default',
  hideDivider = false,
  chips,
  trailing,
  onClick,
  className,
}: TransactionRowProps) {
  const content = (
    <>
      <CategoryAvatar icon={icon} size={avatarSize} />
      <div className="pk-tx__body">
        <div className="pk-tx__title">{title}</div>
        {subtitle ? <div className="pk-tx__subtitle">{subtitle}</div> : null}
        {chips ? <div className="pk-tx__chips">{chips}</div> : null}
      </div>
      {trailing ?? (
        <Amount
          className="pk-tx__amount"
          value={amount}
          tone={tone}
          excluded={excluded}
        />
      )}
    </>
  );

  const classes = cx(
    'pk-tx',
    density === 'compact' && 'pk-tx--compact',
    hideDivider && 'pk-tx--no-divider',
    excluded && 'pk-tx--excluded',
    onClick && 'pk-tx--pressable',
    className,
  );

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={classes}>{content}</div>;
}
