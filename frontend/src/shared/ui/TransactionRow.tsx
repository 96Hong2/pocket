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
  /** 직접 건 이모지·사진. 있으면 icon 대신 그려진다. */
  custom?: string | null;
  /**
   * 분류 동그라미의 바탕색(`category.color`).
   *
   * 🔴 **한동안 여기만 빠져 있었다**(2026-09-25 사용자 신고). 부르는 쪽은 전부
   * `{...iconOf(category)}` 를 펴서 색까지 넘기고 있었는데, 이 칸이 없어 타입도 아무
   * 말을 안 하고 값만 조용히 버려졌다. 고른 색이 만들기 화면에서는 보이고 달력·사용
   * 내역에서는 기본 바탕으로 나온 이유가 이것이다.
   */
  color?: string | null;
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
  /**
   * 금액만 따로 누를 때. `onClick` 과 같이 주면 줄이 왼쪽·오른쪽 두 버튼으로 갈린다.
   *
   * 저장 직후 화면이 이걸 쓴다. 「금액 바꾸기」·「카테고리 바꾸기」 버튼 두 개를 따로
   * 세우는 대신 고칠 것을 직접 누르게 하려는 것인데, 그렇다고 여기 말고 다른 데서
   * 줄을 새로 그리면 안 된다. 분류 그림을 손으로 옮겨 그리다 저장 확인 줄만 기본
   * 아이콘으로 나온 적이 있다. 줄을 그리는 곳은 이 컴포넌트 하나로 둔다.
   */
  onAmountClick?: () => void;
  /**
   * 갈라 놓았을 때 두 버튼이 읽히는 이름.
   *
   * 안 주면 줄에 적힌 글이 그대로 이름이 된다. 「식비」·「4,000원」 만 읽히면 눌러서
   * 무엇을 하는 자리인지 알 수 없으니, 갈랐으면 함께 준다.
   */
  clickLabel?: string;
  amountClickLabel?: string;
  className?: string;
}

export function TransactionRow({
  icon,
  custom,
  color,
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
  onAmountClick,
  clickLabel,
  amountClickLabel,
  className,
}: TransactionRowProps) {
  const head = (
    <>
      <CategoryAvatar icon={icon} custom={custom} color={color} size={avatarSize} />
      <div className="pk-tx__body">
        <div className="pk-tx__title">{title}</div>
        {subtitle ? <div className="pk-tx__subtitle">{subtitle}</div> : null}
        {chips ? <div className="pk-tx__chips">{chips}</div> : null}
      </div>
    </>
  );
  const tail = trailing ?? (
    <Amount className="pk-tx__amount" value={amount} tone={tone} excluded={excluded} />
  );
  const content = (
    <>
      {head}
      {tail}
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

  // 버튼 안에 버튼을 넣을 수 없어, 둘 다 누를 수 있으면 줄을 감싸고 좌우를 따로 세운다.
  if (onClick && onAmountClick) {
    return (
      <div className={cx(classes, 'pk-tx--split')}>
        <button
          type="button"
          className="pk-tx__hit pk-tx__hit--head"
          aria-label={clickLabel}
          onClick={onClick}
        >
          {head}
        </button>
        <button
          type="button"
          className="pk-tx__hit pk-tx__hit--tail"
          aria-label={amountClickLabel}
          onClick={onAmountClick}
        >
          {tail}
        </button>
      </div>
    );
  }

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={classes}>{content}</div>;
}
