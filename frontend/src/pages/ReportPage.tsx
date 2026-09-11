import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

import { IdentityNotice } from '../app/IdentityNotice';
import { AdSlot } from '../features/ads';
import { MonthlyReport } from '../features/reports';
import { toLedgerDate } from '../shared/lib/format';

/** `2026-08` 모양인지. 홈 카드가 붙여 준 값이라 아무 문자열이나 들어올 수 있다. */
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 리포트 탭. 그 달에 어디로 얼마나 갔는지 한 화면에서 본다. */
export default function ReportPage() {
  const thisMonth = toLedgerDate(new Date()).slice(0, 7);
  // 홈의 결산 카드가 `?month=2026-08&closing=1` 로 데려온다. 그때는 그 달로 열고
  // 결산까지 펼친다. 주소를 손으로 친 경우에도 어긋난 값이면 그냥 이번 달을 연다.
  const [params, setParams] = useSearchParams();
  const asked = params.get('month');
  const [month, setMonth] = useState(
    asked != null && MONTH_PATTERN.test(asked) && asked <= thisMonth ? asked : thisMonth,
  );
  // 열어 달라는 부탁은 한 번만 쓴다. 주소를 계속 보고 열면, 달을 옮겨 본문을 다시 그릴 때마다
  // 사용자가 누르지도 않은 전체화면 결산이 다시 뜬다.
  const [openClosing, setOpenClosing] = useState(() => params.get('closing') === '1');
  const consumeClosing = useCallback(() => setOpenClosing(false), []);
  // 달을 옮기면 부탁도 접는다. 로딩 중에는 결산 자리가 아직 없어서 부탁을 못 쓴 채로
  // 달만 바뀔 수 있는데, 그러면 엉뚱한 달의 결산이 저절로 열린다.
  const changeMonth = useCallback((next: string) => {
    setMonth(next);
    setOpenClosing(false);
  }, []);

  // 다 쓴 부탁은 주소에서도 지운다. 히스토리에는 남기지 않는다. 남기면 뒤로가기로
  // 그 주소에 되돌아왔을 때 또 열린다.
  useEffect(() => {
    if (!params.has('closing')) return;
    const next = new URLSearchParams(params);
    next.delete('closing');
    setParams(next, { replace: true });
  }, [params, setParams]);

  return (
    <div className="page">
      <h1 className="page__title">리포트</h1>
      {/* 달을 옮겨 다니는 화면이라 리드가 특정 달을 가리키면 지난달에서 거짓이 된다. */}
      <p className="page__lead">지출이 어디로 갔는지 봐요</p>

      {/* 식별키를 못 받으면 조회가 시작조차 안 해 로딩이 끝나지 않는다. 이 안내가 이유를 말한다. */}
      <IdentityNotice />

      <MonthlyReport
        month={month}
        onMonthChange={changeMonth}
        autoOpenClosing={openClosing}
        onClosingAutoOpened={consumeClosing}
        adSlot={<AdSlot placement="report" />}
      />
    </div>
  );
}
