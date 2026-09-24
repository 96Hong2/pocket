/**
 * 내려받을 기간.
 *
 * 넷으로 못 박는다. 「직접 선택」 은 두지 않았다. 날짜 칸 둘을 세우는 순간 이 시트가 폼이
 * 되고, 거꾸로 고른 범위를 잡아 줄 자리와 그 오류 문구까지 따라온다. 가계부를 통째로
 * 꺼내려는 사람에게 필요한 것은 넷이면 거의 다 덮인다.
 *
 * 날짜는 `2026-09-25` 문자열로만 다룬다. Date 로 옮겨 계산하면 기기 시간대가 가계부
 * 시간대와 다를 때 달 경계에서 하루가 밀린다.
 */

import { shiftMonth } from '../../shared/lib/format';

export type ExportPeriod = 'this_month' | 'last_month' | 'this_year' | 'all';

export const EXPORT_PERIODS: { value: ExportPeriod; label: string }[] = [
  { value: 'this_month', label: '이번 달' },
  { value: 'last_month', label: '지난 달' },
  { value: 'this_year', label: '올해' },
  { value: 'all', label: '전체' },
];

/** 그 기간을 어떻게 받아 올지. */
export interface ExportRange {
  /**
   * 서버에 그 달만 물을 수 있으면 `2026-09`. 올해·전체는 null 이다.
   *
   * 서버는 연과 월을 반드시 함께 받는다. 연 단위 조회가 없어서 올해는 통째로 받아 거른다.
   */
  month: string | null;
  /**
   * 받아 온 뒤 남길 날짜의 앞머리. 빈 문자열이면 모두 남는다.
   *
   * **달을 물어본 기간은 여기가 비어 있다.** 달 경계는 서버가 정하는데
   * (`shared/api/client.ts` 의 `MonthParams`), 그 달을 물어 놓고 우리 시계로 한 번 더
   * 거르면 서버와 기기의 경계가 어긋나는 날 경계에 걸친 줄이 조용히 빠진다.
   */
  prefix: string;
  /** 파일 이름에 넣을 조각. `2026-09` · `2026` · `전체`. */
  slug: string;
}

export function exportRange(period: ExportPeriod, today: string): ExportRange {
  const month = today.slice(0, 7);
  switch (period) {
    case 'this_month':
      return { month, prefix: '', slug: month };
    case 'last_month': {
      const previous = shiftMonth(month, -1);
      return { month: previous, prefix: '', slug: previous };
    }
    case 'this_year': {
      const year = today.slice(0, 4);
      return { month: null, prefix: year, slug: year };
    }
    case 'all':
      return { month: null, prefix: '', slug: '전체' };
  }
}

/** 파일 이름만 보고 무슨 기간인지 알 수 있게 짓는다. 확장자가 있어야 기기가 열 앱을 고른다. */
export function exportFileName(period: ExportPeriod, today: string, extension: string): string {
  return `가계부_${exportRange(period, today).slug}.${extension}`;
}
