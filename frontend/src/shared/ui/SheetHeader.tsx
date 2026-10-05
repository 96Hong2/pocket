import type { ReactNode } from 'react';

export interface SheetHeaderProps {
  /** 한 단계 뒤로. 시트 안 ‹ 와 폰 뒤로가기가 같은 함수를 타게 쓰는 쪽이 맞춘다. */
  onBack: () => void;
  title?: ReactNode;
  /** 제목 오른쪽 칸. 칩 하나 정도가 들어간다. */
  right?: ReactNode;
  backLabel?: string;
  /** 무언가 도는 중이라 물러날 수 없을 때. ‹ 가 흐려지고 눌리지 않는다. */
  backDisabled?: boolean;
}

/**
 * 시트 안 화면의 머리. 왼쪽 ‹, 제목, 오른쪽 칸.
 *
 * ‹ 는 왼쪽에만 둔다. 오른쪽 위는 토스가 그리는 미니앱 닫기 자리라 겹치면 앱을 닫는다.
 */
export function SheetHeader({
  onBack,
  title,
  right,
  backLabel = '뒤로',
  backDisabled = false,
}: SheetHeaderProps) {
  return (
    <div className="sheet-head">
      <button
        type="button"
        className="sheet-head__back"
        aria-label={backLabel}
        disabled={backDisabled}
        onClick={onBack}
      >
        <span aria-hidden="true">‹</span>
      </button>
      {title != null ? <div className="sheet-head__title">{title}</div> : null}
      {right != null ? <div className="sheet-head__right">{right}</div> : null}
    </div>
  );
}
