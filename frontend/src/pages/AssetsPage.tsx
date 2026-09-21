import { IdentityNotice } from '../app/IdentityNotice';
import { AdSlot } from '../features/ads';
import { AssetsBoard } from '../features/assets';

/**
 * 자산. 계좌를 연결하지 않고 대략 얼마인지만 적어 순자산을 본다.
 *
 * **들어올 때 전면 광고를 띄우지 않는다.** 예전에는 한 세션에 한 편이 섰는데, 탭을 누른
 * 것 말고는 아무것도 안 한 사람에게 화면 대신 광고가 뜨는 자리였다. 광고를 부른 적이
 * 없으니 예고할 자리도 없다. 목록 아래 배너는 그대로 둔다. 그쪽은 화면을 가리지 않는다.
 */
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

      {/* 목록 맨 아래. 자산을 적는 흐름을 끊지 않는 자리다. */}
      <AdSlot placement="assets" />
    </div>
  );
}
