import { useState } from 'react';

import { useMe, type MeOut } from '../../shared/api';
import { Button, Card, CategoryAvatar, ErrorState, LoadingState } from '../../shared/ui';

import { EmailLinkSheet } from './EmailLinkSheet';
import { ProfileSheet } from './ProfileSheet';
import { describeProfile } from './profileOptions';

/**
 * 내 계정.
 *
 * **로그인이 아니라 「기록 지켜 두기」 다.** 앱은 이미 익명키로 돌고 있어 로그인 없이도 다 된다.
 * 이메일을 붙이는 이유는 둘뿐이다. 기기를 바꿔도 기록을 이어 쓰는 것, 그리고 나중에 이 앱이
 * 토스 밖으로 나가도 사람을 잃지 않는 것. 그래서 여기 말고는 어디서도 묻지 않는다.
 *
 * 비밀번호가 없다. 메일로 온 여섯 자리 코드를 적으면 끝이다.
 */
export function AccountCard() {
  const me = useMe();
  const [linkOpen, setLinkOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  if (me.isError) {
    return (
      <Card padding="md">
        <ErrorState
          size="inline"
          title="계정을 불러오지 못했어요"
          onRetry={() => void me.refetch()}
        />
      </Card>
    );
  }
  if (me.data == null) {
    return (
      <Card padding="md">
        <LoadingState variant="rows" rows={2} label="계정을 불러오는 중이에요" />
      </Card>
    );
  }

  const data = me.data;

  return (
    <div className="account">
      {data.email == null ? (
        <NotLinked available={data.email_login_available} onLink={() => setLinkOpen(true)} />
      ) : (
        <Linked me={data} />
      )}

      {/*
        연령대·성별은 **이메일과 상관없다.** 익명키만으로 보내는 값이고 처음 안내에서 이미
        물었다. 붙인 사람에게만 보여 주면, 안 붙인 사람은 자기가 무엇을 골랐는지 볼 수도
        고칠 수도 없다. 그래서 카드 밖에 따로 세운다.
      */}
      <Card padding="lg" className="account-card">
        <button type="button" className="account-card__row" onClick={() => setProfileOpen(true)}>
          <span className="account-card__row-label">연령대·성별</span>
          <span className="account-card__row-value">{describeProfile(data)}</span>
        </button>
        <p className="account-card__aside">회원가입과 상관없어요. 통계에만 써요</p>
      </Card>

      <EmailLinkSheet
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        // 붙이자마자 연령대·성별을 한 번 묻는다. 아직 안 물었을 때만이고, 건너뛰어도 된다.
        onLinked={(next) => {
          setLinkOpen(false);
          if (!next.profile_asked) setProfileOpen(true);
        }}
      />
      <ProfileSheet open={profileOpen} me={data} onClose={() => setProfileOpen(false)} />
    </div>
  );
}

function NotLinked({ available, onLink }: { available: boolean; onLink: () => void }) {
  return (
    <Card padding="lg" className="account-card">
      <div className="account-card__head">
        <CategoryAvatar icon="57_smartphone" size={48} />
        <div className="account-card__text">
          <h2 className="account-card__title">기록을 지켜 두세요</h2>
          <p className="account-card__lead">
            이메일 하나면 기기를 바꿔도 기록이 따라와요. 비밀번호는 없어요.
          </p>
        </div>
      </div>
      {available ? (
        <Button fullWidth onClick={onLink}>
          이메일로 지켜 두기
        </Button>
      ) : (
        // 운영에 메일 발송 수단이 아직 없다. 눌러 보고 막히는 것보다 먼저 말한다.
        <p className="account-card__note">지금은 준비 중이에요. 곧 열려요.</p>
      )}
      <p className="account-card__aside">안 해도 지금처럼 그대로 쓸 수 있어요</p>
    </Card>
  );
}

function Linked({ me }: { me: MeOut }) {
  return (
    <Card padding="lg" className="account-card">
      <div className="account-card__head">
        <CategoryAvatar icon="57_smartphone" size={48} />
        <div className="account-card__text">
          <h2 className="account-card__title">지켜 두고 있어요</h2>
          <p className="account-card__lead account-card__email">{me.email}</p>
        </div>
      </div>
      <p className="account-card__aside">
        다른 기기에서 같은 이메일로 확인하면 이 기록이 그대로 이어져요
      </p>
    </Card>
  );
}
