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
  variant?: MonthStepperVariant;
  className?: string;
}

export function MonthStepper({
  value,
  onChange,
  minMonth,
  maxMonth,
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
