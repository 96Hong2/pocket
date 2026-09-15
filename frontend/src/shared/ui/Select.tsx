import { useId, type ReactNode } from 'react';

import { cx } from '../lib/cx';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string> {
  /** 칸 위에 붙는 이름. 안 고른 상태에서도 무엇을 고르는 칸인지 알아야 한다. */
  label: string;
  /**
   * 아직 안 골랐을 때 보이는 말.
   *
   * 「안 고를래요」 처럼 **거절을 보기로 세우지 않는다.** 그러면 그냥 넘어가면 될 것을
   * 굳이 고르게 되고, 안 골라도 된다는 안내는 어차피 칸 아래에 따로 있다.
   */
  placeholder: string;
  options: SelectOption<T>[];
  value: T | null;
  disabled?: boolean;
  className?: string;
  /** 비우는 것도 고르는 것이다. 되돌릴 수 없는 칸을 만들지 않는다. */
  onChange: (value: T | null) => void;
  /** 칸 아래 한 줄. 왜 묻는지 같은 것. */
  hint?: ReactNode;
}

/**
 * 고르는 칸.
 *
 * **기기가 그리는 선택기를 그대로 쓴다.** 직접 만든 드롭다운은 웹뷰 안에서 자리를 잘못 잡거나
 * 스크롤에 끌려다니고, 손가락 하나로 돌리는 iOS 휠보다 느리다. 겉모습만 우리 것으로 맞추고
 * 여는 일은 기기에 맡긴다.
 *
 * 보기가 네댓을 넘으면 칩보다 이쪽이다. 칩은 줄을 넘겨 화면을 밀어내고, 그만큼 읽을 것이 는다.
 */
export function Select<T extends string>({
  label,
  placeholder,
  options,
  value,
  disabled,
  className,
  onChange,
  hint,
}: SelectProps<T>) {
  const id = useId();

  return (
    <div className={cx('pk-select', className)}>
      <label className="pk-select__label" htmlFor={id}>
        {label}
      </label>
      <div className="pk-select__box">
        <select
          id={id}
          className={cx('pk-select__input', value == null && 'pk-select__input--empty')}
          value={value ?? ''}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value === '' ? null : (event.target.value as T))}
        >
          <option value="">{placeholder}</option>
          {options.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        {/* 기기가 그리는 화살표는 자리와 색을 못 맞춘다. 우리 것을 얹고 기본 것은 감춘다. */}
        <span className="pk-select__caret" aria-hidden="true" />
      </div>
      {hint ? <p className="pk-select__hint">{hint}</p> : null}
    </div>
  );
}
