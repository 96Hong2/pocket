import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cx } from '../lib/cx';

export type ButtonVariant = 'primary' | 'primarySmall' | 'ghost' | 'outline';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'pk-btn--primary',
  primarySmall: 'pk-btn--primary-small',
  ghost: 'pk-btn--ghost',
  outline: 'pk-btn--outline',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  /** 라벨 앞에 붙는 아이콘. 장식이므로 aria-hidden 으로 감싸서 넘긴다. */
  leadingIcon?: ReactNode;
}

/** 모든 변형이 44px 이상이라 터치 영역을 따로 넓히지 않아도 된다. */
export function Button({
  variant = 'primary',
  fullWidth = false,
  leadingIcon,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'pk-btn',
        VARIANT_CLASS[variant],
        fullWidth && 'pk-btn--block',
        className,
      )}
      {...rest}
    >
      {leadingIcon}
      {children}
    </button>
  );
}
