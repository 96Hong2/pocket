import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { BottomSheet, Button, iconUrl } from '../../shared/ui';

/**
 * 홈 화면에 추가하는 법.
 *
 * **우리가 대신 눌러 줄 수 없다.** 홈 화면에 아이콘을 놓는 것은 토스 앱이 하는 일이고,
 * 미니앱에는 그 자리를 여는 API 가 없다. 그래서 이 시트가 하는 일은 하나다:
 * 어디를 눌러야 하는지 손가락으로 가리키듯 알려 주는 것.
 *
 * 처음에는 단계마다 설명을 한 줄씩 더 붙였는데, 읽을 것이 여섯 줄이 되니 읽히지 않았다.
 * **눌러야 할 것을 글이 아니라 칩 모양으로 보여 준다.** 화면에서 그렇게 생긴 것을 찾으면
 * 되므로, 문장을 읽지 않아도 따라 할 수 있다.
 */

interface Step {
  /** 칩 앞에 붙는 말. 없으면 칩부터 시작한다. */
  lead?: string;
  /** 화면에 보이는 그대로. 우리 말로 바꿔 적으면 그 메뉴를 못 찾는다. */
  target: string;
  /** 칩 뒤에 붙는 말. */
  tail: string;
  /** 그 자리를 못 찾을 때만 필요한 한 줄. 꼭 필요한 단계에만 둔다. */
  hint?: string;
}

const STEPS: Step[] = [
  {
    lead: '맨 위 오른쪽',
    target: '⋯',
    tail: '누르기',
    // ⋯ 는 토스가 그리는 자리라 우리 화면 어디에도 없다. 어디쯤인지만 알려 준다.
    hint: '앱 이름 오른쪽, ✕ 바로 왼쪽',
  },
  { target: '휴대폰 홈 화면에 추가', tail: '고르기' },
  { target: '추가', tail: '누르기' },
];

export interface AddToHomeSheetProps {
  open: boolean;
  onClose: () => void;
  /** 어디서 열었는지. 안내를 어느 자리에서 봤을 때 실제로 따라 하는지 보려고 남긴다. */
  from: 'first_record' | 'settings';
}

export function AddToHomeSheet({ open, onClose, from }: AddToHomeSheetProps) {
  const analytics = useAnalytics();

  // 시스템 뒤로가기를 시트가 먼저 가져간다. 안 그러면 시트가 열린 채 화면만 뒤로 빠진다.
  useOverlayBackClose(open, onClose);

  // 첫 기록 직후에는 방금 한 일과 이어 붙인다. 설정에서 연 사람에게 「첫 기록」 은 남의 얘기다.
  const firstRecord = from === 'first_record';

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={firstRecord ? '첫 기록 끝! 홈에 두면 더 빨라요' : '홈 화면에 추가하면 더 빨라요'}
      className="home-add-sheet"
    >
      <div className="home-add-hero">
        <img
          className="home-add-hero__icon"
          src={iconUrl('57_smartphone')}
          alt=""
          aria-hidden="true"
        />
        <p className="home-add-hero__lead">
          토스를 열고 찾는 단계가 없어져요.
          <br />
          <strong>세 번만 누르면 끝나요.</strong>
        </p>
      </div>

      <ol className="home-add-steps">
        {STEPS.map((step, index) => (
          <li className="home-add-steps__item" key={step.target}>
            <span className="home-add-steps__no" aria-hidden="true">
              {index + 1}
            </span>
            <span className="home-add-steps__body">
              <span className="home-add-steps__line">
                {step.lead ? <span className="home-add-steps__lead">{step.lead}</span> : null}
                <span className="home-add-steps__chip">{step.target}</span>
                <span className="home-add-steps__tail">{step.tail}</span>
              </span>
              {step.hint ? <span className="home-add-steps__hint">{step.hint}</span> : null}
            </span>
          </li>
        ))}
      </ol>

      <Button
        className="home-add-sheet__done"
        fullWidth
        onClick={() => {
          analytics.log(EVENTS.homeAddResult, { from, result: 'guide_done' }, { kind: 'click' });
          onClose();
        }}
      >
        알겠어요
      </Button>
    </BottomSheet>
  );
}
