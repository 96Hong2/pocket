import { cx } from '../lib/cx';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** 옆에 보이는 글이 없을 때 무엇을 켜고 끄는지 적어 준다. */
  ariaLabel?: string;
  /** 옆에 라벨 요소가 있으면 그 id 를 넘긴다. */
  ariaLabelledBy?: string;
  disabled?: boolean;
  className?: string;
}

/** 보이는 크기는 50×30 이지만 손이 닿는 영역은 위아래로 넓혀 44px 이다. */
export function Toggle({
  checked,
  onChange,
  ariaLabel,
  ariaLabelledBy,
  disabled = false,
  className,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      disabled={disabled}
      className={cx('pk-toggle', className)}
      onClick={() => onChange(!checked)}
    >
      <span className="pk-toggle__knob" />
    </button>
  );
}
