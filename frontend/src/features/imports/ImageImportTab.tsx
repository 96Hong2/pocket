import { useState, type ReactNode } from 'react';

import { useBridge } from '../../app/providers';
import { EVENTS, useAnalytics, type FlowId, type PickOutcome } from '../../shared/analytics';
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

import { AdConsent } from '../ads';

import { ImportReview } from './ImportReview';
import { ParseProgress, type ParseStep } from './ParseProgress';
import { PhotoCreditLine } from './PhotoCreditLine';
import type { PhotoAdPlan, PhotoCreditsHandle } from './usePhotoCredits';

/** 사진 한 장을 어디서 가져오는가. 그 뒤로는 두 갈래가 같은 길을 지난다. */
export type ImageImportKind = 'capture' | 'receipt';

/** 서버가 스텁 결과라고 알리는 코드값. 한국어 문구는 화면이 정한다. */
const STUB_NOTE = 'stub_image';

/**
 * 앨범에서 한 번에 고를 수 있는 장수. 서버 상한(`service.MAX_IMAGES`)과 같아야 한다.
 *
 * 다섯인 이유는 리워드 광고 한 편 안에 읽기가 끝나리라 보는 선이기 때문이다. 더 받으면 광고가
 * 끝난 뒤에도 사람이 빈 화면을 본다.
 */
export const MAX_PHOTOS = 5;

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
  /** 사진을 가져온다. 취소는 두 갈래 모두 빈 배열로 맞춰 돌려준다. */
  pick: (bridge: MiniAppBridge) => Promise<PickedImage[]>;
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
    /*
      **여러 장을 고르게 한다.** 카드 내역은 한 화면에 다 안 들어와서 두세 장을 이어 찍는
      일이 잦은데, 예전에는 한 장씩 고르고 검토하고 저장하기를 되풀이해야 했다.
      읽는 것은 서버가 겹쳐서 하므로 다섯 장이 한 장보다 그리 오래 걸리지 않는다.
    */
    pick: (bridge) => bridge.pickPhotos({ maxCount: MAX_PHOTOS, maxWidth: 1600 }),
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
    // 카메라는 한 번에 한 장이다. 여러 장은 앨범 쪽(캡처)에서만 고를 수 있다.
    pick: async (bridge) => {
      const one = await bridge.captureReceipt({ maxWidth: 1600 });
      return one == null ? [] : [one];
    },
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
   * 오늘 무료분과 광고 계획. **시트가 하나를 만들어 두 탭에 나눠 준다.**
   *
   * 탭마다 따로 세면 두 탭이 동시에 떠 있어(`hidden` 으로 감출 뿐이다) 한쪽에서 쓴 것이
   * 다른 쪽 숫자에 안 비친다. 실제로 캡처로 한 장 쓰고 영수증 탭에 가면 그대로 남아 있었다.
   */
  credits: PhotoCreditsHandle;
  /**
   * 화면에서 고른 「적을 날」. 오늘이면 `null` 이다.
   *
   * **사진에 적힌 날짜가 언제나 이긴다.** 영수증에 9월 20일이 인쇄돼 있으면 그 날로 간다.
   * 이 값은 날짜를 못 읽은 줄이 떨어질 자리일 뿐이다.
   */
  baseDay?: string | null;
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
  baseDay = null,
}: ImageImportTabProps) {
  const mode = MODES[kind];
  const bridge = useBridge();
  const analytics = useAnalytics();
  const analyze = useAnalyzeImage(kind);

  const [batch, setBatch] = useState<ImportBatchOut | null>(null);
  const [pickFailure, setPickFailure] = useState<BridgeErrorCode | null>(null);
  /*
    광고를 보겠냐고 묻는 중. `resolve` 는 사진을 고른 쪽이 기다리고 있는 답이다.

    상태로 들고 있는 이유는 확인 창이 화면이기 때문이다. `pick()` 한가운데서 사람의
    답을 기다려야 해서, 창을 띄우고 그 답을 약속으로 돌려준다.
  */
  const [asking, setAsking] = useState<{
    plan: PhotoAdPlan;
    count: number;
    resolve: (allowed: boolean) => void;
  } | null>(null);

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
          onRetry={() => void pick()}
          fallbackAction={fallbackAction}
        />
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
          {/*
            **치른 값을 말해 준다.** 광고를 끝까지 보고도 빈손이면 다시 누르기가 망설여진다.
            다음 한 번이 공짜라는 것을 여기서 말하지 않으면 사용자는 알 방법이 없다.
          */}
          {credits.owed ? <span>광고는 다시 안 나와요</span> : null}
        </p>
      ) : null}

      {/*
        스피너 하나만 돌던 자리다. 12초 안팎이 걸리는데 아무 변화가 없어, 멈춘 줄 알고
        뒤로 나가는 사람이 있었다. 남은 시간 대신 지금 무엇을 하는 중인지를 보여 준다.
      */}
      {analyzing ? <ParseProgress steps={mode.progressSteps} slowHint={mode.slowHint} /> : null}

      {/*
        **버튼은 늘 같은 자리에 같은 말로 있다.** 예전에는 장수가 떨어지면 이 자리가
        「광고 한 편 보고 사진 받기」 로 바뀌었는데, 손가락이 내려오는 사이에 버튼이
        바뀌면 누를 생각이 없던 광고를 누르게 된다. 지금은 사진을 고른 **뒤에** 묻는다.

        **광고가 도는 동안에도 잠근다.** 읽기 요청이 먼저 끝나면(실패도 끝이다) `analyzing`
        이 풀리는데, 그때 광고는 아직 화면을 덮고 있다. 여기를 안 잠그면 광고가 닫히는
        순간에 한 번 더 눌려 두 편이 겹친다.

        **장수를 모르는 동안(`null`)에는 눌리지 않는다.** 저장소를 읽는 사이에 눌러 버리면
        무료분을 다 쓴 사람도 광고 없이 한 장을 더 쓴다. 그 틈은 첫 그림 직후 한순간이다.
      */}
      <Button
        fullWidth
        disabled={analyzing || credits.busy || credits.free == null}
        onClick={() => void pick()}
      >
        {pickFailure != null ? '다시 시도' : mode.pickLabel}
      </Button>
      <PhotoCreditLine credits={credits} />

      {/* 사진을 고른 뒤, 광고가 뜨기 바로 전에 선다. 여기서 「닫기」 면 아무 일도 없다. */}
      {asking != null ? (
        <AdConsent
          what={asking.count > 1 ? `사진 ${asking.count}장 읽기` : '사진 읽기'}
          meanwhile={waitHint(asking.count)}
          onCancel={() => {
            credits.markDeclined(asking.plan, asking.count);
            asking.resolve(false);
            setAsking(null);
          }}
          onConfirm={() => {
            asking.resolve(true);
            setAsking(null);
          }}
        />
      ) : null}
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
      // 아무것도 안 골랐으면 스스로 그만둔 것이라 아무 말도 하지 않는다.
      if (picked.length === 0) {
        analytics.log(EVENTS.imagePickResult, { method: kind, result: 'cancelled' }, { flowId });
        return;
      }
      // 몇 장을 골랐는지만 남긴다. 그림도, 파일 이름도, 크기도 싣지 않는다.
      analytics.log(
        EVENTS.imagePickResult,
        { method: kind, result: 'ok', image_count: picked.length },
        { flowId },
      );

      /*
        **광고가 필요하면 여기서 묻는다.** 앨범을 열기 전이 아니라 연 다음이다.
        무엇을 몇 장 골랐는지 알아야 창에 장수를 적을 수 있고,
        고르다 그만둔 사람에게는 광고 이야기를 아예 안 꺼내게 된다.
      */
      const plan = credits.planFor(picked.length);
      if (plan !== 'none' && !(await askConsent(plan, picked.length))) return;

      analytics.log(EVENTS.parseStarted, { method: kind, image_count: picked.length }, { flowId });
      // 걸린 시간은 우리가 잰다. 서버 로그로는 사용자가 실제로 기다린 시간을 알 수 없다.
      const startedAt = Date.now();
      /*
        **읽기를 먼저 띄우고 광고를 그 위에 얹는다.** 광고가 끝나기를 기다렸다가 보내면
        사람이 광고 시간 + 읽는 시간을 다 기다린다. 광고는 이미 있는 기다림을 채우는
        것이지 새 기다림을 만드는 것이 아니다.

        약속을 곧바로 받아 둔다(`then` 두 갈래). 광고가 도는 동안 읽기가 실패하면
        아무도 안 받은 거절이 되어 브라우저가 경고를 찍는다.
      */
      const pending = analyze
        .mutateAsync({ value: picked.map((one) => one.dataUri), baseDay })
        .then((ok) => ({ ok }) as const)
        .catch((error: unknown) => ({ error }) as const);
      await credits.play(plan, picked.length);
      const settled = await pending;

      if ('error' in settled) {
        analytics.log(
          EVENTS.parseFinished,
          {
            method: kind,
            result: 'failed',
            elapsed_ms: Date.now() - startedAt,
            image_count: picked.length,
            error_code: settled.error instanceof ApiError ? settled.error.code : 'unknown',
          },
          { flowId },
        );
        // 광고는 끝까지 봤는데 읽어 내지 못했다. 다음 한 번은 광고 없이 간다.
        if (plan !== 'none') credits.markWasted(plan, picked.length);
        return;
      }

      const result = settled.ok;
      analytics.log(
        EVENTS.parseFinished,
        {
          method: kind,
          result: parseOutcome(result),
          elapsed_ms: Date.now() - startedAt,
          image_count: picked.length,
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
      if (parseOutcome(result) !== 'empty' && !isStub(result)) await credits.spend(picked.length);
      setBatch(result);
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

  /** 확인 창을 띄우고 사람의 답을 기다린다. 「닫기」 면 아무 일도 일어나지 않는다. */
  function askConsent(plan: PhotoAdPlan, count: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => setAsking({ plan, count, resolve }));
  }
}

/**
 * 얼마나 기다리는지 한 줄.
 *
 * **광고가 아니라 기다림을 주어로 쓴다.** 「광고를 보면 읽어 드려요」 는 광고를 치르고
 * 기능을 사는 거래로 읽히는데, 실제로는 어차피 걸리는 시간이다.
 *
 * **초를 적지 않는다.** 이 저장소가 `AdAheadNote` 와 `BudgetCalcAsk` 에서 이미 정한
 * 규칙이다. 광고 길이는 우리가 못 정하고, 실제 기다림은 읽기와 광고 중 **긴 쪽**이라
 * 「10초쯤」 이라고 적으면 지키지 못할 약속이 된다.
 */
function waitHint(count: number): string {
  // 몇 장인지는 제목이 이미 말한다. 여기서 또 적으면 한 창에 같은 숫자가 두 번 나온다.
  return count > 1 ? '읽는 데 시간이 조금 걸려요.' : '읽는 데 잠깐 걸려요.';
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
