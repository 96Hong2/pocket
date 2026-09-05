import { IdentityNotice } from '../app/IdentityNotice';
import { CategoryManageList } from '../features/categories';

/** 카테고리 관리. 기본 카테고리를 보고, 내가 만든 것만 손본다. */
export default function CategoriesPage() {
  return (
    <div className="page">
      <h1 className="page__title">카테고리 관리</h1>
      <p className="page__lead">내가 쓰는 카테고리만 남겨요</p>

      {/* 식별키를 못 받으면 조회가 시작조차 안 한다. 이 안내가 없으면 목록이 계속 회색이다. */}
      <IdentityNotice />

      <CategoryManageList />
    </div>
  );
}
