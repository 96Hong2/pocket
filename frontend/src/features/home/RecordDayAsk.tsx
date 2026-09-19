import { formatRelativeDay } from '../../shared/lib/format';
import { Button } from '../../shared/ui';

/**
 * 지난 날을 보고 있을 때 큰 기록 버튼을 누르면 한 번 묻는 자리.
 *
 * **보고 있는 날과 적히는 날이 다를 수 있다는 것을 말로 한다.** 큰 버튼은 늘 오늘에
 * 적는다. 그런데 며칠 전을 훑어보다 그 버튼을 누른 사람은 보고 있던 날에 적힐 것이라고
 * 여긴다. 적고 나서야 오늘에 붙은 것을 알면, 지우고 다시 적는 수밖에 없다.
 *
 * 시트를 하나 더 띄우지 않고 버튼 바로 아래에 편다. 무엇을 보고 있었는지가 화면에 남아
 * 있어야 답할 수 있다.
 */
export interface RecordDayAskProps {
  /** 지금 보고 있는 날. `2026-09-14` */
  day: string;
  /** 오늘. 부르는 쪽이 이미 세어 뒀다. */
  today: string;
  /** 고른 날. 오늘을 고르면 `today` 가 그대로 온다. */
  onPick: (day: string) => void;
  onCancel: () => void;
}

export function RecordDayAsk({ day, today, onPick, onCancel }: RecordDayAskProps) {
  const label = formatRelativeDay(day);

  return (
    <div className="home-ask" role="group" aria-label="어느 날에 적을까요">
      <p className="home-ask__text">
        <b>{label}</b>로 적을까요?
      </p>
      <div className="home-ask__actions">
        <Button variant="ghost" onClick={onCancel}>
          그만두기
        </Button>
        <Button variant="outline" onClick={() => onPick(today)}>
          오늘로
        </Button>
        <Button onClick={() => onPick(day)}>{label}로</Button>
      </div>
    </div>
  );
}
