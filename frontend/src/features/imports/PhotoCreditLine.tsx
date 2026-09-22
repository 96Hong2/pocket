import type { ReactNode } from 'react';

import { Button } from '../../shared/ui';

import { DAILY_FREE } from './photoCredits';
import type { PhotoCreditsHandle } from './usePhotoCredits';

/** 날마다 채워진다는 한 줄. 다 쓴 자리에서만 적는다. 남아 있는 사람은 셈을 알 필요가 없다. */
const REFILL_NOTE = `사진은 매일 ${DAILY_FREE}장까지 채워져요`;

/** 이 수 아래로 내려갔을 때만 남은 장수를 적는다. */
const SHOW_LEFT_AT = 1;

/**
 * 사진 버튼 아래 한 줄. 남은 장수와, 한 장 더 모으는 길.
 *
 * **넉넉할 때는 아예 안 그린다.** 마지막에 캡처로 적은 사람은 시트가 캡처 탭으로 열려서,
 * 적을 때마다 이 줄을 읽게 된다. 10초 안에 한 건 적으러 온 사람 앞에 「장수」 라는 새 개념과
 * 광고 권유를 먼저 세우는 셈이다. 세 장 남은 사람에게 셈을 가르칠 이유가 없다.
 *
 * 마지막 한 장이 되면 그때 적는다. 그 사람에게는 「다음에 막힌다」 가 예고이고,
 * 미리 모아 둘 기회이기도 하다.
 */
export function PhotoCreditLine({
  credits,
  busy = false,
}: {
  credits: PhotoCreditsHandle;
  /** 사진을 읽는 중. 그동안 광고를 누르면 두 셈이 같은 값을 덮어쓴다. */
  busy?: boolean;
}) {
  if (credits.left == null || credits.left > SHOW_LEFT_AT) return null;
  return (
    <p className="capture__credit">
      <span>사진 {credits.left}장 남음</span>
      {credits.canEarn ? (
        <>
          {' · '}
          <button
            type="button"
            className="capture__earn"
            disabled={credits.busy || busy}
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
    // 그룹 이름에 「광고」 를 넣지 않는다. 안에 광고를 안 보고 적는 길도 함께 들어 있다.
    <div className="capture__gate" role="group" aria-label="오늘 사진을 다 썼어요">
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
