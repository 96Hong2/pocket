import { IdentityNotice } from '../app/IdentityNotice';
import { TagManageList } from '../features/tags';

/**
 * 태그 관리.
 *
 * 카테고리와 따로 둔다. 한 화면에 섞으면 「무엇에 썼나」 와 「어떤 묶음인가」 가
 * 같은 것처럼 보이고, 둘 다 만들어야 하는 줄 안다. 태그는 안 만들어도 되는 것이다.
 */
export default function TagsPage() {
  return (
    <div className="page">
      <h1 className="page__title">태그</h1>
      <p className="page__lead tags-page__lead">
        카테고리와는 별개로 통계가 나와요. 「정산완료」 「데이트」 처럼요
      </p>

      {/* 식별키를 못 받으면 조회가 시작조차 안 한다. 이 안내가 없으면 목록이 계속 회색이다. */}
      <IdentityNotice />

      <TagManageList />
    </div>
  );
}
