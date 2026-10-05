import { formatCurrency } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';

import { appendQuantityKey, dropQuantityKey, QUANTITY_KEYS } from '../asset-dest';

import { appendDigit, toAmount } from './digits';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'] as const;

/**
 * 지금 금액. 키패드와 카테고리 칩 사이에 놓는다.
 *
 * 안내 한 줄(`hint`)은 금액을 고치는 자리(저장 뒤 패널)만 쓴다. 기록 시트는 줄 하나를
 * 아끼려고 안 넘긴다. 상태마다 줄이 생겼다 사라지면 키패드가 들썩여서 통째로 뺐다.
 */
export function AmountDisplay({
  digits,
  hint,
  onPress,
  dimmed = false,
}: {
  digits: string;
  hint?: string;
  /** 수량 칸이 있을 때. 금액 숫자를 누르면 키패드가 다시 금액을 친다. */
  onPress?: () => void;
  /** 키패드가 다른 칸을 치는 중이라 흐리게. */
  dimmed?: boolean;
}) {
  const amount = (
    <div
      data-testid={TEST_IDS.recordAmount}
      className={
        digits === '' || dimmed ? 'keypad__amount keypad__amount--empty' : 'keypad__amount'
      }
      data-numeric=""
      aria-live="polite"
    >
      {formatCurrency(toAmount(digits))}
    </div>
  );
  if (onPress != null) {
    return (
      <button
        type="button"
        className="keypad__head keypad__head--press"
        aria-pressed={!dimmed}
        aria-label={`금액 ${formatCurrency(toAmount(digits))}`}
        onClick={onPress}
      >
        {amount}
      </button>
    );
  }
  return (
    <div className="keypad__head">
      {amount}
      {hint == null ? null : (
        <p data-testid={TEST_IDS.recordHint} className="keypad__hint">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * 숫자판. `decimal` 이면 수량을 친다: 「00」 자리가 「.」 이고 소수점은 한 번만 들어간다.
 */
export function Keypad({
  digits,
  onChange,
  decimal = false,
}: {
  digits: string;
  onChange: (next: string) => void;
  decimal?: boolean;
}) {
  const keys = decimal ? QUANTITY_KEYS : KEYS;
  return (
    <div className="keypad__keys">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          className="keypad__key"
          disabled={decimal && key === '.' && digits.includes('.')}
          onClick={() =>
            onChange(decimal ? appendQuantityKey(digits, key) : appendDigit(digits, key))
          }
        >
          {key}
        </button>
      ))}
      <button
        type="button"
        className="keypad__key"
        aria-label="한 자리 지우기"
        onClick={() => onChange(decimal ? dropQuantityKey(digits) : digits.slice(0, -1))}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M9 5h10a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9L3 12l6-7Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M11.5 9.5l5 5M16.5 9.5l-5 5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
