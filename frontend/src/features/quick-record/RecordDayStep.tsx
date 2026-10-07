import { shiftDay } from '../../shared/lib/format';
import { DAY_MAX } from '../../shared/lib/limits';
import { CalendarGlyph, SheetHeader } from '../../shared/ui';

import { NEAR_DAYS, dayWithWeekday } from './recordLabels';

export interface RecordDayStepProps {
  /** 지금 골라 둔 날. */
  value: string;
  today: string;
  /** 고를 수 있는 가장 옛날. */
  oldest: string;
  onPick: (day: string) => void;
}

/**
 * 「언제예요?」. 가까운 사흘은 한 번 눌러 고르고, 그 밖의 날은 기기 달력으로 고른다.
 *
 * 달력은 「다른 날 고르기」 줄 위에 투명하게 겹친 날짜 칸이 연다. 기기가 그리는 달력을
 * 그대로 쓰면서 칸의 숫자 형식은 안 보이게 하는 방법이다. 앞날은 막지 않고 저장할 때 묻는다.
 */
export function RecordDayStep({ value, today, oldest, onPick }: RecordDayStepProps) {
  const near = NEAR_DAYS.map((item) => ({ ...item, day: shiftDay(today, item.delta) }));
  const other = !near.some((item) => item.day === value);

  return (
    <div className="record-day" data-record-step="">
      <SheetHeader title="언제예요?" />
      <div className="record-day__list">
        {near.map((item) => (
          <button
            key={item.day}
            type="button"
            className="record-day__row"
            aria-pressed={item.day === value}
            onClick={() => onPick(item.day)}
          >
            <span className="record-day__name">{item.word}</span>
            <span className="record-day__date">{dayWithWeekday(item.day)}</span>
          </button>
        ))}
        <span className="record-day__row record-day__row--other" data-picked={other ? '' : undefined}>
          {/* display:none 으로 감추면 기기 달력이 안 열린다. 투명하게만 둔다. */}
          <input
            className="record-day__input"
            type="date"
            aria-label="다른 날 고르기"
            value={value}
            min={oldest}
            max={DAY_MAX}
            onChange={(event) => {
              // 달력을 열었다 비운 채로 닫는 기기가 있다. 그때는 아무것도 바꾸지 않는다.
              if (event.target.value !== '') onPick(event.target.value);
            }}
          />
          <span className="record-day__icon" aria-hidden="true">
            <CalendarGlyph />
          </span>
          <span className="record-day__name">다른 날 고르기</span>
          {other ? <span className="record-day__date">{dayWithWeekday(value)}</span> : null}
        </span>
      </div>
    </div>
  );
}
