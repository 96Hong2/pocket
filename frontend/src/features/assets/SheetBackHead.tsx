/** 창 맨 위 왼쪽 ‹ 와 제목. ‹ 는 한 화면 뒤로, 첫 화면이면 창을 닫는다. */
export function SheetBackHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="asset-sheet-head">
      <button type="button" className="asset-sheet-head__back" aria-label="뒤로" onClick={onBack}>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <h2 className="asset-sheet-head__title">{title}</h2>
    </div>
  );
}
