/**
 * 달력으로 가는 자리에 서는 그림.
 *
 * 아이콘 자산(png)이 아니라 선으로 그린다. 이 자리는 글자 크기에 맞춰 작게 놓이는데
 * png 를 줄이면 흐려지고, 색도 토큰을 따라가지 못한다.
 *
 * **입구가 둘이라 여기 하나만 둔다.** 홈 히어로 옆과 리포트 제목 줄 오른쪽이다.
 * 각자 그리면 같은 곳으로 가는 버튼이 서로 다르게 생긴다(실제로 그랬다).
 * 테두리와 크기는 `.pk-cal-btn` 이 갖는다(`shared/ui/ui.css`).
 */
export function CalendarGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect
        x="2"
        y="4"
        width="16"
        height="14"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <line x1="2" y1="8.5" x2="18" y2="8.5" stroke="currentColor" strokeWidth="1.8" />
      <line
        x1="6.5"
        y1="2"
        x2="6.5"
        y2="5.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <line
        x1="13.5"
        y1="2"
        x2="13.5"
        y2="5.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="7" cy="12.5" r="1.3" fill="currentColor" />
      <circle cx="11" cy="12.5" r="1.3" fill="currentColor" opacity="0.45" />
      <circle cx="15" cy="12.5" r="1.3" fill="currentColor" opacity="0.45" />
    </svg>
  );
}
