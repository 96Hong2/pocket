import { useState } from 'react';

import { Button, iconUrl } from '../../shared/ui';

import { CaptureSheet } from './CaptureSheet';

export interface CaptureEntryProps {
  /** 시트를 열 때 부른다. */
  onOpen?: () => void;
  /** 못 읽은 화면의 「직접 적기」. 항목 시트를 여는 쪽이 넘긴다. */
  onManual?: () => void;
  /** 버튼 글자. 빈 자산 화면은 「캡처로 채우기」 로 짧게 쓴다. */
  label?: string;
}

/** 자산 화면의 「캡처로 채우기」 입구. 누르면 캡처 시트가 열린다. */
export function CaptureEntry({
  onOpen,
  onManual,
  label = '은행·증권 앱 화면 캡처로 채우기',
}: CaptureEntryProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        fullWidth
        className="capture-entry"
        leadingIcon={<img className="capture-entry__icon" src={iconUrl('43_camera')} alt="" />}
        onClick={() => {
          setOpen(true);
          onOpen?.();
        }}
      >
        {label}
      </Button>
      <CaptureSheet open={open} onClose={() => setOpen(false)} onManual={onManual} />
    </>
  );
}
