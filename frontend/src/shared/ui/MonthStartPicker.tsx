import { useState, type ReactNode } from 'react';

import { toLedgerDate } from '../lib/format';
import { describePeriod, MAX_START_DAY, periodContaining } from '../lib/monthPeriod';
import { TEST_IDS } from '../testIds';
import { Button } from './Button';

export interface MonthStartPickerProps {
  /** 지금 저장된 시작일. 처음 골라져 있는 칸이다. */
  value: number;
  /** 저장이 도는 중. 칸과 버튼을 잠근다. */
  saving: boolean;
  /** 미리보기와 저장 사이에 서는 실패 한 줄. 부르는 자리의 문구와 옷을 그대로 쓴다. */
  notice?: ReactNode;
  /** 「저장」. 고른 날이 그대로면 부르는 쪽이 닫기만 한다. */
  onSave: (day: number) => void;
}

const DAYS = Array.from({ length: MAX_START_DAY }, (_, index) => index + 1);

/**
 * 한 달 시작일 고르기. 1~28일 칸과 미리보기 한 줄, 저장 버튼이다.
 *
 * 내 가계부와 공유 가계부가 같은 칸, 같은 미리보기를 쓴다. 값을 어디에 저장하나만 다르다.
 * 설명 글 대신 고른 날로 오늘이 든 기간을 한 줄로 보여 준다.
 */
export function MonthStartPicker({ value, saving, notice, onSave }: MonthStartPickerProps) {
  const [picked, setPicked] = useState(value);
  const today = toLedgerDate(new Date());

  return (
    <div className="month-start__body">
      <div className="month-start__grid" role="group" aria-label="시작일">
        {DAYS.map((day) => (
          <button
            key={day}
            type="button"
            className="month-start__day"
            aria-pressed={day === picked}
            aria-label={`${day}일`}
            disabled={saving}
            onClick={() => setPicked(day)}
          >
            {day}
          </button>
        ))}
      </div>

      <p className="month-start__preview" data-testid={TEST_IDS.monthStartPreview}>
        {describePeriod(periodContaining(today, picked))}
      </p>

      {notice}

      <Button fullWidth disabled={saving} onClick={() => onSave(picked)}>
        저장
      </Button>
    </div>
  );
}
