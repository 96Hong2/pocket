import { useEffect, useState } from 'react';

import { useClosing } from '../../shared/api';
import { formatMonthLabel } from '../../shared/lib/format';
import { Card, iconUrl } from '../../shared/ui';
import { AdAheadNote, useAdConsent } from '../ads';

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
 *
 * **여는 길에 전면 광고 한 편이 선다. 그래서 버튼에 미리 적어 둔다.** 달에 한 번 있는
 * 일이고 기록하는 흐름 밖이라 사람을 멈춰 세워도 되는 몇 안 되는 자리지만, 그것과
 * 「누르기 전에 알리는 것」 은 다른 문제다. 앱에 남은 전면 광고가 여기 하나뿐인 이유도
 * 이것이다. 적어 둘 버튼이 있는 자리만 남겼다.
 *
 * 광고가 안 떠도 결산은 열린다. 홈 카드로 들어와 저절로 열리는 길(`autoOpen`)에는
 * 세우지 않는다. 화면이 넘어가는 중에 광고가 끼어들면 무엇 때문에 멈췄는지 알 수가 없다.
 */
export function ClosingSection({ month, autoOpen = false, onAutoOpened }: ClosingSectionProps) {
  const [year, monthNumber] = month.split('-').map(Number);
  const closing = useClosing({ year, month: monthNumber });
  // 열린 달을 들고 있는다. 달을 옮기면 저절로 닫혀서, 옆 달 결산이 그대로 떠 있지 않는다.
  const [openMonth, setOpenMonth] = useState<string | null>(autoOpen ? month : null);
  const ad = useAdConsent();

  // 달을 옮기면 이 자리가 통째로 다시 마운트되면서 위 초기값을 또 읽는다. 열어 달라는
  // 부탁을 쓴 즉시 알려서, 다음 마운트에는 닫힌 채로 시작하게 한다.
  useEffect(() => {
    if (autoOpen) onAutoOpened?.();
  }, [autoOpen, onAutoOpened]);

  const data = closing.data;

  // 광고가 뜨든 안 뜨든 결산은 연다. 광고 서버 사정으로 지난달을 못 보게 두지 않는다.
  function openAfterAd(): void {
    ad.request({
      where: 'closing',
      what: `${formatMonthLabel(month)} 결산`,
      go: () => setOpenMonth(month),
    });
  }

  if (data == null || !data.is_closed || !data.has_any_transaction) return null;

  return (
    <>
      {/* 카드 전체가 버튼이라 이름으로 잡힌다. 따로 표식을 붙이지 않는다. */}
      <Card className="closing-entry" padding="none">
        <button
          type="button"
          className="closing-entry__button"
          disabled={ad.pending != null}
          onClick={openAfterAd}
        >
          <img className="closing-entry__icon" src={iconUrl('31_gift')} alt="" aria-hidden />
          <span className="closing-entry__text">
            <span className="closing-entry__title">{formatMonthLabel(month)} 결산</span>
            <span className="closing-entry__hint">
              카드 {CLOSING_CARDS.length}장 · 잘한 것부터 열어봐요
            </span>
            {/* 받는 것(카드 넉 장) 바로 아래다. 무엇을 얻고 무엇을 치르는지 한눈에 붙어 있다. */}
            <AdAheadNote className="closing-entry__ad" />
          </span>
          {/* 눌러서 들어가는 자리라는 표시. 읽을 것이 아니라 방향이다. */}
          <span className="closing-entry__chevron" aria-hidden="true">
            ›
          </span>
        </button>
      </Card>

      <ClosingOverlay
        month={month}
        closing={data}
        open={openMonth === month}
        onClose={() => setOpenMonth(null)}
      />

      {/* 누른 자리와 광고 사이에 서는 확인 창. */}
      {ad.prompt}
    </>
  );
}
