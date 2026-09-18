import { useState } from 'react';
import { Link } from 'react-router';

import { ROUTES } from '../../app/router/routes';
import { useNotificationSettings } from '../../shared/api';
import { Button, CardClose, CategoryAvatar, SageCard } from '../../shared/ui';

import { REMIND_AT_DEFAULT, REMIND_BLOCKER_NOTICE, useRemindOptIn } from './useRemindOptIn';

/** `20:00` → `저녁 8시` */
const DEFAULT_LABEL = '저녁 8시';

/**
 * 홈에서 저녁 알림을 **그 자리에서** 켜는 카드.
 *
 * 예전에는 홈 화면 추가 카드 안에 「저녁 8시에 알려 드릴까요?」 라는 줄 하나로 얹혀
 * 있었다. 그 줄은 알림 설정 화면으로 보내기만 했고, 거기서 토글을 찾아 켜고 시간을
 * 확인하는 세 걸음이 더 있었다. **켤 사람은 한 번에 켜지게 한다.**
 *
 * 시각은 묻지 않고 저녁 8시로 정해 켠다. 하루 지출이 거의 끝났고 아직 잠들기 전이라
 * 대부분에게 맞는 시각이고, 바꾸고 싶은 사람은 아래 줄로 알림 설정에 간다.
 * 고를 것을 하나 두면 그 자리에서 고민이 시작돼 아무도 안 켠다.
 *
 * 홈 화면 추가와 **다른 카드**다. 하나는 앱을 찾기 쉽게 하는 일이고 하나는 우리가
 * 부르는 일이라, 하나만 하고 싶은 사람이 나머지 하나를 같이 닫게 두지 않는다.
 */
export function RemindCard({ onDismiss }: { onDismiss: () => void }) {
  const settings = useNotificationSettings();
  const remind = useRemindOptIn('home_card');
  // 방금 켰다. 카드가 바로 사라지면 눌린 것인지 알 수 없어 한 줄로 답한다.
  const [justOn, setJustOn] = useState(false);

  // 못 쓰는 환경이면 아예 안 세운다. 켤 수 없는 버튼을 권유로 세우지 않는다.
  if (!remind.supported) return null;
  // 이미 켜 둔 사람에게 다시 묻지 않는다. 아직 모르는 동안에도 안 세운다.
  if (settings.data == null || (settings.data.is_enabled && !justOn)) return null;

  return (
    <SageCard className="home-card remind-card" role="group" aria-label="저녁 알림">
      <div className="home-card__head">
        <CategoryAvatar icon="30_bell" size={44} />
        <p className="home-card__text">
          {justOn ? (
            <>
              <strong>{DEFAULT_LABEL}에 알려 드릴게요</strong>
              <br />
              하루 한 번이에요
            </>
          ) : (
            <>
              <strong>{DEFAULT_LABEL}에 알려 드릴까요?</strong>
              <br />
              적는 걸 잊어도 하루 한 번 떠올려 드려요
            </>
          )}
        </p>
        <CardClose label="저녁 알림 안내 닫기" onClick={onDismiss} />
      </div>

      {justOn ? null : (
        <Button
          variant="primarySmall"
          fullWidth
          disabled={remind.busy || remind.blocker === 'rejected'}
          onClick={() => {
            void remind.turnOn(REMIND_AT_DEFAULT).then((on) => setJustOn(on));
          }}
        >
          {DEFAULT_LABEL} 알림 받기
        </Button>
      )}

      {remind.blocker != null && remind.blocker !== 'unsupported' ? (
        <p className="home-card__error" role="alert">
          {REMIND_BLOCKER_NOTICE[remind.blocker]}
        </p>
      ) : null}

      <Link className="remind-card__settings" to={ROUTES.notifications}>
        {justOn ? '시간 바꾸기' : '다른 시간으로 받기'}
      </Link>
    </SageCard>
  );
}
