import { BottomSheet } from '../../shared/ui';

import { useCaptureFlow } from './useCaptureFlow';

export interface CaptureSheetProps {
  open: boolean;
  onClose: () => void;
  /** 「직접 적기」. 없으면 시트만 닫는다. */
  onManual?: () => void;
}

/** 자산 화면의 잔액 캡처 시트. 흐름은 `useCaptureFlow` 가 갖고, 여기는 시트로 감싼다. */
export function CaptureSheet({ open, onClose, onManual }: CaptureSheetProps) {
  const flow = useCaptureFlow({
    from: 'assets',
    onSaved: onClose,
    onCancel: onClose,
    onManual: () => {
      onClose();
      onManual?.();
    },
  });

  function close(): void {
    if (flow.locked) return;
    flow.reset();
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      onClose={close}
      dismissible={!flow.locked}
      title={
        flow.step === 'intro'
          ? '캡처로 채우기'
          : flow.step === 'review'
            ? '이렇게 읽었어요'
            : undefined
      }
      size={flow.step === 'review' ? 'tall' : 'auto'}
    >
      {flow.view}
    </BottomSheet>
  );
}
