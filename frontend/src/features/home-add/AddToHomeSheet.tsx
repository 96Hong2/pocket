import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { BottomSheet, Button } from '../../shared/ui';

/**
 * 홈 화면에 추가하는 법.
 *
 * **우리가 대신 눌러 줄 수 없다.** 홈 화면에 아이콘을 놓는 것은 토스 앱이 하는 일이고,
 * 미니앱에는 그 자리를 여는 API 가 없다. 그래서 이 시트가 하는 일은 하나다:
 * 어디를 눌러야 하는지 손가락으로 가리키듯 알려 주는 것.
 *
 * 세 단계를 넘기지 않는다. 네 단계째부터는 읽지 않고 닫는다.
 */

interface Step {
  /** 화면에 보이는 그대로 적는다. 우리 말로 바꿔 적으면 그 메뉴를 못 찾는다. */
  action: string;
  detail: string;
}

const STEPS: Step[] = [
  { action: '화면 맨 위 오른쪽 ⋯ 누르기', detail: '토스가 주는 공통 메뉴가 열려요' },
  { action: '휴대폰 홈 화면에 추가 고르기', detail: '목록 안에 그대로 적혀 있어요' },
  { action: '추가 누르기', detail: '홈 화면에 아이콘이 생겨요' },
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

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="홈 화면에 추가하면 더 빨라요"
      className="home-add-sheet"
    >
      <p className="home-add-sheet__lead">
        토스를 열고 찾을 필요 없이, 홈 화면에서 바로 눌러 기록해요
      </p>

      <ol className="home-add-steps">
        {STEPS.map((step, index) => (
          <li className="home-add-steps__item" key={step.action}>
            <span className="home-add-steps__no" aria-hidden="true">
              {index + 1}
            </span>
            <span className="home-add-steps__body">
              <span className="home-add-steps__action">{step.action}</span>
              <span className="home-add-steps__detail">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      {/*
        ⋯ 는 토스가 그리는 자리라 우리 화면 어디에도 없다. 그림으로 흉내 내면 그걸 찾다가
        더 헤매므로, 어디쯤인지만 한 줄로 알려 준다.
      */}
      <p className="home-add-sheet__note">⋯ 는 앱 이름 오른쪽, ✕ 바로 왼쪽에 있어요</p>

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
