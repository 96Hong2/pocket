import type { ReactNode } from 'react';

/**
 * 아직 데이터가 붙지 않은 자리.
 * 다음 vertical slice 에서 각 feature 컴포넌트로 바꾼다.
 */
export function Placeholder({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="placeholder">
      <span className="placeholder__label">{label}</span>
      {children}
    </div>
  );
}
