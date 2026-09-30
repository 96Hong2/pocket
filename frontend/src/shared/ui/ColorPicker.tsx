import type { CSSProperties } from 'react';

import type { TagColor } from '../api';
import { TAG_COLORS, TAG_COLOR_NAMES, tagColorVar, tagInkVar, tagTintVar } from '../lib/tagColors';

export interface ColorPickerProps {
  value: TagColor | null;
  onChange: (next: TagColor) => void;
  disabled?: boolean;
  /**
   * 동그라미를 어느 쪽 색으로 칠하나.
   *
   * 태그는 칩 바탕인 파스텔 그대로(`tag`), 분류는 동그라미 바탕인 옅은 쪽(`category`)이다.
   * 고르는 칸이 실제로 깔릴 색과 달라 보이면 고른 뒤에 「이 색이 아닌데」 가 된다.
   */
  tone?: 'tag' | 'category';
  /** 이 묶음을 무엇이라 부르는지. 옆에 「색」 이라고 적은 글자의 id 를 넘긴다. */
  labelledBy?: string;
}

/**
 * 열네 색 중 하나를 고르는 자리.
 *
 * **태그와 카테고리가 이것 하나를 나눠 쓴다.** 두 벌로 두면 한쪽에만 색이 추가되거나
 * 동그라미 크기가 달라져서, 같은 앱 안에서 같은 일을 하는 화면이 서로 달라 보인다.
 * 토스 노출 가이드가 「같은 기능의 버튼과 카드는 색과 모양을 통일하라」 고 하는 자리다.
 *
 * **한 줄에 일곱씩 두 줄이다.** 윗줄이 따뜻한 쪽, 아랫줄이 찬 쪽이라 줄만 봐도 반은
 * 갈린다.
 *
 * 분류의 「기본색」(색 떼기)은 여기 없다. 색이 아니라 하는 일이라 칸 사이에 끼우지 않고,
 * 분류 시트가 「색」 글자와 같은 줄 오른쪽에 둔다.
 */
export function ColorPicker({
  value,
  onChange,
  disabled = false,
  tone = 'tag',
  labelledBy,
}: ColorPickerProps) {
  const paint = tone === 'category' ? tagTintVar : tagColorVar;

  return (
    <div
      className={tone === 'category' ? 'pk-colors pk-colors--tint' : 'pk-colors'}
      role="group"
      aria-labelledby={labelledBy}
    >
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
              '--tag-color': paint(option),
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
  );
}
