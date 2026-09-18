/**
 * 태그. 카테고리와 다른 축으로 기록을 묶는다.
 *
 * 세 자리가 이 폴더를 쓴다: 저장 직후 칩 줄(기록·수정), 관리 화면, 리포트 조각.
 * 색을 정하는 규칙은 `shared/lib/tagColors` 에 있다. 목록 한 줄도 그 색을 쓰는데,
 * shared 가 features 를 가리킬 수는 없기 때문이다.
 */

export { TagBreakdown } from './TagBreakdown';
export { TagForm } from './TagForm';
export { TagManageList } from './TagManageList';
export { TagPicker, type TagPickerProps } from './TagPicker';
