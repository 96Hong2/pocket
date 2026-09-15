import { useState } from 'react';

import { useMe, type MeOut } from '../../shared/api';
import { Button, Card, CategoryAvatar, ErrorState, LoadingState } from '../../shared/ui';

import { EmailLinkSheet } from './EmailLinkSheet';

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
        **연령대·성별은 여기 안 세운다.** 처음 안내에서 한 번 묻고 끝이다.

        이 화면은 「기록을 지켜 두기」 하나만 하는 자리다. 통계용으로 받아 둔 값을 굳이
        다시 보여 주면, 가입과 상관없다고 적어 놔도 계정에 딸린 개인정보로 읽힌다.
        고칠 일이 거의 없는 값을 위해 이 화면을 두 가지 이야기로 만들 이유가 없다.
      */}

      <EmailLinkSheet open={linkOpen} onClose={() => setLinkOpen(false)} onLinked={() => setLinkOpen(false)} />
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
