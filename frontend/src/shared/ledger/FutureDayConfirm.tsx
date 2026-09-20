import { formatDayLabel } from '../lib/format';
import { Button } from '../ui';

/**
 * 아직 오지 않은 날에 적으려 할 때 한 번 묻는다.
 *
 * **막지는 않는다.** 미리 나갈 돈을 적어 두는 사람이 실제로 있고, 사진에서 읽어 온 날짜가
 * 앞날로 잘못 잡히는 일도 있다. 둘 다 있는데 칸을 잠가 버리면 앞엣사람은 아예 못 적고,
 * 뒷엣사람은 잘못 들어간 것을 모른 채 지나간다.
 *
 * 그래서 고를 수는 있게 두고 **저장하는 순간에 한 번만** 묻는다. 묻는 자리가 칸이 아니라
 * 저장인 이유는, 날짜를 고르는 중에 물으면 아직 다 고르지도 않은 사람을 붙잡기 때문이다.
 *
 * **그대로 두는 쪽이 기본이다.** 오른쪽 큰 버튼이 「날짜 고치기」다. 실수로 앞날이 잡힌
 * 경우가 일부러 앞날에 적는 경우보다 흔하다.
 */
export function FutureDayConfirm({
  day,
  onFix,
  onSave,
}: {
  /** 저장하려는 날. `2026-09-25` 같은 값이다. */
  day: string;
  /** 「날짜 고치기」. 창만 닫고 칸으로 돌려보낸다. */
  onFix: () => void;
  /** 「이 날짜로 저장」. 부르는 쪽이 원래 저장을 이어서 한다. */
  onSave: () => void;
}) {
  return (
    <div className="future-day" role="alertdialog" aria-label="아직 오지 않은 날이에요">
      <div className="future-day__box">
        <p className="future-day__text">
          <b>{formatDayLabel(day)}</b>은 아직 오지 않은 날이에요. 이 날짜로 저장할까요?
        </p>
        <div className="future-day__actions">
          <Button variant="outline" onClick={onSave}>
            이 날짜로 저장
          </Button>
          <Button className="future-day__fix" onClick={onFix}>
            날짜 고치기
          </Button>
        </div>
      </div>
    </div>
  );
}
