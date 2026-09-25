import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Button } from './Button';
import { trapTab } from './focusTrap';

/**
 * 적던 것을 두고 나가려 할 때 한 번 묻는다.
 *
 * **시트를 하나 더 띄우지 않고 지금 화면 위에 겹친다.** 시트가 둘이면 닫을 때 어디로
 * 돌아가는지 흔들리고, 화면에 dialog 가 둘이 된다.
 *
 * **머무는 쪽이 기본이다.** 실수로 손잡이를 스친 사람이 한 번 더 실수해도 잃지 않게,
 * 남는 버튼을 크고 오른쪽에 둔다.
 *
 * 왜 이 부품이 `shared` 에 있나. 기록 시트 · 기록 고치기 · 새 분류 만들기가 같은 말을
 * 해야 한다. 화면마다 따로 만들면 한 곳은 묻고 다른 곳은 안 묻는 상태가 되는데,
 * 2026-09-25 신고가 정확히 그 모양이었다(읽어 온 건수만 묻고 손으로 적은 것은 안 물었다).
 *
 * **포털로 body 에 붙인다.** 시트 안에 두면 끌던 중에 뜰 때 문제가 난다. 시트에는
 * `transform` 이 걸려 있고, `position: fixed` 는 그 안에서 화면이 아니라 시트를 기준으로
 * 잡힌다. 창이 시트 크기로 작게 떴다가 되돌아오는 transition 이 끝나야 화면을 덮는다.
 */
export function LeaveConfirm({
  text,
  leaveLabel = '그만두기',
  stayLabel = '계속 쓰기',
  onStay,
  onLeave,
}: {
  /** 무엇을 잃는지. 한 문장으로 적는다. */
  text: ReactNode;
  leaveLabel?: string;
  stayLabel?: string;
  onStay: () => void;
  onLeave: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  /*
    뜨면 **머무는 버튼으로 포커스를 옮긴다.** 안 옮기면 읽는 프로그램에 무엇을 물었는지가
    안 닿고, Tab 이 딤에 가려 눌리지도 않는 뒤 화면 칸들을 계속 돈다.
  */
  useEffect(() => {
    boxRef.current?.querySelector<HTMLElement>('.record-leave__stay')?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab' || boxRef.current == null) return;
      trapTab(boxRef.current, event);
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return createPortal(
    <div className="record-leave" role="alertdialog" aria-label="그만둘까요" ref={boxRef}>
      <div className="record-leave__box">
        <p className="record-leave__text">{text}</p>
        <div className="record-leave__actions">
          <Button variant="outline" onClick={onLeave}>
            {leaveLabel}
          </Button>
          <Button className="record-leave__stay" onClick={onStay}>
            {stayLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
