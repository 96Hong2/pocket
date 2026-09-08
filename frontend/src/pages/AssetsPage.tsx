import { IdentityNotice } from '../app/IdentityNotice';
import { AssetsBoard } from '../features/assets';

/** 자산. 계좌를 연결하지 않고 대략 얼마인지만 적어 순자산을 본다. */
export default function AssetsPage() {
  return (
    <div className="page">
      <h1 className="page__title">자산</h1>
      <p className="page__lead">
        대략 알아도 충분해요. 나중에 언제든 바꿀 수 있어요. <br />
        계좌 연결이나 정확한 숫자는 필요 없어요.
      </p>

      {/* 식별키를 못 받으면 조회가 시작조차 안 한다. 이 안내가 없으면 목록이 계속 회색이다. */}
      <IdentityNotice />

      <AssetsBoard />
    </div>
  );
}
