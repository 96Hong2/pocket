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
 * 있어야 답할 수 있다. 대신 **펴지는 즉시 첫 버튼으로 초점을 옮긴다.** 안 옮기면 읽는
 * 프로그램을 쓰는 사람에게는 버튼을 눌렀는데 아무 일도 안 일어난 것으로 들린다.
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
    <div className="home-ask" role="alertdialog" aria-label="어느 날에 적을까요">
      <div className="home-ask__head">
        <p className="home-ask__text">어느 날에 적을까요?</p>
        {/* 접는 길. 「그만두기」 라고 적으면 읽어 온 것을 버리는 그 버튼과 같은 말이 된다. */}
        <button
          type="button"
          className="home-ask__close"
          aria-label="묻는 것 닫기"
          onClick={onCancel}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {/*
        날짜만 적는다. 물음이 「어느 날에」 라고 이미 물었고, 「오늘로 적기」 처럼 길게
        적으면 좁은 화면에서 두 버튼이 넘친다(`.pk-btn` 은 줄바꿈을 안 한다).
      */}
      <div className="home-ask__actions">
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- 눌러서 편 자리라 초점이 따라와야 한다 */}
        <Button autoFocus variant="outline" onClick={() => onPick(today)}>
          오늘
        </Button>
        <Button onClick={() => onPick(day)}>{label}</Button>
      </div>
    </div>
  );
}
