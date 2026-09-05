import { useState } from 'react';

import { MonthlyReport } from '../features/reports';
import { toLedgerDate } from '../shared/lib/format';

/** 리포트 탭. 그 달에 어디로 얼마나 갔는지 한 화면에서 본다. */
export default function ReportPage() {
  const thisMonth = toLedgerDate(new Date()).slice(0, 7);
  const [month, setMonth] = useState(thisMonth);

  return (
    <div className="page">
      <h1 className="page__title">리포트</h1>
      <p className="page__lead">이번 달 지출이 어디로 갔는지 봐요</p>

      <MonthlyReport month={month} onMonthChange={setMonth} />
    </div>
  );
}
