import { useEffect, useRef, useState } from 'react';

import { useBridge, useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics, type MembersBucket } from '../../shared/analytics';
import { markPlusInterest } from '../../shared/lib/plusInterest';
import { BottomSheet, Button } from '../../shared/ui';

export interface PlusInterestSheetProps {
  open: boolean;
  bookName: string;
  members: MembersBucket;
  /** 이 기기에서 이미 「원해요」 를 눌렀나. */
  wanted: boolean;
  onWanted: () => void;
  onClose: () => void;
}

/**
 * 「우리 집 광고 없이 쓰기」. 결제는 아직 없다. 원하는 사람이 얼마나 되는지만 센다.
 *
 * 연 것, 원해요, 닫은 것을 한 번씩 남긴다. 금액과 이름은 싣지 않고 인원 구간만 싣는다.
 */
export function PlusInterestSheet({
  open,
  bookName,
  members,
  wanted,
  onWanted,
  onClose,
}: PlusInterestSheetProps) {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const [thanked, setThanked] = useState(false);
  const opened = useRef(false);

  // 열린 순간 한 번 센다.
  useEffect(() => {
    if (!open) {
      opened.current = false;
      return;
    }
    if (opened.current) return;
    opened.current = true;
    analytics.log(EVENTS.plusInterest, { where: 'book_settings', result: 'open', members });
  }, [analytics, members, open]);

  function close(): void {
    if (!thanked) {
      analytics.log(EVENTS.plusInterest, { where: 'book_settings', result: 'close', members });
    }
    setThanked(false);
    onClose();
  }

  useOverlayBackClose(open, close);

  function want(): void {
    analytics.log(
      EVENTS.plusInterest,
      { where: 'book_settings', result: 'want', members },
      { kind: 'click' },
    );
    void markPlusInterest(bridge.storage);
    setThanked(true);
    onWanted();
  }

  const done = thanked || wanted;

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={`${bookName} 광고 없이 쓰기`}
      className="book-plus"
    >
      <div className="book-plus__body">
        <p className="book-plus__lead">한 명이 결제하면 {bookName} 멤버 모두 광고 없이 써요</p>
        <p className="book-plus__line" role={done ? 'status' : undefined}>
          {done ? '알려 주셔서 고마워요' : '아직 준비 중이에요. 원하면 알려 주세요'}
        </p>
        {done ? null : (
          <Button fullWidth onClick={want}>
            원해요
          </Button>
        )}
        <Button variant="ghost" fullWidth onClick={close}>
          닫기
        </Button>
      </div>
    </BottomSheet>
  );
}
