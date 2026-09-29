import { useId, useRef } from 'react';

export interface BookFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
  /** 칸 아래 작은 설명. 라벨과 따로 읽혀야 칸 이름이 짧게 남는다. */
  hint?: string;
  autoFocus?: boolean;
  /**
   * 처음 누를 때 글자 전체를 고른다. 미리 채운 이름을 지우지 않고 바로 덮어 쓰게 한다.
   * 두 번째부터는 누른 자리에 커서가 선다. 고치려고 누른 사람의 커서를 뺏지 않는다.
   */
  selectOnFirstFocus?: boolean;
}

/** 이름 칸 하나. 만들기·초대·이름 바꾸기가 같은 모양을 쓴다. */
export function BookField({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  hint,
  autoFocus,
  selectOnFirstFocus = false,
}: BookFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const focused = useRef(false);
  // 누르는 손이 떨어질 때 브라우저가 고른 것을 풀어 커서로 바꾼다. 그 한 번만 막는다.
  const keepSelection = useRef(false);

  return (
    <div className="book-field">
      <label className="book-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="book-field__input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => {
          if (!selectOnFirstFocus || focused.current) return;
          focused.current = true;
          keepSelection.current = true;
          event.currentTarget.select();
        }}
        onMouseUp={(event) => {
          if (!keepSelection.current) return;
          keepSelection.current = false;
          event.preventDefault();
        }}
        onBlur={() => {
          keepSelection.current = false;
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        aria-describedby={hint == null ? undefined : hintId}
        // 이름 바꾸기를 누른 사람은 곧바로 적으려는 사람이다. 그 자리에서만 켠다.
        autoFocus={autoFocus}
      />
      {hint != null ? (
        <p id={hintId} className="book-field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
