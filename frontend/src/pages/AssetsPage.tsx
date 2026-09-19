import { useEffect } from 'react';

import { IdentityNotice } from '../app/IdentityNotice';
import { AdSlot, useInterstitial } from '../features/ads';
import { AssetsBoard } from '../features/assets';

/**
 * 자산. 계좌를 연결하지 않고 대략 얼마인지만 적어 순자산을 본다.
 *
 * **들어올 때 전면 광고 한 편이 선다.** 부가기능이라 자주 열지 않고, 기록하는 흐름과
 * 떨어져 있어 잠깐 멈춰도 되는 자리다. 한 세션에 한 번만 묻는다. 탭을 오갈 때마다
 * 물으면 자산을 두 번 보러 온 사람이 그때마다 걸린다.
 */
export default function AssetsPage() {
  // 객체가 아니라 함수만 받는다. 객체는 광고가 뜨는 동안 새로 만들어져서, 그걸 의존성에
  // 걸면 이 효과가 한 번 더 돈다.
  const { show } = useInterstitial();

  useEffect(() => {
    // 화면은 광고를 기다리지 않는다. 뒤에서 뜨고, 닫히면 이 화면이 그대로 있다.
    void show('assets', { oncePerSession: true });
  }, [show]);

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
