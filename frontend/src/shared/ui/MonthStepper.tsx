import { cx } from '../lib/cx';
import { formatMonthLabel, shiftMonth } from '../lib/format';

/** 월을 옮기는 UI 는 이것 하나만 쓴다. 화면별로 다른 건 variant 로 흡수한다. */
export type MonthStepperVariant = 'default' | 'compact';

export interface MonthStepperProps {
  /** `2026-09` */
  value: string;
  onChange: (month: string) => void;
  /** 이보다 이전으로 못 간다. `2026-01` 형식. */
  minMonth?: string;
  /** 이보다 이후로 못 간다. 보통 이번 달을 넣는다. */
  maxMonth?: string;
  /**
   * 한 번에 돌아올 달. 지금 보는 달이 이것과 다를 때만 알약이 뜬다.
   *
   * 화살표로만 되짚으면 반년 전 리포트를 보고 온 사람은 여섯 번을 눌러야 한다.
   * 안 주면 알약이 아예 없다.
   */
  jumpTo?: string;
  /** 알약에 적을 말. 「이번 달로」 처럼 어디로 가는지가 보여야 한다. */
  jumpLabel?: string;
  variant?: MonthStepperVariant;
  className?: string;
}

export function MonthStepper({
  value,
  onChange,
  minMonth,
  maxMonth,
  jumpTo,
  jumpLabel = '이번 달로',
  variant = 'default',
  className,
}: MonthStepperProps) {
  const previous = shiftMonth(value, -1);
  const next = shiftMonth(value, 1);
  const previousDisabled = minMonth !== undefined && previous < minMonth;
  const nextDisabled = maxMonth !== undefined && next > maxMonth;
  const label = formatMonthLabel(value);

  return (
    <div
      className={cx(
        'pk-month',
        variant === 'compact' && 'pk-month--compact',
        className,
      )}
    >
      <button
        type="button"
        className="pk-month__nav"
        onClick={() => onChange(previous)}
        disabled={previousDisabled}
        aria-label={`${formatMonthLabel(previous)}로 이동`}
      >
        <Chevron direction="left" />
      </button>
      <div className="pk-month__label" aria-live="polite">
        {label}
      </div>
      <button
        type="button"
        className="pk-month__nav"
        onClick={() => onChange(next)}
        disabled={nextDisabled}
        aria-label={`${formatMonthLabel(next)}로 이동`}
      >
        <Chevron direction="right" />
      </button>
      {jumpTo !== undefined && jumpTo !== value ? (
        <button type="button" className="pk-month__jump" onClick={() => onChange(jumpTo)}>
          {jumpLabel}
        </button>
      ) : null}
    </div>
  );
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M11 4L6 9l5 5' : 'M7 4l5 5-5 5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
