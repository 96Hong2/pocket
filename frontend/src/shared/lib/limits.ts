/**
 * 화면이 거는 입력 상한.
 *
 * **서버 스키마와 같은 값이어야 한다.** 화면이 더 넉넉하면 사용자가 넣을 수 있는 값이
 * 서버에서 422 가 되고, 그 오류는 재시도 대상이 아니라 「다시 시도」 를 눌러도 안 풀린다.
 * 실제로 검색칸이 그랬다. 값을 고칠 때는 아래 적힌 서버 자리도 함께 고친다.
 */

/** 상호. `backend/app/modules/transactions/schemas.py` · `merchant_rules/schemas.py` */
export const MERCHANT_MAX_LENGTH = 120;

/** 검색어. `backend/app/modules/transactions/service.py` 의 SEARCH_MAX_LENGTH */
export const SEARCH_MAX_LENGTH = 120;

/** 줄글. `backend/app/modules/imports/schemas.py` 의 MAX_TEXT_LENGTH */
export const NL_TEXT_MAX_LENGTH = 2000;

/** 분류 이름. `backend/app/modules/categories/schemas.py` 의 CategoryName */
export const CATEGORY_NAME_MAX_LENGTH = 40;

/** 목표 이름. `backend/app/modules/goals/schemas.py` 의 MAX_TITLE */
export const GOAL_TITLE_MAX_LENGTH = 60;

/** 자산 항목 이름. `backend/app/modules/assets/schemas.py` 의 MAX_LABEL */
export const ASSET_LABEL_MAX_LENGTH = 80;

/** 자산 항목 개수. `backend/app/modules/assets/schemas.py` 의 MAX_ITEMS */
export const ASSET_ITEM_MAX_COUNT = 40;

/**
 * 날짜 칸이 받는 범위. 서버 `backend/app/api/months.py` 의 MIN_YEAR·MAX_YEAR 와 같다.
 *
 * 없으면 `0202` 같은 연도 오타가 칸을 그냥 지나가 저장 단계에서야 422 로 돌아온다.
 */
export const DAY_MIN = '2000-01-01';
export const DAY_MAX = '2100-12-31';

/**
 * 날짜 칸이 받을 수 있는 값인가.
 *
 * `min`·`max` 만으로는 모자란다. 크롬은 범위를 벗어난 값도 칸에 그대로 두고 폼 검사에서만
 * 잡는데, 이 앱은 폼 제출을 쓰지 않는다. 실제로 `0202-12-31` 이 그대로 저장돼
 * 목표 카드에 「202년 12월 31일이 지났어요」 라고 떴다.
 *
 * 빈 값은 「안 골랐다」 라서 참이다. 고를지 말지는 부르는 쪽이 정한다.
 */
export function isDayInRange(day: string): boolean {
  if (day === '') return true;
  return day >= DAY_MIN && day <= DAY_MAX;
}
