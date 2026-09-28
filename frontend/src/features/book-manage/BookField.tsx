import { useId } from 'react';

export interface BookFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
  /** 칸 아래 작은 설명. 라벨과 따로 읽혀야 칸 이름이 짧게 남는다. */
  hint?: string;
  autoFocus?: boolean;
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
}: BookFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;

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
