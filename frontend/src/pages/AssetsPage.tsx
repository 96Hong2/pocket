import { IdentityNotice } from '../app/IdentityNotice';
import { AssetsBoard } from '../features/assets';

/**
 * 자산. 계좌를 연결하지 않고 대략 얼마인지만 적어 순자산을 본다.
 *
 * **들어올 때 전면 광고를 띄우지 않는다.** 배너는 본문 안, 캡처 입구와 그룹 사이 한 자리다.
 */
export default function AssetsPage() {
  return (
    <div className="page assets-page">
      <h1 className="page__title">자산</h1>

      {/* 식별키를 못 받으면 조회가 시작조차 안 한다. 이 안내가 없으면 목록이 계속 회색이다. */}
      <IdentityNotice />

      <AssetsBoard />
    </div>
  );
}
