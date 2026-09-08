import { cx } from '../lib/cx';

import { LEDGER_KINDS, type LedgerKind } from './kind';

export interface KindToggleProps {
  value: LedgerKind;
  onChange: (kind: LedgerKind) => void;
  /** 도는 중에는 못 바꾼다. 바꾸면 응답이 돌아올 자리가 달라진다. */
  disabled?: boolean;
  className?: string;
  /** 스크린리더가 읽을 묶음 이름. 화면마다 무엇의 종류인지 다르다. */
  ariaLabel?: string;
}

/**
 * 지출·수입을 고르는 알약 두 개.
 *
 * 방법 탭(`SegmentedControl`)과 일부러 다르게 그린다. 같은 모양을 위아래로 겹치면
 * 탭이 두 줄인 것처럼 읽혀, 어느 쪽이 화면을 바꾸는 것인지 알 수 없다.
 */
export function KindToggle({
  value,
  onChange,
  disabled = false,
  className,
  ariaLabel = '종류',
}: KindToggleProps) {
  return (
    <div className={cx('pk-kind', className)} role="group" aria-label={ariaLabel}>
      {LEDGER_KINDS.map((kind) => (
        <button
          key={kind.value}
          type="button"
          className="pk-kind__item"
          aria-pressed={kind.value === value}
          disabled={disabled}
          onClick={() => onChange(kind.value)}
        >
          {kind.label}
        </button>
      ))}
    </div>
  );
}
