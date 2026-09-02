import { cx } from '../lib/cx';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 화면에 라벨이 없으면 무엇을 고르는 것인지 적어 준다. */
  ariaLabel: string;
  className?: string;
}

/** 기록 시트의 입력 방식 전환처럼 2~3개 중 하나를 고르는 자리. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  function moveBy(step: number) {
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + step + options.length) % options.length];
    if (next && !next.disabled) onChange(next.value);
  }

  return (
    <div
      className={cx('pk-segmented', className)}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          disabled={option.disabled}
          className="pk-segmented__item"
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              event.preventDefault();
              moveBy(1);
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              event.preventDefault();
              moveBy(-1);
            }
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
