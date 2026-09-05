import { useState } from 'react';

import { IdentityNotice } from '../app/IdentityNotice';
import { MonthlyReport } from '../features/reports';
import { toLedgerDate } from '../shared/lib/format';

/** 리포트 탭. 그 달에 어디로 얼마나 갔는지 한 화면에서 본다. */
export default function ReportPage() {
  const thisMonth = toLedgerDate(new Date()).slice(0, 7);
  const [month, setMonth] = useState(thisMonth);

  return (
    <div className="page">
      <h1 className="page__title">리포트</h1>
      {/* 달을 옮겨 다니는 화면이라 리드가 특정 달을 가리키면 지난달에서 거짓이 된다. */}
      <p className="page__lead">지출이 어디로 갔는지 봐요</p>

      {/* 식별키를 못 받으면 조회가 시작조차 안 해 로딩이 끝나지 않는다. 이 안내가 이유를 말한다. */}
      <IdentityNotice />

      <MonthlyReport month={month} onMonthChange={setMonth} />
    </div>
  );
}
