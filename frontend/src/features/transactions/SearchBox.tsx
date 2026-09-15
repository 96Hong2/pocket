import { SEARCH_MAX_LENGTH } from '../../shared/lib/limits';

/**
 * 상호·카테고리 검색 입력.
 *
 * 서버가 상호와 카테고리 이름을 함께 보므로 안내 문구도 그렇게 적는다.
 * 문구와 실제 동작이 어긋나면 사용자는 검색이 고장 난 줄로 안다.
 *
 * **상한을 여기서 건다.** 안 걸면 문자로 온 결제 알림을 붙여넣는 순간 서버 상한을 넘겨
 * 422 가 나는데, 그건 재시도 대상이 아니라 「다시 시도」 를 눌러도 같은 오류 카드만 다시 뜬다.
 */
export interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBox({ value, onChange }: SearchBoxProps) {
  return (
    <div className="tx-search">
      <SearchIcon />
      <input
        className="tx-search__input"
        type="search"
        value={value}
        aria-label="기록 검색"
        maxLength={SEARCH_MAX_LENGTH}
        placeholder="상호나 카테고리로 검색"
        onChange={(event) => onChange(event.target.value)}
      />
      {value.length > 0 ? (
        <button
          type="button"
          className="tx-search__clear"
          aria-label="검색어 지우기"
          onClick={() => onChange('')}
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="tx-search__icon">
      <circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 12l3.4 3.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
