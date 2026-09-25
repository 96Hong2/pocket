import type { PhotoCreditsHandle } from './usePhotoCredits';

/**
 * 사진 버튼 아래 한 줄.
 *
 * **광고가 실제로 뜨는 사람에게만, 한 줄만 적는다.** 처음 써 보는 사람(체험 한 장이
 * 남았다)과 광고가 안 붙는 기기에는 아무 말도 안 한다. 10초 안에 한 건 적으러 온 사람
 * 앞에 광고라는 개념을 먼저 세울 이유가 없다.
 *
 * 왜 그래도 적어 두나. 확인 창은 **사진을 고른 뒤에** 뜬다. 앨범을 뒤지는 몇 초를 쓰고
 * 나서야 광고 얘기를 처음 들으면, 알려 준 것이 아니라 붙잡아 둔 것이 된다.
 * 여기 한 줄이 그 앞자리다.
 *
 * **작게, 한 번만.** 이 줄이 버튼보다 눈에 띄면 그 버튼을 안 누르게 된다.
 * 「무료」·「보상」 같은 말은 안 쓰고, 길이도 안 적는다(우리가 정하는 값이 아니다).
 */
export function PhotoCreditLine({ credits }: { credits: PhotoCreditsHandle }) {
  /*
    이미 광고를 치렀는데 못 읽은 사람에게는 이 줄을 안 적는다. 다음 한 번은 광고가 안
    나오는데 「광고가 지나가요」 라고 적으면 두 줄이 서로 다른 말을 한다.
    치른 값은 실패 줄이 대신 말한다.
  */
  if (credits.owed) return null;
  // 한 장 기준으로 광고가 붙는 사람에게만. 체험이 남았거나 광고가 없는 기기면 `none` 이다.
  if (credits.planFor(1) === 'none') return null;
  return <p className="capture__credit">읽는 동안 광고가 한 번 지나가요</p>;
}
