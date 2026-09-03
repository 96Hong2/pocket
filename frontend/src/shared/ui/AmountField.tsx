import { cx } from '../lib/cx';
import { formatNumber } from '../lib/format';

/** default 48px 입력칸 · compact 40px. 좁은 시트에서 다른 입력칸과 높이를 맞출 때 compact 를 쓴다. */
export type AmountFieldVariant = 'default' | 'compact';

export interface AmountFieldProps {
  /** 숫자만 담긴 문자열. 빈 문자열이면 아직 안 적은 상태다. */
  value: string;
  /** 걸러낸 숫자 문자열이 그대로 온다. 화면이 다시 거르지 않는다. */
  onChange: (digits: string) => void;
  label: string;
  variant?: AmountFieldVariant;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * 금액 입력칸. 원 단위 정수만 받고 세 자리마다 콤마를 찍는다.
 *
 * 예산 입력과 기록 수정이 같은 것을 각자 만들어, 한쪽에만 콤마가 찍히고
 * 거르는 규칙도 서로 달랐다. 금액을 받는 자리는 전부 이걸 쓴다.
 *
 * 라벨이 입력칸을 감싸므로 라벨을 눌러도 포커스가 들어간다. id 를 따로 잇지 않는다.
 */
export function AmountField({
  value,
  onChange,
  label,
  variant = 'default',
  placeholder = '0',
  disabled = false,
  className,
}: AmountFieldProps) {
  const amount = Number(value);
  const text = value === '' || !Number.isFinite(amount) ? '' : formatNumber(amount);

  return (
    <label
      className={cx(
        'pk-amount-field',
        variant === 'compact' && 'pk-amount-field--compact',
        className,
      )}
    >
      <span className="pk-amount-field__label">{label}</span>
      <span className="pk-amount-field__box">
        <input
          className="pk-amount-field__input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          disabled={disabled}
          value={text}
          onChange={(event) => onChange(toDigits(event.target.value))}
        />
        <span className="pk-amount-field__unit">원</span>
      </span>
    </label>
  );
}

/** 서버도 1원 이상 원 단위 정수만 받는다. 앞자리 0 과 자릿수 넘침을 여기서 끊는다. */
function toDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 12).replace(/^0+/, '');
}
