import { useEffect, useId, useState } from 'react';

import { useBridge } from '../../app/providers';
import { useOverlayBackClose } from '../../app/providers';
import { readAdOptOut, writeAdOptOut } from '../../shared/lib/adOptOut';
import { clearDeviceMarks } from '../../shared/lib/deviceMarks';
import { TEST_IDS } from '../../shared/testIds';
import type { BridgeEnvironment } from '../../shared/toss';
import { BottomSheet, Button, Toggle } from '../../shared/ui';

/**
 * 이 앱이 지금 어느 판에서 돌고 있는지.
 *
 * **문의를 받을 때와 배포를 확인할 때 쓴다.** 실기기에서 QR 로 연 판이 운영(`toss`)인지
 * 테스트(`sandbox`)인지는 화면에 적기 전까지 알 방법이 없었다. 로그에는 실려 있지만
 * 그 로그는 운영 판에서만 실제로 나가서, 정작 확인이 필요한 자리에서 못 읽는다.
 *
 * 광고 끄기가 여기 있는 이유도 같다. 판으로만 가르면 QR 테스트가 `toss` 로 잡히는 순간
 * 방어가 통째로 비껴간다. 그래서 기기에서 직접 끄는 길을 하나 둔다.
 */

const ENV_LABEL: Record<BridgeEnvironment, string> = {
  toss: '운영 (toss)',
  sandbox: '테스트 (sandbox)',
  browser: '브라우저',
};

export interface AppDiagnosticsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function AppDiagnosticsSheet({ open, onClose }: AppDiagnosticsSheetProps) {
  const bridge = useBridge();
  const adTitleId = useId();
  const [optOut, setOptOut] = useState(false);
  const [failed, setFailed] = useState(false);
  const [cleared, setCleared] = useState<boolean | null>(null);

  useOverlayBackClose(open, onClose);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void readAdOptOut(bridge.storage).then((value) => {
      if (alive) setOptOut(value);
    });
    return () => {
      alive = false;
    };
  }, [bridge, open]);

  // 저장이 실패하면 토글을 되돌린다. 껐다고 적고 실제로는 안 꺼지는 것이 가장 나쁘다.
  const toggle = async (next: boolean) => {
    setOptOut(next);
    setFailed(false);
    const saved = await writeAdOptOut(bridge.storage, next);
    if (!saved) {
      setOptOut(!next);
      setFailed(true);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="앱 정보" className="diag-sheet">
      <dl className="diag-list" data-testid={TEST_IDS.diagnostics}>
        <div className="diag-list__row">
          <dt>판</dt>
          <dd>{ENV_LABEL[bridge.environment]}</dd>
        </div>
        <div className="diag-list__row">
          <dt>앱 버전</dt>
          <dd data-numeric="">{__APP_VERSION__}</dd>
        </div>
        <div className="diag-list__row">
          <dt>토스 앱</dt>
          <dd data-numeric="">{bridge.appVersion || '-'}</dd>
        </div>
        <div className="diag-list__row">
          <dt>배포</dt>
          <dd className="diag-list__mono">{bridge.deploymentId || '-'}</dd>
        </div>
        <div className="diag-list__row">
          {/* 기기 식별자는 여기서만 보여 준다. 로그에도 서버에도 보내지 않는다. */}
          <dt>기기</dt>
          <dd className="diag-list__mono">{bridge.deviceId || '-'}</dd>
        </div>
      </dl>

      <div className="diag-ad">
        <div className="diag-ad__text">
          <span className="diag-ad__title" id={adTitleId}>
            이 기기에서 광고 끄기
          </span>
          <span className="diag-ad__desc">
            만든 사람이 자기 앱의 광고를 보면 무효 트래픽으로 잡혀요. 테스트할 기기에서 켜 두세요.
          </span>
        </div>
        <Toggle checked={optOut} ariaLabelledBy={adTitleId} onChange={(next) => void toggle(next)} />
      </div>

      {failed ? (
        <p className="diag-note diag-note--warn">
          저장하지 못했어요. 이 기기에는 광고가 그대로 떠요.
        </p>
      ) : null}

      <div className="diag-reset">
        <p className="diag-reset__desc">
          한 번만 뜨는 안내(홈 화면 추가·지난달 결산)를 이 기기에서 처음 상태로 되돌려요. 적어 둔
          기록은 지우지 않아요.
        </p>
        <Button
          variant="outline"
          fullWidth
          onClick={() => {
            void clearDeviceMarks(bridge.storage, new Date()).then(setCleared);
          }}
        >
          안내를 처음 상태로
        </Button>
        {cleared === true ? (
          <p className="diag-note">되돌렸어요. 앱을 다시 열면 안내가 처음처럼 떠요.</p>
        ) : null}
        {cleared === false ? (
          <p className="diag-note diag-note--warn">일부를 지우지 못했어요.</p>
        ) : null}
      </div>
    </BottomSheet>
  );
}
