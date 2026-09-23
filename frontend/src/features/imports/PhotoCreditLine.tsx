import { DAILY_FREE } from './photoCredits';
import type { PhotoCreditsHandle } from './usePhotoCredits';

/**
 * 사진 버튼 아래 한 줄.
 *
 * **오늘 무료분을 이미 쓴 사람에게만 적는다.** 아직 안 쓴 사람에게는 「무료」 라는 말도
 * 「광고」 라는 말도 꺼내지 않는다. 10초 안에 한 건 적으러 온 사람 앞에 셈이라는 새 개념을
 * 먼저 세울 이유가 없다.
 *
 * 예전에는 남은 장수를 세어 적고, 다 쓰면 「광고 한 편 보고 사진 받기」 로 막았다.
 * 지금은 막지 않는다. 두 장째부터는 읽는 동안 광고가 함께 돌 뿐이라, 여기서는 그 사실만
 * 미리 한 줄로 말해 둔다. 실제로 묻는 것은 사진을 고른 뒤 확인 창이 한다.
 *
 * **광고라는 말을 쓰되 자랑하지 않는다.** 이 줄이 버튼보다 눈에 띄면 그 버튼을 안 누르게
 * 된다. 받는 것은 버튼에 이미 적혀 있다.
 */
export function PhotoCreditLine({ credits }: { credits: PhotoCreditsHandle }) {
  // 아직 못 읽었거나(`null`) 무료분이 남았으면 아무 말도 안 한다.
  if (credits.free == null || credits.free > 0) return null;
  return (
    <p className="capture__credit">
      오늘 무료 {DAILY_FREE}장을 다 썼어요
      <span>다음부터는 읽는 동안 광고가 한 번 나와요</span>
    </p>
  );
}
