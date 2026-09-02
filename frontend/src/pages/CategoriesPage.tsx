import { Placeholder } from './Placeholder';

/** 카테고리 관리. 이름·아이콘·표시 순서를 바꾼다. */
export default function CategoriesPage() {
  return (
    <div className="page">
      <h1 className="page__title">카테고리 관리</h1>
      <p className="page__lead">쓰는 분류만 남겨요</p>

      <Placeholder label="카테고리 목록">기본 카테고리와 직접 만든 것이 함께 나온다.</Placeholder>
    </div>
  );
}
