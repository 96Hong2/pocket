import { useState } from 'react';

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
 * **저녁 알림은 이 카드에서 떼어 냈다.** 한 장에 담아 두니 「알림만 켜고 싶다」 는 사람이
 * 홈 추가 안내와 함께 닫아야 했고, 알림 줄은 설정 화면으로 보내기만 해서 거기서 다시
 * 세 걸음을 밟아야 했다. 지금은 아래에 알림 카드가 따로 서고 닫는 ✕ 도 따로다.
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

        <p className="home-card__aside">앱 설정에서 언제든 다시 볼 수 있어요</p>
      </SageCard>

      <AddToHomeSheet open={open} onClose={() => setOpen(false)} from="home_card" />
    </>
  );
}
