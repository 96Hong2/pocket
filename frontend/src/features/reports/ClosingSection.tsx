import { useEffect, useState } from 'react';

import { useClosing } from '../../shared/api';
import { formatMonthLabel } from '../../shared/lib/format';
import { Card } from '../../shared/ui';

import { ClosingOverlay } from './ClosingOverlay';
import { CLOSING_CARDS } from './closingText';

export interface ClosingSectionProps {
  /** 지금 보고 있는 달. `2026-08` */
  month: string;
  /** 홈의 결산 카드로 들어왔을 때만 참. 진입 즉시 오버레이를 연다. */
  autoOpen?: boolean;
  /** 그 부탁을 실제로 쓴 순간 알린다. 부모가 지워 줘야 두 번 열리지 않는다. */
  onAutoOpened?: () => void;
}

/**
 * 리포트 안의 결산 입구.
 *
 * **끝난 달에 기록이 있을 때만 그린다.** 아직 지나는 중인 달은 결산할 수 없고, 기록이 없는
 * 달은 돌아볼 것이 없다. 그 판정은 서버가 하고(`is_closed`·`has_any_transaction`)
 * 화면은 달력을 다시 보지 않는다.
 *
 * 조회가 실패하면 이 자리를 비운다. 리포트 본문은 그대로 남으므로 결산 하나 때문에
 * 그 달을 통째로 못 보게 되지 않는다.
 */
export function ClosingSection({ month, autoOpen = false, onAutoOpened }: ClosingSectionProps) {
  const [year, monthNumber] = month.split('-').map(Number);
  const closing = useClosing({ year, month: monthNumber });
  // 열린 달을 들고 있는다. 달을 옮기면 저절로 닫혀서, 옆 달 결산이 그대로 떠 있지 않는다.
  const [openMonth, setOpenMonth] = useState<string | null>(autoOpen ? month : null);

  // 달을 옮기면 이 자리가 통째로 다시 마운트되면서 위 초기값을 또 읽는다. 열어 달라는
  // 부탁을 쓴 즉시 알려서, 다음 마운트에는 닫힌 채로 시작하게 한다.
  useEffect(() => {
    if (autoOpen) onAutoOpened?.();
  }, [autoOpen, onAutoOpened]);

  const data = closing.data;
  if (data == null || !data.is_closed || !data.has_any_transaction) return null;

  return (
    <>
      {/* 카드 전체가 버튼이라 이름으로 잡힌다. 따로 표식을 붙이지 않는다. */}
      <Card className="closing-entry" padding="none">
        <button type="button" className="closing-entry__button" onClick={() => setOpenMonth(month)}>
          <span className="closing-entry__title">{formatMonthLabel(month)} 결산</span>
          <span className="closing-entry__hint">
            카드 {CLOSING_CARDS.length}장 · 잘한 것부터 열어봐요
          </span>
        </button>
      </Card>

      <ClosingOverlay
        month={month}
        closing={data}
        open={openMonth === month}
        onClose={() => setOpenMonth(null)}
      />
    </>
  );
}
