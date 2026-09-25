/**
 * 새 분류를 만드는 **새 창**.
 *
 * 기록 시트의 키패드 탭은 시트 안쪽을 통째로 바꿔서 이 화면을 만든다. 그런데 줄글·캡처·
 * 영수증의 검토 줄과 기존 기록 고치기는 목록 한가운데라, 같은 방식을 쓸 수가 없다.
 * 거기서는 회색 상자 안에 폼이 끼어 있었고, 「이전·저장」 이 맨 위가 아니라 상자 안
 * 어딘가에 있었다. 아이콘 격자를 내리면 저장이 화면 밖으로 밀렸다.
 *
 * 그래서 어디서 열든 **화면을 덮는 한 장**으로 올린다. 시트(60)보다 위에 서고, 시트가
 * 스크롤된 정도와 무관하게 늘 같은 자리에서 열린다. 딤을 깔지 않는 이유는 뒤가 비쳐 보이면
 * 「끼어든 창」 으로 읽혀서다. 여기는 지금 하는 일이 바뀐 자리다.
 *
 * **감싼 시트를 잠가야 한다.** Esc 와 딤 클릭은 문서 전체에 걸려 있어서, 잠그지 않으면
 * 이 창을 닫으려던 Esc 가 뒤에 있는 시트까지 함께 닫는다. 적던 금액과 읽어 온 줄이
 * 통째로 사라진다. 부르는 쪽이 `open` 인 동안 `dismissible={false}` 로 둔다.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useOverlayBackClose } from '../../app/providers';
import type { CategoryOut } from '../../shared/api';
import type { LedgerKind } from '../../shared/ledger';
import { trapTab } from '../../shared/ui/focusTrap';

import { CategoryEditForm } from './CategoryEditSheet';

export interface CategoryComposeOverlayProps {
  open: boolean;
  /** 종류는 부른 자리가 이미 정했다. 여기서 다시 묻지 않는다. */
  fixedKind: LedgerKind;
  /** 맨 위 「이전」. 만들지 않고 왔던 화면으로 돌아간다. */
  onBack: () => void;
  /** 만들기가 끝나 닫히는 길. */
  onClose: () => void;
  /** 만든 것을 그 자리에서 바로 고르라고 돌려준다. */
  onCreated: (created: CategoryOut) => void;
  /** 저장이 도는 동안. 감싼 자리가 닫기를 잠그는 데 쓴다. */
  onBusyChange?: (busy: boolean) => void;
}

export function CategoryComposeOverlay({
  open,
  fixedKind,
  onBack,
  onClose,
  onCreated,
  onBusyChange,
}: CategoryComposeOverlayProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  /*
    저장이 도는 동안에는 뒤로가기로 안 닫힌다. 닫히면 적어 둔 이름과 고른 그림이
    함께 사라지고, 서버에는 만들어졌는데 화면은 못 고른 상태가 된다.
  */
  const [busy, setBusy] = useState(false);
  // 시스템 뒤로가기를 이 창의 「이전」 으로 가져간다. 등록 안 하면 미니앱이 통째로 닫힌다.
  useOverlayBackClose(open, onBack, busy);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (busy) return;
        /*
          **먼저 가로챈다.** 안 막으면 뒤에 있는 시트의 Esc 처리까지 이어져서,
          분류 만들기를 그만두려던 한 번에 기록 시트까지 닫힌다.
        */
        event.preventDefault();
        event.stopPropagation();
        onBack();
        return;
      }
      if (event.key !== 'Tab' || !boxRef.current) return;
      trapTab(boxRef.current, event);
    }

    // 캡처 단계에서 잡는다. 시트가 document 에 건 리스너보다 먼저 와야 막을 수 있다.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [busy, open, onBack]);

  if (!open) return null;

  return createPortal(
    <div
      className="cat-compose"
      role="dialog"
      aria-modal="true"
      aria-label="새 분류 만들기"
      ref={boxRef}
    >
      <CategoryEditForm
        layout="page"
        fixedKind={fixedKind}
        onBusyChange={(next) => {
          setBusy(next);
          onBusyChange?.(next);
        }}
        onBack={onBack}
        onClose={onClose}
        onCreated={onCreated}
      />
    </div>,
    document.body,
  );
}
