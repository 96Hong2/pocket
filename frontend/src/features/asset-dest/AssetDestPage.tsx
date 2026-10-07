import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useOverlayBackClose } from '../../app/providers';
import { AssetDestFlow, type AssetDestFlowProps, type AssetDestStage } from './AssetDestFlow';
import type { AssetDestPick } from './destinations';

export interface AssetDestPageProps extends Omit<AssetDestFlowProps, 'stage' | 'onStageChange'> {
  open: boolean;
  /** 목록에서 한 번 더 물러났을 때. 이 창을 연 화면으로 돌아간다. */
  onBack: () => void;
}

/**
 * 「다른 곳」 목록을 화면을 덮는 한 장으로. 검토 줄과 고치기처럼 시트 안에 단계가 없는 자리가 쓴다.
 * 토스 ‹, 폰 뒤로가기, Esc 가 한 단계씩 물린다(새 항목 폼 → 목록 → 닫기). 창 안에 뒤로 버튼은 없다.
 */
export function AssetDestPage({ open, onPick, onBack, ...flow }: AssetDestPageProps) {
  const [stage, setStage] = useState<AssetDestStage>('list');

  function back(): void {
    if (stage === 'new') {
      setStage('list');
      return;
    }
    onBack();
  }

  function pick(next: AssetDestPick): void {
    setStage('list');
    onPick(next);
  }

  useOverlayBackClose(open, back);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      // 뒤의 시트도 같은 document 에서 Esc 를 듣는다. 캡처에서 삼켜야 한 겹만 접힌다.
      event.preventDefault();
      event.stopImmediatePropagation();
      back();
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  });

  if (!open) return null;

  return createPortal(
    <div className="asset-dest-page" role="dialog" aria-modal="true" aria-label="어디에">
      <AssetDestFlow
        {...flow}
        stage={stage}
        onStageChange={setStage}
        onPick={pick}
      />
    </div>,
    document.body,
  );
}
