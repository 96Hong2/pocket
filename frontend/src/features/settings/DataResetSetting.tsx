import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { ApiError, useResetAccountData } from '../../shared/api';
import { TEST_IDS } from '../../shared/testIds';
import { BottomSheet, Button } from '../../shared/ui';

/** 동의 문구. 화면과 e2e 가 같은 값을 본다. */
const AGREE_LABEL = '전부 삭제에 동의합니다';

/**
 * 앱 데이터 초기화.
 *
 * 설정 화면 맨 아래, 배너보다 뒤에 **회색 글자 한 줄**로 둔다. 카드로 세우면 설정 하나로
 * 읽혀 눌러 보게 된다. 찾는 사람만 찾으면 되는 자리라 눈에 띌 이유가 없다.
 *
 * **두 단이다.** 여는 것과 지우는 것을 가른다. 한 번에 지우면 잘못 누른 사람이 되돌릴 길이
 * 없다. 되돌리기도 휴지통도 두지 않았다. 서버에서 실제로 지우는 것이라 되살릴 자리가 없다.
 * 그래서 무엇이 사라지는지를 목록으로 먼저 보여 주고, 동의를 눌러야 지우기가 열린다.
 */
export function DataResetSetting() {
  const [open, setOpen] = useState(false);

  return (
    <section className="setting-block reset-block" aria-label="앱 데이터 초기화">
      <button type="button" className="reset-block__link" onClick={() => setOpen(true)}>
        앱 데이터 초기화
      </button>

      <ResetSheet open={open} onClose={() => setOpen(false)} />
    </section>
  );
}

/**
 * 확인 시트.
 *
 * 지우기 요청은 **여기 하나만** 만든다. 시트와 폼이 각자 만들면 닫기를 잠그는 쪽이
 * 도는 중인지 모른다(서로 다른 요청을 보고 있게 된다).
 */
function ResetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const analytics = useAnalytics();
  const reset = useResetAccountData();
  const [agreed, setAgreed] = useState(false);

  // 지우는 중에는 닫히지 않는다. 닫히면 결과가 갈 곳이 없어 무엇이 지워졌는지 알 수 없다.
  useOverlayBackClose(open, onClose, reset.isPending);

  function close(): void {
    // 다시 열면 동의부터 시작한다. 눌러 둔 채로 남으면 두 번째는 한 번 누르면 지워진다.
    setAgreed(false);
    reset.reset();
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={close} dismissible={!reset.isPending} title="정말 지울까요?">
      {open ? (
        <ResetForm
          analytics={analytics}
          reset={reset}
          agreed={agreed}
          onAgreedChange={setAgreed}
          onDone={close}
        />
      ) : null}
    </BottomSheet>
  );
}

interface ResetFormProps {
  analytics: ReturnType<typeof useAnalytics>;
  reset: ReturnType<typeof useResetAccountData>;
  agreed: boolean;
  onAgreedChange: (next: boolean) => void;
  onDone: () => void;
}

function ResetForm({ analytics, reset, agreed, onAgreedChange, onDone }: ResetFormProps) {
  const error = reset.error instanceof ApiError ? reset.error : null;
  const failed = reset.isError;

  function run(): void {
    const startedAt = Date.now();
    reset.mutate(undefined, {
      onSuccess: () => {
        analytics.log(EVENTS.dataResetResult, {
          result: 'ok',
          elapsed_ms: Date.now() - startedAt,
        });
        onDone();
      },
      onError: (cause) => {
        analytics.log(EVENTS.dataResetResult, {
          result: 'failed',
          elapsed_ms: Date.now() - startedAt,
          error_code: cause instanceof ApiError ? cause.code : 'unknown',
        });
      },
    });
  }

  return (
    <div className="reset-sheet">
      <p className="reset-sheet__lead">지금까지 이 앱에 넣은 것이 전부 사라져요.</p>

      {/* 무엇이 사라지는지 이름으로 적는다. "데이터" 한 단어로는 무엇을 잃는지 모른다. */}
      <ul className="reset-sheet__list">
        <li>적어 둔 기록과 안 쓴 날 표시</li>
        <li>예산과 카테고리 한도</li>
        <li>목표와 모은 돈</li>
        <li>자산 목록</li>
        <li>내가 만든 분류와 기억한 상호</li>
        <li>홈 표시 방식·알림 같은 설정</li>
      </ul>

      <p className="reset-sheet__warn">되돌릴 수 없어요. 지운 뒤에는 되살릴 방법이 없어요.</p>

      <label className="reset-sheet__agree">
        <input
          type="checkbox"
          data-testid={TEST_IDS.resetAgree}
          checked={agreed}
          disabled={reset.isPending}
          onChange={(event) => onAgreedChange(event.target.checked)}
        />
        <span>{AGREE_LABEL}</span>
      </label>

      {failed ? (
        <p className="reset-sheet__notice" role="alert">
          {error?.message ?? '지우지 못했어요. 잠시 뒤에 다시 해 주세요.'}
        </p>
      ) : null}

      <Button
        className="reset-sheet__go"
        variant="danger"
        fullWidth
        // 동의를 누르기 전에는 아예 못 누른다. 확인 버튼만으로는 한 단이 아니다.
        disabled={!agreed || reset.isPending}
        onClick={run}
      >
        {reset.isPending ? '지우는 중이에요' : '전부 지우기'}
      </Button>
    </div>
  );
}
