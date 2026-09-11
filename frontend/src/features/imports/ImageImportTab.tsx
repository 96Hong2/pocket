import { useState, type ReactNode } from 'react';

import { useBridge } from '../../app/providers';
import {
  EVENTS,
  useAnalytics,
  type FlowId,
  type ParseOutcome,
  type PickOutcome,
} from '../../shared/analytics';
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
  PermissionDenied,
  UnsupportedFeature,
  iconUrl,
  type IconName,
  type PermissionResource,
} from '../../shared/ui';

import { ImportReview } from './ImportReview';
import { ParseProgress, type ParseStep } from './ParseProgress';

/** 사진 한 장을 어디서 가져오는가. 그 뒤로는 두 갈래가 같은 길을 지난다. */
export type ImageImportKind = 'capture' | 'receipt';

/** 서버가 스텁 결과라고 알리는 코드값. 한국어 문구는 화면이 정한다. */
const STUB_NOTE = 'stub_image';

interface ImageImportMode {
  capability: BridgeCapability;
  permission: PermissionResource;
  /** 앱 버전이 낮아 못 쓸 때 무엇이 안 되는지. */
  feature: string;
  /** 무엇을 고르면 되는지 한 줄. 가운뎃점으로 이은 낱말이 줄 끝에서 갈리지 않게 묶어 둔다. */
  guide: ReactNode;
  /** 안내를 감싸는 카드. 그림과 보조문이 함께 선다. 캡처에만 있다. */
  intro?: { icon: IconName; note: string };
  pickLabel: string;
  /** 앨범·카메라를 아예 열지 못했을 때의 한 줄. */
  pickAlert: string;
  /** 읽는 동안 차례로 바뀌는 문구. 앞의 값이 그 문구가 시작하는 시각(ms)이다. */
  progressSteps: ParseStep[];
  /** 예상보다 오래 걸릴 때 덧붙이는 한 줄. */
  slowHint: string;
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
    // 가운뎃점에서 줄이 갈리면 다음 줄이 '·은행' 으로 시작해 글머리표처럼 읽힌다.
    guide: (
      <>
        거래내역 캡처를 골라주세요. <span className="capture__unit">토스·카드·은행</span> 화면도
        괜찮아요.
      </>
    ),
    intro: { icon: '23_document', note: '원본 이미지는 정리 후 바로 지워져요' },
    pickLabel: '캡처 고르기',
    pickAlert: '앨범을 열지 못했어요',
    // 실제 단계와 순서를 맞춘다. 지어낸 단계를 보여 주면 그 시간이 더 길게 느껴진다.
    progressSteps: [
      { at: 0, label: '캡처를 준비하고 있어요' },
      { at: 1_500, label: '글자를 읽고 있어요' },
      { at: 5_000, label: '거래를 하나씩 골라내고 있어요' },
      { at: 9_000, label: '분류를 맞추고 있어요' },
    ],
    slowHint: '글자가 많은 캡처는 더 걸려요. 조금만 기다려 주세요',
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
    intro: { icon: '43_camera', note: '원본 이미지는 정리 후 바로 지워져요' },
    pickLabel: '영수증 찍기',
    pickAlert: '카메라를 열지 못했어요',
    progressSteps: [
      { at: 0, label: '영수증을 준비하고 있어요' },
      { at: 1_500, label: '글자를 읽고 있어요' },
      { at: 5_000, label: '총액을 찾고 있어요' },
      { at: 9_000, label: '분류를 맞추고 있어요' },
    ],
    slowHint: '어두운 사진은 더 걸려요. 조금만 기다려 주세요',
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
  /** 이 기록 흐름을 가리키는 값. 고르기·읽기·저장 로그를 한 줄로 잇는다. */
  flowId: FlowId;
  /** 요청이 도는 동안 시트가 닫히거나 탭이 옮겨지지 않게 껍데기에 알린다. */
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
  /** 저장이 성공한 순간. 닫기보다 앞선다. */
  onSaved?: () => void;
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
  flowId,
  onBusyChange,
  onDone,
  onSaved,
  fallbackAction,
}: ImageImportTabProps) {
  const mode = MODES[kind];
  const bridge = useBridge();
  const analytics = useAnalytics();
  const analyze = useAnalyzeImage(kind);

  const [batch, setBatch] = useState<ImportBatchOut | null>(null);
  const [pickFailure, setPickFailure] = useState<BridgeErrorCode | null>(null);

  if (batch != null) {
    return (
      <ImportReview
        batch={batch}
        flowId={flowId}
        method={kind}
        onBatchChange={setBatch}
        onBusyChange={onBusyChange}
        onRestart={() => setBatch(null)}
        onDone={onDone}
        onSaved={onSaved}
        testId={mode.panelTestId}
        // 한 장에서 여러 건이 오는 캡처에서만 쓸모가 있다. 영수증은 보통 한 건이다.
        allowBulkCategory={kind === 'capture'}
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
      {mode.intro ? (
        <div className="capture__intro">
          <img className="capture__icon" src={iconUrl(mode.intro.icon)} alt="" aria-hidden="true" />
          <p className="capture__guide">{mode.guide}</p>
          <span className="capture__privacy">{mode.intro.note}</span>
        </div>
      ) : (
        <p className="capture__guide">{mode.guide}</p>
      )}

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

      {/*
        스피너 하나만 돌던 자리다. 12초 안팎이 걸리는데 아무 변화가 없어, 멈춘 줄 알고
        뒤로 나가는 사람이 있었다. 남은 시간 대신 지금 무엇을 하는 중인지를 보여 준다.
      */}
      {analyzing ? (
        <ParseProgress steps={mode.progressSteps} slowHint={mode.slowHint} />
      ) : null}

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
      if (picked == null) {
        analytics.log(EVENTS.imagePickResult, { method: kind, result: 'cancelled' }, { flowId });
        return;
      }
      // 몇 장을 골랐는지만 남긴다. 그림도, 파일 이름도, 크기도 싣지 않는다.
      analytics.log(
        EVENTS.imagePickResult,
        { method: kind, result: 'ok', image_count: 1 },
        { flowId },
      );

      analytics.log(EVENTS.parseStarted, { method: kind }, { flowId });
      // 걸린 시간은 우리가 잰다. 서버 로그로는 사용자가 실제로 기다린 시간을 알 수 없다.
      const startedAt = Date.now();
      try {
        const result = await analyze.mutateAsync(picked.dataUri);
        analytics.log(
          EVENTS.parseFinished,
          {
            method: kind,
            result: parseOutcome(result),
            elapsed_ms: Date.now() - startedAt,
            candidate_count: result.candidates?.length ?? 0,
          },
          { flowId },
        );
        setBatch(result);
      } catch (error) {
        analytics.log(
          EVENTS.parseFinished,
          {
            method: kind,
            result: 'failed',
            elapsed_ms: Date.now() - startedAt,
            error_code: error instanceof ApiError ? error.code : 'unknown',
          },
          { flowId },
        );
        throw error;
      }
    } catch (error) {
      // 사진을 가져오는 쪽 실패만 여기서 화면을 가른다. 읽기 실패는 analyze.error 가 이미 들고 있다.
      if (error instanceof BridgeError) {
        setPickFailure(error.code);
        analytics.log(
          EVENTS.imagePickResult,
          { method: kind, result: pickOutcome(error.code) },
          { flowId },
        );
      }
    } finally {
      // 취소로 일찍 빠져나갈 때도 반드시 풀어야 한다. 안 풀리면 시트를 닫을 수 없다.
      onBusyChange(false);
    }
  }
}

/** 브릿지 실패를 로그 값으로 옮긴다. 취소는 여기 오지 않는다(null 로 먼저 빠진다). */
function pickOutcome(code: BridgeErrorCode): PickOutcome {
  if (code === 'PERMISSION_DENIED') return 'denied';
  if (code === 'UNSUPPORTED') return 'unsupported';
  if (code === 'CANCELLED') return 'cancelled';
  return 'failed';
}

/** 읽기 결과를 한 낱말로. 상한을 넘겨 일부를 버렸으면 온전한 성공이 아니다. */
function parseOutcome(batch: ImportBatchOut): ParseOutcome {
  if ((batch.candidates?.length ?? 0) === 0) return 'empty';
  return batch.error_code?.startsWith('TRUNCATED:') ? 'partial' : 'ok';
}

/** 스텁이 지어낸 결과인지. provider 가 붙으면 이 코드값이 사라져 안내도 함께 사라진다. */
function isStub(batch: ImportBatchOut): boolean {
  return (batch.meta.notes ?? []).includes(STUB_NOTE);
}
