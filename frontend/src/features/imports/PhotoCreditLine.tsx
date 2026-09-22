import type { ReactNode } from 'react';

import { Button } from '../../shared/ui';

import { DAILY_FREE } from './photoCredits';
import type { PhotoCreditsHandle } from './usePhotoCredits';

/** 날마다 채워진다는 한 줄. 두 상태가 같은 말을 써야 셈을 한 번만 배운다. */
const REFILL_NOTE = `사진은 매일 ${DAILY_FREE}장까지 채워져요`;

/**
 * 사진 버튼 아래 한 줄. 남은 장수와, 한 장 더 모으는 길.
 *
 * **평소에는 권하지 않는다.** 남은 장수를 먼저 적고 모으기는 그 뒤에 작게 둔다.
 * 아직 쓸 수 있는 사람에게 광고를 먼저 들이밀면 그 줄이 안내가 아니라 광고가 된다.
 */
export function PhotoCreditLine({ credits }: { credits: PhotoCreditsHandle }) {
  if (credits.left == null) return null;
  return (
    <p className="capture__credit">
      <span>사진 {credits.left}장 남음</span>
      {credits.canEarn ? (
        <>
          {' · '}
          <button
            type="button"
            className="capture__earn"
            disabled={credits.busy}
            onClick={() => void credits.earnOne()}
          >
            {/*
              **여기서도 광고라고 먼저 말한다.** 「한 장 더 모으기」 라고만 적으면 눌렀을 때
              광고가 뜨는 것을 못 듣고 누른 셈이 된다. 짧아도 광고라는 말이 들어가야 예고다.
            */}
            {credits.busy ? '광고를 불러오는 중이에요' : '광고 보고 한 장 더'}
          </button>
        </>
      ) : null}
    </p>
  );
}

/**
 * 다 쓴 사람에게 보이는 자리.
 *
 * **막다른 길을 만들지 않는다.** 광고를 안 보겠다는 사람에게도 적을 길이 그 자리에 있어야
 * 한다. 그래서 키패드로 가는 길(`fallback`)을 광고 버튼 바로 아래 같은 크기로 둔다.
 *
 * 광고를 붙일 수 없는 기기에서는 광고 이야기를 꺼내지 않는다. 눌러도 아무 일이 없는
 * 버튼을 세우면, 사진이 막힌 이유를 우리가 광고 탓으로 돌린 것처럼 읽힌다.
 */
export function PhotoCreditGate({
  credits,
  fallback,
}: {
  credits: PhotoCreditsHandle;
  fallback?: ReactNode;
}) {
  return (
    <div className="capture__gate" role="group" aria-label="사진 더 받기">
      <p className="capture__gate-text">오늘 쓸 수 있는 사진을 다 썼어요</p>
      {credits.canEarn ? (
        // 리워드 광고라 길이를 우리가 못 정한다. 「5초」 라고 적으면 지키지 못할 약속이 된다.
        <Button fullWidth disabled={credits.busy} onClick={() => void credits.earnOne()}>
          {credits.busy ? '광고를 불러오는 중이에요' : '광고 한 편 보고 사진 받기'}
        </Button>
      ) : null}
      {fallback}
      <p className="capture__credit">{REFILL_NOTE}</p>
    </div>
  );
}
