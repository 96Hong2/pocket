import { useNavigate } from 'react-router';

import { ROUTES } from '../../app/router/routes';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { Button, CardClose, CategoryAvatar, SageCard } from '../../shared/ui';

/**
 * 같이 쓰는 가계부가 생긴 것을 알리는 카드.
 *
 * 입구는 관리 탭 맨 위에 있지만, 원래 쓰던 사람은 관리 탭을 새로 열어 보지 않는다.
 * 기록하러 들어온 홈에서 한 번 알리고, **버튼 하나로 만들기 화면까지 바로 보낸다.**
 *
 * **한 번뿐이다.** 닫으면 다시 안 뜨고, 눌러서 만들기 화면을 열어 봤어도 할 일을 다 한 것으로 본다.
 * 가계부를 만들거나 초대를 받아 들어간 사람에게는 처음부터 안 뜬다.
 */
export function BooksIntroCard({
  onDismiss,
  onOpen,
}: {
  onDismiss: () => void;
  /** 만들기로 간다. 이 카드는 다시 안 뜬다. */
  onOpen: () => void;
}) {
  const analytics = useAnalytics();
  const navigate = useNavigate();

  return (
    <SageCard className="home-card books-intro-card" role="group" aria-label="같이 쓰는 가계부 안내">
      <div className="home-card__head">
        <CategoryAvatar icon="59_people" size={44} />
        <p className="home-card__text">
          <strong>같이 쓰는 가계부가 생겼어요</strong>
          <br />
          연인, 가족, 룸메이트와 한 가계부에 같이 적어요
        </p>
        <CardClose
          label="같이 쓰는 가계부 안내 닫기"
          onClick={() => {
            analytics.log(EVENTS.booksIntroResult, { result: 'dismissed' }, { kind: 'click' });
            onDismiss();
          }}
        />
      </div>

      <Button
        variant="primarySmall"
        fullWidth
        onClick={() => {
          analytics.log(EVENTS.booksIntroResult, { result: 'opened' }, { kind: 'click' });
          onOpen();
          navigate(ROUTES.bookNew);
        }}
      >
        같이 쓰는 가계부 만들기
      </Button>
    </SageCard>
  );
}
