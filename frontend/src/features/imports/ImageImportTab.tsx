import { useState, type ReactNode } from 'react';

import { useBridge } from '../../app/providers';
import { ApiError, useAnalyzeImage, type ImportBatchOut } from '../../shared/api';
import { TEST_IDS } from '../../shared/testIds';
import {
  BridgeError,
  type BridgeCapability,
  type BridgeErrorCode,
  type MiniAppBridge,
  type PickedImage,
} from '../../shared/toss';
import {
  Button,
  LoadingState,
  PermissionDenied,
  UnsupportedFeature,
  type PermissionResource,
} from '../../shared/ui';

import { ImportReview } from './ImportReview';

/** 사진 한 장을 어디서 가져오는가. 그 뒤로는 두 갈래가 같은 길을 지난다. */
export type ImageImportKind = 'capture' | 'receipt';

/** 서버가 스텁 결과라고 알리는 코드값. 한국어 문구는 화면이 정한다. */
const STUB_NOTE = 'stub_image';

interface ImageImportMode {
  capability: BridgeCapability;
  permission: PermissionResource;
  /** 앱 버전이 낮아 못 쓸 때 무엇이 안 되는지. */
  feature: string;
  guide: string;
  pickLabel: string;
  /** 앨범·카메라를 아예 열지 못했을 때의 한 줄. */
  pickAlert: string;
  loadingLabel: string;
  panelTestId: string;
  restartLabel: string;
  emptyMessage: ReactNode;
  /** 한 장을 가져온다. 취소는 두 갈래 모두 null 로 맞춰 돌려준다. */
  pick: (bridge: MiniAppBridge) => Promise<PickedImage | null>;
}

/**
 * 두 갈래가 다른 것 전부.
 *
 * 여기 없는 것은 같다는 뜻이다. 잠금·오류 지우기·취소를 조용히 넘기기 같은,
 * 실제로 버그가 나는 자리가 그렇다. 탭을 복사하면 그 자리가 둘로 갈라져 한쪽만 고쳐진다.
 */
const MODES: Record<ImageImportKind, ImageImportMode> = {
  capture: {
    capability: 'albumPick',
    permission: 'photos',
    feature: '캡처 불러오기',
    // PRD 원문. 어떤 화면을 골라도 되는지가 이 한 줄에 다 들어 있어 줄이지 않는다.
    guide: '거래내역 캡처를 골라주세요. 토스·카드·은행 화면도 괜찮아요.',
    pickLabel: '캡처 고르기',
    pickAlert: '앨범을 열지 못했어요',
    loadingLabel: '캡처를 읽는 중이에요',
    panelTestId: TEST_IDS.capturePanel,
    restartLabel: '다시 고르기',
    emptyMessage: '캡처에서 거래를 찾지 못했어요',
    pick: async (bridge) => (await bridge.pickPhotos({ maxCount: 1, maxWidth: 1600 }))[0] ?? null,
  },
  receipt: {
    capability: 'camera',
    permission: 'camera',
    feature: '영수증 촬영',
    guide: '영수증이 잘 보이게 찍어주세요. 총액이 나오면 돼요.',
    pickLabel: '영수증 찍기',
    pickAlert: '카메라를 열지 못했어요',
    loadingLabel: '영수증을 읽는 중이에요',
    panelTestId: TEST_IDS.receiptPanel,
    restartLabel: '다시 찍기',
    emptyMessage: (
      <>
        영수증을 읽지 못했어요
        <span>사진이 어둡거나 구겨져 있으면 그럴 수 있어요</span>
      </>
    ),
    pick: (bridge) => bridge.captureReceipt({ maxWidth: 1600 }),
  },
};

export interface ImageImportTabProps {
  kind: ImageImportKind;
  /** 요청이 도는 동안 시트가 닫히거나 탭이 옮겨지지 않게 껍데기에 알린다. */
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
  /** 사진으로는 안 될 때 갈 다른 길. 실패 화면과 권한 화면 두 자리에 함께 놓인다. */
  fallbackAction?: ReactNode;
}

/**
 * 사진 한 장을 가져와 읽고 저장한다. 앨범에서 고르거나 카메라로 찍는다.
 *
 * 가져온 사진을 미리 보여 주고 확인받는 단계를 두지 않는다. 사용자가 고른 그림을 다시 보여 줘도
 * 판단할 거리가 없고, 진짜 확인은 읽어 낸 후보 목록에서 한다.
 * 읽은 뒤부터는 줄글과 같은 검토 화면이다.
 */
export function ImageImportTab({
  kind,
  onBusyChange,
  onDone,
  fallbackAction,
}: ImageImportTabProps) {
  const mode = MODES[kind];
  const bridge = useBridge();
  const analyze = useAnalyzeImage(kind);

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
        testId={mode.panelTestId}
        restartLabel={mode.restartLabel}
        emptyMessage={mode.emptyMessage}
        emptyAction={fallbackAction}
        notice={
          isStub(batch) ? (
            <p className="capture__stub" role="status">
              아직 예시 결과예요. 실제 사진 인식은 준비 중이에요
            </p>
          ) : null
        }
      />
    );
  }

  if (pickFailure === 'PERMISSION_DENIED') {
    return (
      <div className="capture" data-testid={mode.panelTestId}>
        {/* 권한을 켜고 돌아오는 길이 있어야 한다. 안 그러면 이 탭에서 할 수 있는 일이 없다. */}
        <PermissionDenied
          resource={mode.permission}
          size="inline"
          onRetry={() => void pick()}
          fallbackAction={fallbackAction}
        />
      </div>
    );
  }

  if (pickFailure === 'UNSUPPORTED' || !bridge.supports(mode.capability)) {
    return (
      <div className="capture" data-testid={mode.panelTestId}>
        <UnsupportedFeature feature={mode.feature} size="inline" />
      </div>
    );
  }

  const analyzing = analyze.isPending;
  const message = analyze.error instanceof ApiError ? analyze.error.message : null;

  return (
    <div className="capture" data-testid={mode.panelTestId}>
      <p className="capture__guide">{mode.guide}</p>

      {pickFailure != null ? (
        <p className="capture__alert" role="alert">
          {mode.pickAlert}
        </p>
      ) : null}

      {message ? (
        <p className="capture__alert" role="alert">
          {message}
        </p>
      ) : null}

      {analyzing ? <LoadingState size="inline" label={mode.loadingLabel} /> : null}

      <Button fullWidth disabled={analyzing} onClick={() => void pick()}>
        {pickFailure != null ? '다시 시도' : mode.pickLabel}
      </Button>
    </div>
  );

  async function pick(): Promise<void> {
    setPickFailure(null);
    // 직전 분석 오류도 지운다. 안 지우면 취소하고 나왔을 때 붉은 줄이 그대로 남는다.
    analyze.reset();
    // 사진을 고르거나 찍는 동안과 읽는 동안 내내 잠근다. 중간에 시트가 닫히면 결과가 갈 곳이 없다.
    onBusyChange(true);
    try {
      const picked = await mode.pick(bridge);
      // 취소하면 null 이다. 사용자가 스스로 그만둔 것이라 아무 말도 하지 않는다.
      if (picked == null) return;
      setBatch(await analyze.mutateAsync(picked.dataUri));
    } catch (error) {
      // 사진을 가져오는 쪽 실패만 여기서 화면을 가른다. 읽기 실패는 analyze.error 가 이미 들고 있다.
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
