/**
 * 홈 카드 오른쪽 위의 닫기.
 *
 * **시트의 X 와는 다른 자리다.** 시트에서 X 를 뺀 것은 그 자리가 토스가 그리는 미니앱
 * 닫기와 겹쳐 앱이 통째로 닫혔기 때문이다. 카드는 화면 안쪽에 있어 그 사고가 없고,
 * 대신 밀어서 닫을 자리도 없다. 여기서는 X 가 유일한 길이다.
 *
 * 그림만 두면 무엇을 닫는지 스크린리더가 모른다. 부르는 쪽이 무슨 카드인지 적어 준다.
 */
export function CardClose({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="pk-card-close" aria-label={label} onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M4 4l8 8M12 4l-8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
