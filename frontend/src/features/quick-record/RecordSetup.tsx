import type { KeyboardEvent, ReactNode } from 'react';

import { Button, iconUrl, type IconName } from '../../shared/ui';

import { wayHasKinds, type RecordTab } from './recordTab';

/**
 * 기록의 종류. 지출과 수입은 분류가 있고, 이체는 분류 없이 금액만 적는다.
 * 저축·투자는 분류 자리에 「어디에」 를 고르고 서버에는 이체로 적힌다.
 */
export type RecordKind = 'expense' | 'income' | 'transfer' | 'save';

const WAYS: { value: RecordTab; label: string; icon: IconName; cta: string }[] = [
  { value: 'keypad', label: '직접 입력', icon: '01_coins', cta: '다음' },
  { value: 'receipt', label: '영수증 찍기', icon: '43_camera', cta: '카메라 열기' },
  { value: 'capture', label: '캡처로 정리', icon: '57_smartphone', cta: '사진 고르기' },
  { value: 'nl', label: '글로 쓰기', icon: '23_document', cta: '다음' },
];

const KINDS: { value: RecordKind; label: string; icon: IconName }[] = [
  { value: 'expense', label: '지출', icon: '34_shopping_cart' },
  { value: 'income', label: '수입', icon: '28_cash' },
  { value: 'transfer', label: '이체', icon: '05_choice_arrows' },
  { value: 'save', label: '저축·투자', icon: '32_piggybank' },
];

/** 이 방법을 고른 첫 화면의 아래 버튼 글자. */
function setupCtaOf(way: RecordTab): string {
  return WAYS.find((item) => item.value === way)?.cta ?? '다음';
}

/**
 * 라디오 묶음의 화살표 키. 꺼진 칸은 건너뛰고, 끝에서 처음으로 돈다.
 * 고른 칸으로 초점도 함께 옮긴다.
 */
function moveOnArrow<T extends string>(
  event: KeyboardEvent<HTMLDivElement>,
  values: readonly T[],
  current: T,
  isOff: (value: T) => boolean,
  pick: (value: T) => void,
): void {
  const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
  const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
  if (!forward && !backward) return;
  event.preventDefault();
  const step = forward ? 1 : -1;
  const start = values.indexOf(current);
  const radios = event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]');
  for (let offset = 1; offset <= values.length; offset += 1) {
    const index = (((start + step * offset) % values.length) + values.length) % values.length;
    if (isOff(values[index])) continue;
    pick(values[index]);
    radios[index]?.focus();
    return;
  }
}

export interface RecordSetupProps {
  /** 날짜 앞에 붙는 말(오늘, 어제, 그저께). 그 밖의 날은 없다. */
  dayWord: string | null;
  /** `10월 5일 (일)` */
  dayLabel: string;
  way: RecordTab;
  kind: RecordKind;
  /** 우리 집 가계부에 적는 중이면 지출만 고를 수 있다. */
  expenseOnly: boolean;
  /** 적을 곳 줄. 공유 가계부가 없으면 비어 있다. */
  destination?: ReactNode;
  /** 사진 방법일 때 아래 버튼 바로 밑에 서는 광고 예고 줄. */
  photoNote?: ReactNode;
  onOpenDay: () => void;
  onWayChange: (way: RecordTab) => void;
  onKindChange: (kind: RecordKind) => void;
  onNext: () => void;
}

/**
 * 기록 시트의 첫 화면. 언제, 어디에, 어떻게, 무엇을 적을지 고른다.
 *
 * 처음 값이 이미 골라져 있어 대부분은 「다음」 한 번으로 지나간다.
 */
export function RecordSetup({
  dayWord,
  dayLabel,
  way,
  kind,
  expenseOnly,
  destination,
  photoNote,
  onOpenDay,
  onWayChange,
  onKindChange,
  onNext,
}: RecordSetupProps) {
  const kindOff = (value: RecordKind) => expenseOnly && value !== 'expense';
  const photo = way === 'capture' || way === 'receipt';

  return (
    <div className="record-setup" data-record-step="">
      <div className="record-setup__head">
        <button type="button" className="record-setup__date" onClick={onOpenDay}>
          {dayWord == null ? null : <span className="record-setup__day-word">{dayWord}</span>}{' '}
          {dayLabel}
          <span className="record-setup__caret" aria-hidden="true">
            ▾
          </span>
        </button>
      </div>

      {destination}

      <div
        className="record-ways"
        role="radiogroup"
        aria-label="기록 방법"
        onKeyDown={(event) =>
          moveOnArrow(
            event,
            WAYS.map((item) => item.value),
            way,
            () => false,
            onWayChange,
          )
        }
      >
        {WAYS.map((item) => {
          const checked = item.value === way;
          return (
            <button
              key={item.value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              className="record-ways__item"
              onClick={() => onWayChange(item.value)}
            >
              <img className="record-ways__icon" src={iconUrl(item.icon)} alt="" aria-hidden="true" />
              <span className="record-ways__name">{item.label}</span>
            </button>
          );
        })}
      </div>

      {wayHasKinds(way) ? (
        <div
          className="record-kinds"
          role="radiogroup"
          aria-label="종류"
          onKeyDown={(event) =>
            moveOnArrow(
              event,
              KINDS.map((item) => item.value),
              kind,
              kindOff,
              onKindChange,
            )
          }
        >
          {KINDS.map((item) => {
            const checked = item.value === kind;
            return (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                className="record-kinds__item"
                disabled={kindOff(item.value)}
                onClick={() => onKindChange(item.value)}
              >
                <img
                  className="record-kinds__icon"
                  src={iconUrl(item.icon)}
                  alt=""
                  aria-hidden="true"
                />
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <Button className="record-setup__cta" fullWidth onClick={onNext}>
        {setupCtaOf(way)}
      </Button>
      {photo ? photoNote : null}
    </div>
  );
}
