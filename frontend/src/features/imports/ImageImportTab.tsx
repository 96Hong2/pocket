import { useEffect, useState, type ReactNode } from 'react';

import { useBridge } from '../../app/providers';
import {
  EVENTS,
  useAnalytics,
  type FlowId,
  type PickOutcome,
} from '../../shared/analytics';
import { ApiError, useAnalyzeImage, type ImportBatchOut } from '../../shared/api';
import { TEST_IDS } from '../../shared/testIds';
import { parseOutcome } from './parseOutcome';
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
import { PhotoCreditGate, PhotoCreditLine } from './PhotoCreditLine';
import type { PhotoCreditsHandle } from './usePhotoCredits';

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
    // 한 줄에 안 들어가면 문장 사이에서 갈려야 한다. 그냥 두면 '총액이 / 나오면 돼요' 로 갈렸다.
    guide: (
      <>
        영수증이 잘 보이게 찍어주세요. <span className="capture__unit">총액이 나오면 돼요.</span>
      </>
    ),
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
  /** 지금 닫으면 잃을 건수. 껍데기가 시트 크기와 닫기 확인을 이 값으로 정한다. */
  onReviewChange?: (pending: number) => void;
  onDone: () => void;
  /** 저장이 성공한 순간. 닫기보다 앞선다. */
  onSaved?: (day: string | null) => void;
  /** 사진으로는 안 될 때 갈 다른 길. 실패 화면과 권한 화면 두 자리에 함께 놓인다. */
  fallbackAction?: ReactNode;
  /**
   * 남은 사진 장수. **시트가 하나를 만들어 두 탭에 나눠 준다.**
   *
   * 탭마다 따로 세면 두 탭이 동시에 떠 있어(`hidden` 으로 감출 뿐이다) 한쪽에서 쓴 것이
   * 다른 쪽 숫자에 안 비친다. 실제로 캡처로 한 장 쓰고 영수증 탭에 가면 그대로 세 장이었다.
   */
  credits: PhotoCreditsHandle;
  /**
   * 지금 이 탭이 보이고 있나.
   *
   * 두 사진 탭은 한꺼번에 떠 있고 안 보이는 쪽을 `hidden` 으로 감춘다. 「장수가 없어
   * 되돌아간 사람」 을 그리는 것만으로 세면 한 번 막힐 때마다 둘로 센다.
   */
  active?: boolean;
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
  onReviewChange,
  onDone,
  onSaved,
  fallbackAction,
  credits,
  active = true,
}: ImageImportTabProps) {
  const mode = MODES[kind];
  const bridge = useBridge();
  const analytics = useAnalytics();
  const analyze = useAnalyzeImage(kind);

  const [batch, setBatch] = useState<ImportBatchOut | null>(null);
  const [pickFailure, setPickFailure] = useState<BridgeErrorCode | null>(null);
  // 보이는 탭에서 막혔을 때만 알린다. 몇 번을 부르든 기록 흐름 하나에 한 줄만 남는다.
  const { left, markBlocked } = credits;
  useEffect(() => {
    if (active && left === 0) markBlocked();
  }, [active, left, markBlocked]);

  if (batch != null) {
    return (
      <ImportReview
        batch={batch}
        flowId={flowId}
        method={kind}
        onBatchChange={setBatch}
        onBusyChange={onBusyChange}
        onReviewChange={onReviewChange}
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
          // 장수까지 떨어졌으면 눌러도 아무 일이 없다. 그때는 받는 자리를 함께 보여 준다.
          onRetry={credits.left === 0 ? undefined : () => void pick()}
          fallbackAction={fallbackAction}
        />
        {credits.left === 0 ? <PhotoCreditGate credits={credits} /> : null}
      </div>
    );
  }

  if (pickFailure === 'UNSUPPORTED' || !bridge.supports(mode.capability)) {
    return (
      <div className="capture" data-testid={mode.panelTestId}>
        {/* 권한 갈래와 같다. 여기서 막히면 그 사람은 기록 자체를 포기한다. */}
        <UnsupportedFeature feature={mode.feature} size="inline" />
        {fallbackAction}
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

      {/*
        다 쓴 사람에게는 고르는 버튼 대신 받는 자리를 둔다. 버튼을 남겨 두고 누른 뒤에
        막으면, 앨범을 열었다 닫는 헛걸음을 시킨 다음에야 안 된다고 말하는 셈이다.
      */}
      {credits.left === 0 ? (
        <PhotoCreditGate credits={credits} fallback={fallbackAction} />
      ) : (
        <>
          {/*
            **장수를 모르는 동안(`null`)에는 눌리지 않는다.** 저장소를 읽는 사이에 눌러 버리면
            0 장인 사람도 한 장을 공짜로 쓰고, 더 나쁘게는 손가락이 내려오는 사이에 이 버튼이
            「광고 한 편 보고 사진 받기」 로 바뀌어 누를 생각이 없던 광고를 누른다.
          */}
          <Button
            fullWidth
            disabled={analyzing || credits.left == null}
            onClick={() => void pick()}
          >
            {pickFailure != null ? '다시 시도' : mode.pickLabel}
          </Button>
          <PhotoCreditLine credits={credits} busy={analyzing} />
        </>
      )}
    </div>
  );

  async function pick(): Promise<void> {
    // 아직 못 읽었으면(`null`) 지나간다. 그 틈은 첫 그림 직후 한순간이고, 넘어가도
    // 셈이 0 아래로는 안 내려간다. 여기서 막으면 버튼이 그 순간 죽은 것처럼 보인다.
    if (credits.left === 0) return;
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
        /*
          **읽어 낸 뒤에, 읽은 것이 있을 때만 센다.**

          고르다 취소하거나 읽기가 실패한 것까지 세면 우리 쪽 사정으로 못 읽은 값을 사람에게
          물리게 된다. 한 건도 못 찾은 사진(`empty`)과 아직 모델이 안 붙어 지어낸 결과(스텁)도
          같다. 영수증을 찍었는데 「읽을 게 없어요」 가 뜨면서 장수가 주는 화면이 제일 나쁘다.
        */
        if (parseOutcome(result) !== 'empty' && !isStub(result)) await credits.spendOne();
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


/** 스텁이 지어낸 결과인지. provider 가 붙으면 이 코드값이 사라져 안내도 함께 사라진다. */
function isStub(batch: ImportBatchOut): boolean {
  return (batch.meta.notes ?? []).includes(STUB_NOTE);
}
