import { useRef, useState } from 'react';

import { useBridge } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { Button, CardClose, CategoryAvatar, SageCard } from '../../shared/ui';

/**
 * 별점을 남기겠냐고 묻는 카드.
 *
 * **스무 번 넘게 적은 사람에게만 뜬다**(`RATING_AFTER_RECORDS`). 평점은 토스가 이 앱을
 * 더 보여 줄지 정할 때 보는 값 중 하나인데, 두어 번 눌러 본 사람에게 물으면 좋은 점수를
 * 얻자고 아직 모르는 사람을 붙잡는 셈이 된다. 스무 번을 적은 사람은 이 앱을 계속 쓰기로
 * 한 사람이고, 그 사람의 한 줄이 실제로 맞는 말이다.
 *
 * **못 뜨는 토스 버전에서는 카드 자체를 안 그린다.** 눌러도 아무 일이 안 일어나는 버튼을
 * 홈에 세우면, 이 앱이 고장 난 것으로 기억된다.
 *
 * **한 번 물으면 끝이다.** 눌렀든 닫았든 다시 안 뜬다. 별점을 실제로 남겼는지 토스가
 * 알려 주지 않아서, 「아직 안 남겼으니 한 번 더」 를 판단할 근거가 우리에게 없다.
 * 근거 없이 다시 묻는 카드는 잔소리가 된다.
 */
export function ReviewAskCard({ onDismiss }: { onDismiss: () => void }) {
  const bridge = useBridge();
  const analytics = useAnalytics();
  // 창을 여는 동안 두 번 눌리면 창이 겹친다.
  const [busy, setBusy] = useState(false);
  /*
    이미 한 번 답했나.

    창이 뜨는 동안에도 ✕ 는 눌린다. 그때 로그가 둘(`dismissed` + `opened`) 남으면
    「물어본 수」 보다 「누른 수」 가 많아지는 줄이 생긴다.
  */
  const answered = useRef(false);

  async function ask(): Promise<void> {
    if (answered.current) return;
    answered.current = true;
    setBusy(true);
    try {
      await bridge.requestReview();
      analytics.log(EVENTS.ratingAsked, { result: 'opened' }, { kind: 'click' });
    } catch {
      /*
        창이 안 떴다. 여기서 오류 문구를 띄우지 않는다. 사용자가 부탁한 일이 아니라
        우리가 권한 일이라, 실패를 사용자 앞에 늘어놓을 이유가 없다. 로그로만 남긴다.
      */
      analytics.log(EVENTS.ratingAsked, { result: 'failed' }, { kind: 'click' });
    } finally {
      setBusy(false);
      // 눌렀으면 어느 쪽이든 카드를 접는다. 다시 물을 근거가 없다.
      onDismiss();
    }
  }

  return (
    <SageCard className="home-card" role="group" aria-label="별점 남기기">
      <div className="home-card__head">
        <CategoryAvatar icon="26_sparkles" size={44} />
        <p className="home-card__text">
          <strong>여기까지 이어서 적으셨네요</strong>
          <br />한 줄 남겨 주시면 다음 사람이 찾아와요
        </p>
        <CardClose
          label="별점 안내 닫기"
          onClick={() => {
            if (!answered.current) {
              answered.current = true;
              analytics.log(EVENTS.ratingAsked, { result: 'dismissed' }, { kind: 'click' });
            }
            onDismiss();
          }}
        />
      </div>

      <Button variant="primarySmall" fullWidth disabled={busy} onClick={() => void ask()}>
        별점 남기기
      </Button>

      {/* 닫기 옆이 아니라 버튼 아래다. 닫으려다 눈이 지나가는 자리가 여기다. */}
      <p className="home-card__aside">토스 앱이 띄우는 창이라 여기서 나가지 않아요</p>
    </SageCard>
  );
}
