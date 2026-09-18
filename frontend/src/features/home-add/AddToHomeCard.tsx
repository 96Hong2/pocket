import { useState } from 'react';
import { Link } from 'react-router';

import { ROUTES } from '../../app/router/routes';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { Button, CardClose, CategoryAvatar, SageCard } from '../../shared/ui';

import { AddToHomeSheet } from './AddToHomeSheet';

/**
 * 한 번이라도 적어 본 사람에게 홈에 서는 카드.
 *
 * 예전에는 첫 기록을 마친 그 순간 시트가 스스로 열렸다. 그런데 그 한 번을 놓치면 다시
 * 볼 길이 앱 설정뿐이었고, 세 번째 기록에 한 번 더 묻는 장치는 기기에 센 횟수에
 * 기대고 있어서 앱을 다시 깐 사람에게는 영영 안 떴다. **실기기에서 안 떴다.**
 *
 * 그래서 카드로 바꿨다. 카드는 닫을 때까지 그 자리에 있으니 놓칠 수가 없고, 한 번 닫으면
 * 다시 안 뜬다. 판정도 「기록이 하나라도 있나」 하나뿐이라 기기 저장에 기대지 않는다.
 *
 * **두 가지를 같이 권한다.** 홈 화면에 두는 것과 저녁 알림을 켜는 것. 둘 다 "다시 오게"
 * 하는 일이고, 첫 기록을 막 끝낸 사람에게 물을 만한 것이 마침 그 둘이다. 카드를 두 장
 * 세우는 대신 한 장에 담는다.
 */
export function AddToHomeCard({ onDismiss }: { onDismiss: () => void }) {
  const analytics = useAnalytics();
  const [open, setOpen] = useState(false);

  return (
    <>
      <SageCard className="home-card home-add-card" role="group" aria-label="홈 화면에 추가">
        <div className="home-card__head">
          <CategoryAvatar icon="04_home" size={44} />
          <p className="home-card__text">
            <strong>홈 화면에 두면 3초면 열려요</strong>
            <br />
            토스를 열고 찾는 단계가 없어져요
          </p>
          <CardClose
            label="홈 화면 추가 안내 닫기"
            onClick={() => {
              analytics.log(
                EVENTS.homeAddResult,
                { from: 'home_card', result: 'dismissed' },
                { kind: 'click' },
              );
              onDismiss();
            }}
          />
        </div>

        <Button
          variant="primarySmall"
          fullWidth
          onClick={() => {
            analytics.log(
              EVENTS.homeAddResult,
              { from: 'home_card', result: 'opened' },
              { kind: 'click' },
            );
            setOpen(true);
          }}
        >
          홈 화면에 추가하는 법
        </Button>

        {/*
          알림은 우리가 대신 켜 줄 수 없다. 토스 알림 동의를 그 사람이 눌러야 한다.
          그래서 여기서는 어디로 가면 되는지와 **몇 시에 오는지**만 말한다.
          시각을 적어 두면 "언제 올지 모르는 알림" 이 아니게 된다.
        */}
        <Link className="home-add-card__notify" to={ROUTES.notifications}>
          저녁 8시에 알려 드릴까요?
        </Link>

        <p className="home-card__aside">앱 설정에서 언제든 다시 볼 수 있어요</p>
      </SageCard>

      <AddToHomeSheet open={open} onClose={() => setOpen(false)} from="home_card" />
    </>
  );
}
