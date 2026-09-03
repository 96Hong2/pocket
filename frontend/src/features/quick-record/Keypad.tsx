import { formatCurrency } from '../../shared/lib/format';

import { appendDigit, toAmount } from './digits';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'] as const;

/** 지금 금액과 다음에 무엇을 하면 되는지. 키패드와 카테고리 칩 사이에 놓는다. */
export function AmountDisplay({ digits, hint }: { digits: string; hint: string }) {
  return (
    <div className="keypad__head">
      <div
        className={digits === '' ? 'keypad__amount keypad__amount--empty' : 'keypad__amount'}
        data-numeric=""
        aria-live="polite"
      >
        {formatCurrency(toAmount(digits))}
      </div>
      <p className="keypad__hint">{hint}</p>
    </div>
  );
}

export function Keypad({ digits, onChange }: { digits: string; onChange: (next: string) => void }) {
  return (
    <div className="keypad__keys">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className="keypad__key"
          onClick={() => onChange(appendDigit(digits, key))}
        >
          {key}
        </button>
      ))}
      <button
        type="button"
        className="keypad__key"
        aria-label="한 자리 지우기"
        onClick={() => onChange(digits.slice(0, -1))}
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
