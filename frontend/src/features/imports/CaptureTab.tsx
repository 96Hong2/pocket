import { useState } from 'react';

import { useBridge } from '../../app/providers';
import { ApiError, useAnalyzeCapture, type ImportBatchOut } from '../../shared/api';
import { TEST_IDS } from '../../shared/testIds';
import { BridgeError, type BridgeErrorCode } from '../../shared/toss';
import { Button, LoadingState, PermissionDenied, UnsupportedFeature } from '../../shared/ui';

import { ImportReview } from './ImportReview';

/** PRD 원문. 어떤 화면을 골라도 되는지가 이 한 줄에 다 들어 있어 줄이지 않는다. */
const GUIDE = '거래내역 캡처를 골라주세요. 토스·카드·은행 화면도 괜찮아요.';

/** 서버가 스텁 결과라고 알리는 코드값. 한국어 문구는 화면이 정한다. */
const STUB_NOTE = 'stub_image';

export interface CaptureTabProps {
  /** 요청이 도는 동안 시트가 닫히거나 탭이 옮겨지지 않게 껍데기에 알린다. */
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
}

/**
 * 앨범에서 캡처 한 장을 골라 읽고 저장한다.
 *
 * 고른 사진을 미리 보여 주고 확인받는 단계를 두지 않는다. 사용자가 고른 그림을 다시 보여 줘도
 * 판단할 거리가 없고, 진짜 확인은 읽어 낸 후보 목록에서 한다.
 * 읽은 뒤부터는 줄글과 같은 검토 화면이다.
 */
export function CaptureTab({ onBusyChange, onDone }: CaptureTabProps) {
  const bridge = useBridge();
  const analyze = useAnalyzeCapture();

  const [batch, setBatch] = useState<ImportBatchOut | null>(null);
  const [pickFailure, setPickFailure] = useState<BridgeErrorCode | null>(null);

  if (batch != null) {
    return (
      <ImportReview
        batch={batch}
        onBatchChange={setBatch}
        onBusyChange={onBusyChange}
        onRestart={() => setBatch(null)}
        onDone={onDone}
        testId={TEST_IDS.capturePanel}
        restartLabel="다시 고르기"
        emptyMessage="캡처에서 거래를 찾지 못했어요"
        notice={
          isStub(batch) ? (
            <p className="capture__stub" role="status">
              아직 예시 결과예요. 실제 캡처 인식은 준비 중이에요
            </p>
          ) : null
        }
      />
    );
  }

  if (pickFailure === 'PERMISSION_DENIED') {
    return (
      <div className="capture" data-testid={TEST_IDS.capturePanel}>
        {/* 권한을 켜고 돌아오는 길이 있어야 한다. 안 그러면 이 탭에서 할 수 있는 일이 없다. */}
        <PermissionDenied resource="photos" size="inline" onRetry={() => void pick()} />
      </div>
    );
  }

  if (pickFailure === 'UNSUPPORTED' || !bridge.supports('albumPick')) {
    return (
      <div className="capture" data-testid={TEST_IDS.capturePanel}>
        <UnsupportedFeature feature="캡처 불러오기" size="inline" />
      </div>
    );
  }

  const analyzing = analyze.isPending;
  const message = analyze.error instanceof ApiError ? analyze.error.message : null;

  return (
    <div className="capture" data-testid={TEST_IDS.capturePanel}>
      <p className="capture__guide">{GUIDE}</p>

      {pickFailure != null ? (
        <p className="capture__alert" role="alert">
          앨범을 열지 못했어요
        </p>
      ) : null}

      {message ? (
        <p className="capture__alert" role="alert">
          {message}
        </p>
      ) : null}

      {analyzing ? <LoadingState size="inline" label="캡처를 읽는 중이에요" /> : null}

      <Button fullWidth disabled={analyzing} onClick={() => void pick()}>
        {pickFailure != null ? '다시 시도' : '캡처 고르기'}
      </Button>
    </div>
  );

  async function pick(): Promise<void> {
    setPickFailure(null);
    // 직전 분석 오류도 지운다. 안 지우면 취소하고 나왔을 때 붉은 줄이 그대로 남는다.
    analyze.reset();
    // 앨범이 열려 있는 동안과 읽는 동안 내내 잠근다. 중간에 시트가 닫히면 결과가 갈 곳이 없다.
    onBusyChange(true);
    try {
      const photos = await bridge.pickPhotos({ maxCount: 1, maxWidth: 1600 });
      const picked = photos[0];
      // 취소하면 빈 배열이다. 사용자가 스스로 그만둔 것이라 아무 말도 하지 않는다.
      if (picked == null) return;
      setBatch(await analyze.mutateAsync(picked.dataUri));
    } catch (error) {
      // 앨범 쪽 실패만 여기서 화면을 가른다. 읽기 실패는 analyze.error 가 이미 들고 있다.
      if (error instanceof BridgeError) setPickFailure(error.code);
    } finally {
      // 취소로 일찍 빠져나갈 때도 반드시 풀어야 한다. 안 풀리면 시트를 닫을 수 없다.
      onBusyChange(false);
    }
  }
}

/** 스텁이 지어낸 결과인지. provider 가 붙으면 이 코드값이 사라져 안내도 함께 사라진다. */
function isStub(batch: ImportBatchOut): boolean {
  return (batch.meta.notes ?? []).includes(STUB_NOTE);
}
