import { useLayoutEffect, useRef, type ChangeEvent } from 'react';

import { cx } from '../lib/cx';

import { editAmount, formatAmountInput } from './amountEdit';

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
 * 콤마를 찍은 문자열을 다시 그리면 브라우저가 커서를 맨 끝으로 옮긴다. 편집이 끝난 자리를
 * `editAmount` 가 계산하고, 그린 뒤에 그 자리로 되돌린다.
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
  const inputRef = useRef<HTMLInputElement>(null);
  // 이번 편집이 만든 커서 자리. 어느 값에 대한 자리인지 함께 들고 있어야
  // 시트가 값을 통째로 갈아 끼웠을 때 남은 자리를 잘못 되돌리지 않는다.
  const pending = useRef<{ digits: string; caret: number } | null>(null);
  const text = formatAmountInput(value);

  useLayoutEffect(() => {
    const next = pending.current;
    pending.current = null;
    if (next == null || next.digits !== value) return;
    inputRef.current?.setSelectionRange(next.caret, next.caret);
  });

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const input = event.target;
    const edit = editAmount({
      previous: text,
      next: input.value,
      caret: input.selectionStart ?? input.value.length,
    });

    pending.current = { digits: edit.digits, caret: edit.caret };
    onChange(edit.digits);
  }

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
          ref={inputRef}
          className="pk-amount-field__input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          disabled={disabled}
          value={text}
          onChange={handleChange}
        />
        <span className="pk-amount-field__unit">원</span>
      </span>
    </label>
  );
}
