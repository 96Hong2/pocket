import { EVENTS, useAnalytics } from '../../shared/analytics';
import { appLine, ShareButton } from '../share';

import { CardClose } from './CardClose';

/**
 * 앱을 친구에게 알리겠냐고 묻는 자리.
 *
 * **기록 버튼 바로 아래다.** 오늘 할 일을 마친 사람의 눈이 다음으로 가는 곳이고,
 * 더 아래로 내리면 오늘 목록에 묻혀 아무도 안 본다.
 *
 * **몇 번 써 본 사람에게만 뜬다**(`SHARE_AFTER_RECORDS`). 처음 열어 본 사람에게 남에게
 * 알리라고 하면 권유가 아니라 참견이다.
 *
 * **닫을 수 있다.** 닫으면 다시 뜨지 않는다. 앱을 알릴 생각이 없는 사람에게 이 줄이
 * 홈에 영영 남으면, 그 사람에게는 기록 버튼 아래가 늘 광고인 셈이 된다.
 */
export function ShareAppCard({ onDismiss }: { onDismiss: () => void }) {
  const analytics = useAnalytics();

  return (
    <section className="home-share" aria-label="앱 공유">
      <ShareButton
        className="home-share__action"
        kind="app"
        where="home"
        label="10초 가계부 친구에게 공유하기"
        message={appLine()}
      />
      <CardClose
        label="공유 안내 닫기"
        onClick={() => {
          analytics.log(EVENTS.shareCardDismissed, { where: 'home' }, { kind: 'click' });
          onDismiss();
        }}
      />
    </section>
  );
}
