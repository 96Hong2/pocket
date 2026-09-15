import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { useBridge } from '../../app/providers';
import { ROUTES } from '../../app/router/routes';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { useMe } from '../../shared/api';
import { peekVisit } from '../../shared/lib/visitLog';
import { Card } from '../../shared/ui';

/** 이 기기에서 한 번 닫으면 다시 안 띄운다. 같은 말을 두 번 하면 그때부터 잔소리다. */
const DISMISSED_KEY = 'keep-data-dismissed';

/**
 * 「기록을 지켜 두세요」 한 줄.
 *
 * 「내 계정」 은 관리 탭 목록 안에 있어 아무도 스스로 들어가지 않는다. 그런데 정작 그 자리가
 * 필요한 사람은 **이미 쌓아 둔 것이 있는 사람**이다. 기기를 바꾸면 그게 다 사라진다.
 *
 * 그래서 조건을 좁게 건다. 네 가지가 다 맞을 때만 뜬다.
 *
 * 1. 아직 이메일을 안 붙였다
 * 2. **메일을 보낼 수단이 운영에 붙어 있다.** 없으면 눌러 봐야 「준비 중」 이라 보내면 안 된다
 * 3. **세 번 넘게 연 사람이다.** 처음 온 사람에게 가입을 말하면 그 순간 가입해야 쓰는 앱이 된다
 * 4. 이 기기에서 아직 안 닫았다
 *
 * 홈에는 두지 않는다. 홈은 적는 자리다.
 */
export function KeepDataCard() {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const me = useMe();
  /** 아직 모르는 동안은 `null`. 먼저 그렸다 지우면 관리 탭이 깜빡인다. */
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [dismissed, visit] = await Promise.all([
        bridge.storage.get(DISMISSED_KEY).catch(() => null),
        peekVisit(bridge.storage, new Date()).catch(() => null),
      ]);
      if (!alive) return;
      const enough = visit != null && visit.openBucket !== '1' && visit.openBucket !== '2';
      setReady(dismissed == null && enough);
    })();
    return () => {
      alive = false;
    };
  }, [bridge]);

  if (ready !== true) return null;
  if (me.data == null || me.data.email != null || !me.data.email_login_available) return null;

  function dismiss(): void {
    setReady(false);
    void bridge.storage.set(DISMISSED_KEY, '1').catch(() => undefined);
    analytics.log(EVENTS.accountLinkResult, { result: 'prompt_dismissed' }, { kind: 'click' });
  }

  return (
    <Card padding="md" className="keep-data">
      <div className="keep-data__text">
        <p className="keep-data__title">기록을 지켜 두세요</p>
        <p className="keep-data__body">
          지금은 이 기기에만 있어요. 이메일 하나면 기기를 바꿔도 따라와요
        </p>
      </div>
      <div className="keep-data__actions">
        <Link
          className="keep-data__go"
          to={ROUTES.account}
          onClick={() =>
            analytics.log(EVENTS.accountLinkResult, { result: 'prompt_opened' }, { kind: 'click' })
          }
        >
          지켜 두기
        </Link>
        <button type="button" className="keep-data__close" onClick={dismiss}>
          안 할래요
        </button>
      </div>
    </Card>
  );
}
