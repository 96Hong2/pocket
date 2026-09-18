import { useId } from 'react';

import { cx } from '../lib/cx';

/**
 * 날짜를 고르는 칸.
 *
 * **안 골라도 되는 칸에는 지우는 길이 있어야 한다.** 달력을 한 번 열면 「재설정」 을
 * 눌러도 칸에 값이 남는 기기가 있고(iOS), 그러면 「선택」 이라고 적힌 칸을 비울 방법이
 * 사라진다. 실기기에서 기한을 지우려다 못 지운 자리가 있었다.
 *
 * 그래서 비울 수 있는 칸에는 ✕ 를 우리 손으로 단다. 브라우저가 그리는 달력 UI 는
 * 기기마다 다르지만 이 버튼은 우리 화면이라 어디서나 같다.
 *
 * `clearable` 이 아니면 평범한 날짜 칸이다. 필수 칸에 ✕ 를 달면 비워 놓고 저장을 눌러
 * 왜 안 되는지 모르는 자리가 생긴다.
 */
export interface DateFieldProps {
  /** 칸 위에 서는 이름. 「(선택)」 같은 꼬리표도 부르는 쪽이 붙인다. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  /** 비울 수 있는 칸인가. 참이면 값이 있을 때 ✕ 가 선다. */
  clearable?: boolean;
  /** ✕ 의 읽어 주는 이름. 「기한 지우기」 처럼 무엇을 지우는지 적는다. */
  clearLabel?: string;
  /** 칸 아래 한 줄. 없으면 안 그린다. */
  hint?: string;
  className?: string;
  inputClassName?: string;
}

export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  disabled = false,
  clearable = false,
  clearLabel = '날짜 지우기',
  hint,
  className,
  inputClassName,
}: DateFieldProps) {
  const inputId = useId();
  const showClear = clearable && value !== '';

  return (
    <div className={cx('pk-datefield', className)}>
      <label className="pk-datefield__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="pk-datefield__row">
        <input
          id={inputId}
          className={cx('pk-date', 'pk-datefield__input', inputClassName)}
          type="date"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        {showClear ? (
          <button
            type="button"
            className="pk-datefield__clear"
            aria-label={clearLabel}
            disabled={disabled}
            onClick={() => onChange('')}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
      </div>
      {hint ? <span className="pk-datefield__hint">{hint}</span> : null}
    </div>
  );
}
