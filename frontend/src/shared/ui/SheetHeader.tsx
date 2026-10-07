import type { ReactNode } from 'react';

export interface SheetHeaderProps {
  title: string;
  /** 제목 오른쪽 칸. 칩 하나 정도가 들어간다. */
  right?: ReactNode;
}

/**
 * 시트와 창 안 화면의 제목 줄. 본문과 같은 왼쪽 여백에서 시작하고 오른쪽에 칸 하나를 둔다.
 *
 * **뒤로 버튼을 그리지 않는다.** 상단바의 ‹ 는 토스가 그린다. 여기 하나 더 그리면 뒤로가기가
 * 둘로 보여 검토에서 반려된다(ADR-0048). 한 단계 뒤로는 토스 ‹, 폰 뒤로가기, Esc 가 받는다.
 * 오른쪽 위도 토스가 그리는 닫기 자리라 닫기 버튼을 두지 않는다.
 *
 * 제목은 포커스를 받을 수 있다. 단계가 바뀔 때 읽는 프로그램이 새 화면 이름부터 읽게 하려는 자리다.
 */
export function SheetHeader({ title, right }: SheetHeaderProps) {
  return (
    <div className="sheet-head">
      <h2 className="sheet-head__title" tabIndex={-1}>
        {title}
      </h2>
      {right != null ? <div className="sheet-head__right">{right}</div> : null}
    </div>
  );
}
