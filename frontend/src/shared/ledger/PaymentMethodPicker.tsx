import { cx } from '../lib/cx';

import { PAYMENT_METHODS } from './paymentMethod';

import type { PaymentMethod } from '../api';

export interface PaymentMethodPickerProps {
  value: PaymentMethod | null;
  /** 고른 것을 한 번 더 누르면 null 이 온다. 잘못 고른 것을 되무르는 길이다. */
  onChange: (next: PaymentMethod | null) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * 신용카드·체크카드·현금 중 하나.
 *
 * **안 고르고 넘어가도 된다.** 10초 안에 적는 것이 이 앱의 약속이라, 여기서 한 단계를
 * 꼭 거치게 하면 그 약속이 깨진다. 그래서 고르기 전에는 조용한 회색이고, 고른 뒤에만
 * 색이 든다. 고른 것을 한 번 더 누르면 다시 안 고른 상태가 된다.
 *
 * 지출에만 선다. 수입과 이체에는 뜻이 없어 서버가 그 값을 버린다.
 */
export function PaymentMethodPicker({
  value,
  onChange,
  disabled = false,
  className,
}: PaymentMethodPickerProps) {
  return (
    <div className={cx('pk-pay', className)} role="group" aria-label="결제 수단">
      <span className="pk-pay__label">결제 수단</span>
      <div className="pk-pay__items">
        {PAYMENT_METHODS.map((method) => (
          <button
            key={method.value}
            type="button"
            className="pk-pay__item"
            aria-pressed={method.value === value}
            disabled={disabled}
            onClick={() => onChange(method.value === value ? null : method.value)}
          >
            {method.label}
          </button>
        ))}
      </div>
    </div>
  );
}
