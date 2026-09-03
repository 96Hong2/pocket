import { parseDecimalOr, type CalendarDayOut } from '../../shared/api';
import { cx } from '../../shared/lib/cx';
import { formatNumber } from '../../shared/lib/format';

import { dayCellLabel, dayIso, monthGrid, type DayNumbers } from './ledgerView';

/**
 * 달력 격자.
 *
 * 서버는 기록이 있는 날만 보내 준다. 빈 칸은 여기서 만든다.
 * 칸마다 접근성 이름에 날짜와 금액을 다 넣는다. 숫자만 그리는 칸이라 이름이 없으면
 * 스크린리더로는 어느 날인지도 얼마인지도 알 수 없다.
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export interface CalendarGridProps {
  /** `2026-09` */
  month: string;
  days: CalendarDayOut[];
  /** `2026-09-10` */
  selected: string;
  /** 오늘. 테두리로 표시한다. */
  today: string;
  onSelect: (day: string) => void;
}

export function CalendarGrid({ month, days, selected, today, onSelect }: CalendarGridProps) {
  const { leadingBlanks, days: dayNumbers } = monthGrid(month);

  const numbers = new Map<string, DayNumbers>(
    days.map((d) => [
      d.day,
      { expense: parseDecimalOr(d.expense, 0), income: parseDecimalOr(d.income, 0) },
    ]),
  );

  return (
    <div className="tx-cal">
      <div className="tx-cal__week" aria-hidden="true">
        {WEEKDAYS.map((label) => (
          <span key={label} className="tx-cal__weekday">
            {label}
          </span>
        ))}
      </div>
      <div className="tx-cal__grid" role="group" aria-label="날짜 고르기">
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`lead-${i}`} className="tx-cal__blank" aria-hidden="true" />
        ))}
        {dayNumbers.map((day) => {
          const iso = dayIso(month, day);
          const value = numbers.get(iso);

          return (
            <button
              key={iso}
              type="button"
              className={cx(
                'tx-cal__cell',
                iso === selected && 'tx-cal__cell--selected',
                iso === today && 'tx-cal__cell--today',
              )}
              aria-label={dayCellLabel(iso, value)}
              aria-current={iso === selected ? 'date' : undefined}
              onClick={() => onSelect(iso)}
            >
              <span className="tx-cal__day">{day}</span>
              <span className="tx-cal__amounts" aria-hidden="true">
                {value != null && value.expense !== 0 ? (
                  <span className="tx-cal__spend">{formatNumber(value.expense)}</span>
                ) : null}
                {value != null && value.income !== 0 ? (
                  <span className="tx-cal__income">{formatNumber(value.income)}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
