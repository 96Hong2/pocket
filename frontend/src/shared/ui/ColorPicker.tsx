import { useId, type CSSProperties } from 'react';

import type { TagColor } from '../api';
import { TAG_COLORS, TAG_COLOR_NAMES, tagColorVar, tagInkVar } from '../lib/tagColors';

export interface ColorPickerProps {
  value: TagColor | null;
  onChange: (next: TagColor | null) => void;
  disabled?: boolean;
  /**
   * 「색 없음」 을 고를 수 있나.
   *
   * 태그는 색이 곧 그 태그의 얼굴이라 반드시 하나를 고른다. 카테고리는 아이콘이 이미
   * 얼굴이라 색이 없어도 되고, 고른 색을 뗄 길도 있어야 한다.
   */
  clearable?: boolean;
  /** 이 묶음을 무엇이라 부르는지. 옆에 「색」 이라고 적은 글자의 id 를 넘긴다. */
  labelledBy?: string;
}

/**
 * 파스텔 열네 색 중 하나를 고르는 자리.
 *
 * **태그와 카테고리가 이것 하나를 나눠 쓴다.** 두 벌로 두면 한쪽에만 색이 추가되거나
 * 동그라미 크기가 달라져서, 같은 앱 안에서 같은 일을 하는 화면이 서로 달라 보인다.
 * 토스 노출 가이드가 「같은 기능의 버튼과 카드는 색과 모양을 통일하라」 고 하는 자리다.
 *
 * **한 줄에 일곱씩 두 줄이다.** 윗줄이 따뜻한 쪽, 아랫줄이 찬 쪽이라 줄만 봐도 반은
 * 갈린다.
 *
 * **「색 없음」 은 격자 밖에 둔다.** 열네 칸 사이에 끼우면 열다섯이 되어 셋째 줄에 하나만
 * 남고, 따뜻한 줄과 찬 줄이 한 칸씩 밀려 색의 자리를 손이 기억하지 못한다. 게다가 그것은
 * 색이 아니라 **색을 떼는 일**이라, 색들과 같은 모양으로 두면 무엇인지 알기 어렵다.
 */
export function ColorPicker({
  value,
  onChange,
  disabled = false,
  clearable = false,
  labelledBy,
}: ColorPickerProps) {
  const id = useId();

  return (
    <div className="pk-colors-field" role="group" aria-labelledby={labelledBy ?? id}>
      {clearable ? (
        <button
          type="button"
          className="pk-colors__clear"
          aria-pressed={value == null}
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          색 없음
        </button>
      ) : null}

      <div className="pk-colors">
        {TAG_COLORS.map((option) => (
          <button
            key={option}
            type="button"
            className="pk-colors__cell"
            aria-pressed={option === value}
            aria-label={TAG_COLOR_NAMES[option]}
            disabled={disabled}
            style={
              {
                '--tag-color': tagColorVar(option),
                '--tag-ink': tagInkVar(option),
              } as CSSProperties
            }
            onClick={() => onChange(option)}
          >
            <span className="pk-colors__swatch" aria-hidden="true">
              {option === value ? (
                <svg width="14" height="14" viewBox="0 0 16 16">
                  <path
                    d="M3.5 8.5l3 3 6-6.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
