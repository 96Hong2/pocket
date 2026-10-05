import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { IdentityNotice } from '../app/IdentityNotice';
import { useOverlay } from '../app/providers';
import {
  REPORT_KEY_QUERY,
  REPORT_MONTH_QUERY,
  REPORT_TAB_QUERY,
  parseReportTab,
  reportPath,
} from '../app/router/routes';
import { CategoryDetail } from '../features/reports';
import { EditSheet } from '../features/transactions';
import { useCategories, type TransactionOut } from '../shared/api';
import { toLedgerDate } from '../shared/lib/format';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * 리포트 분류 줄을 눌러 들어오는 화면. 달, 탭, 줄 키를 주소로 받는다.
 *
 * 뒤로(토스 ‹, 폰 뒤로가기, Esc)는 리포트의 그 달 그 탭으로 간다. 토스 ‹ 는 `BackHandler` 가
 * 주소에서 같은 자리를 읽어 간다.
 */
export default function ReportCategoryPage() {
  const thisMonth = toLedgerDate(new Date()).slice(0, 7);
  const [params] = useSearchParams();
  const asked = params.get(REPORT_MONTH_QUERY);
  const month =
    asked != null && MONTH_PATTERN.test(asked) && asked <= thisMonth ? asked : thisMonth;
  const tab = parseReportTab(params.get(REPORT_TAB_QUERY));
  const rowKey = params.get(REPORT_KEY_QUERY) ?? 'uncategorized';

  const navigate = useNavigate();
  const overlay = useOverlay();
  const categories = useCategories();
  const [editing, setEditing] = useState<TransactionOut | null>(null);

  const back = useCallback(() => {
    void navigate(reportPath(month, tab), { replace: true });
  }, [month, navigate, tab]);

  // 시트가 떠 있으면 Esc 는 시트가 먼저 받는다.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || overlay.hasOpen) return;
      back();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [back, overlay.hasOpen]);

  return (
    <div className="page">
      <IdentityNotice />
      <CategoryDetail month={month} tab={tab} rowKey={rowKey} onPick={setEditing} />
      <EditSheet
        transaction={editing}
        categories={categories.data?.items ?? []}
        month={{ year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) }}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
