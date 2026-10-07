import { useState, type ReactNode } from 'react';

import { useBridge } from '../../app/providers';
import {
  EVENTS,
  useAnalytics,
  type AssetCaptureAd,
  type AssetCaptureFrom,
} from '../../shared/analytics';
import {
  ApiError,
  useAssets,
  useCaptureAssets,
  useSaveAssets,
  type AssetCaptureItemOut,
} from '../../shared/api';
import { BridgeError, type PickedImage } from '../../shared/toss';
import { TEST_IDS } from '../../shared/testIds';
import { Button, Gauge, PermissionDenied, UnsupportedFeature, iconUrl } from '../../shared/ui';
import { useInterstitial } from '../ads';

import { CaptureReview } from './CaptureReview';
import { mergeCaptured } from './captureMerge';

export type CaptureStep = 'intro' | 'reading' | 'review' | 'fail' | 'denied' | 'unsupported';

/**
 * 못 읽은 다음 한 번은 광고 없이 읽는다. 시트를 닫거나 빈 자산 화면에서 「직접 적기」 로
 * 넘어가 시트가 새로 마운트돼도 앱을 켜 둔 동안은 남는다. 기록하기에서 읽어도 같은 값이다.
 */
let freeAfterFail = false;

/** 다음 한 번을 광고 없이 읽나. 예고 줄이 지키지 못할 말을 적지 않게 한다. */
export function nextReadIsFree(): boolean {
  return freeAfterFail;
}

export interface CaptureFlowOptions {
  /** 어디서 열었나. 로그에 싣는다. */
  from: AssetCaptureFrom;
  /** 저장이 끝난 뒤. 흐름은 이미 처음으로 돌아가 있다. */
  onSaved: () => void;
  /** 검토 화면 「취소」. 흐름은 이미 처음으로 돌아가 있다. */
  onCancel: () => void;
  /** 못 읽은 화면의 「직접 적기」. 흐름은 이미 처음으로 돌아가 있다. */
  onManual: () => void;
}

export interface CaptureFlow {
  step: CaptureStep;
  /** 읽는 중이거나 저장하는 중. 이때는 닫거나 뒤로 가지 못한다. */
  locked: boolean;
  /** 검토 화면에 든 줄 수. 아니면 0. */
  pending: number;
  /** 이 기기에서 읽는 동안 광고가 설 수 있나. 예고 줄을 이 값으로 가른다. */
  adAvailable: boolean;
  /** 사진을 고른다. 누른 손짓 안에서 불러야 기기가 막지 않는다. */
  pick: () => Promise<void>;
  /** 처음으로 되돌린다. 검토 중이었으면 취소로 남긴다. */
  reset: () => void;
  /** 단계마다의 화면. 감싸는 쪽(시트, 기록하기 패널)이 그대로 그린다. */
  view: ReactNode;
}

/**
 * 잔액 화면 캡처로 자산을 채우는 흐름. 자산 화면 시트와 기록하기 패널이 함께 쓴다.
 *
 * 사진을 고르면 읽는 동안 전면 광고가 한 편 선다(상한 없음). 광고가 어떻게 끝나든 읽은
 * 결과를 보인다. 못 읽었으면 다음 한 번은 광고 없이 읽는다. 아무것도 저장하지 않은 채
 * 닫으면 서버에도 남는 것이 없다.
 */
export function useCaptureFlow({
  from,
  onSaved,
  onCancel,
  onManual,
}: CaptureFlowOptions): CaptureFlow {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const assets = useAssets();
  const capture = useCaptureAssets();
  const save = useSaveAssets();
  const interstitial = useInterstitial('asset_capture');
  const [step, setStep] = useState<CaptureStep>('intro');
  const [rows, setRows] = useState<AssetCaptureItemOut[]>([]);
  const [chosen, setChosen] = useState<boolean[]>([]);
  const [ad, setAd] = useState<AssetCaptureAd>('skipped');
  const [failure, setFailure] = useState<string | null>(null);

  const picked = rows.filter((_, index) => chosen[index]);
  const newCount = picked.filter((row) => row.item_key == null).length;
  const locked = step === 'reading' || save.isPending;

  function log(params: Record<string, string | number>): void {
    analytics.log(EVENTS.assetCapture, { ...params, from, input: 'photo' }, { kind: 'click' });
  }

  function reset(): void {
    if (locked) return;
    if (step === 'review') log({ step: 'cancelled', ad });
    setStep('intro');
    setRows([]);
    setChosen([]);
    setFailure(null);
    save.reset();
  }

  async function pick(): Promise<void> {
    if (locked) return;
    let images: PickedImage[];
    try {
      images = await bridge.pickPhotos({ maxCount: 1, maxWidth: 1600 });
    } catch (error) {
      if (error instanceof BridgeError && error.code === 'PERMISSION_DENIED') {
        setStep('denied');
        return;
      }
      if (error instanceof BridgeError && error.code === 'UNSUPPORTED') {
        setStep('unsupported');
        return;
      }
      log({ step: 'cancelled' });
      return;
    }
    const image = images[0];
    if (image == null) {
      log({ step: 'cancelled' });
      return;
    }

    log({ step: 'picked' });
    setFailure(null);
    setStep('reading');
    const free = freeAfterFail;
    freeAfterFail = false;

    // 읽기와 광고를 같이 건다. 광고가 읽는 시간을 채운다.
    const reading = capture
      .mutateAsync(image.dataUri)
      .then((result) => ({ items: result.items, error: null }))
      .catch((error: unknown) => ({ items: [] as AssetCaptureItemOut[], error }));
    const watching: Promise<AssetCaptureAd> = free
      ? Promise.resolve('free_after_fail')
      : interstitial
          .show('asset_capture', { uncapped: true })
          .then((outcome) => (outcome.result === 'watched' ? 'watched' : 'skipped'));
    const [result, adUsed] = await Promise.all([reading, watching]);
    setAd(adUsed);

    if (result.items.length === 0) {
      freeAfterFail = true;
      setFailure(result.error instanceof ApiError ? result.error.message : null);
      log({ step: 'failed', ad: adUsed, rows: 0, new_items: 0 });
      setStep('fail');
      return;
    }

    setRows(result.items);
    setChosen(result.items.map(() => true));
    log({
      step: 'read',
      ad: adUsed,
      rows: result.items.length,
      new_items: result.items.filter((row) => row.item_key == null).length,
    });
    setStep('review');
  }

  function saveRows(): void {
    // 목록을 못 받은 채 보내면 남은 항목이 사라진다.
    if (assets.data == null || picked.length === 0) return;
    save.mutate(
      { items: mergeCaptured(assets.data.items, picked), source: 'screenshot' },
      {
        onSuccess: () => {
          log({ step: 'saved', ad, rows: picked.length, new_items: newCount });
          setStep('intro');
          setRows([]);
          setChosen([]);
          onSaved();
        },
      },
    );
  }

  const saveError = save.error instanceof ApiError ? save.error.message : null;

  const view = (
    <div className="capture-sheet" data-testid={TEST_IDS.captureSheet} data-step={step}>
      {step === 'intro' ? (
        <>
          <p className="capture-sheet__lead">
            {interstitial.available
              ? '은행이나 증권 앱의 잔액 화면을 올리면 읽어요. 읽는 동안 광고가 나와요'
              : '은행이나 증권 앱의 잔액 화면을 올리면 읽어요'}
          </p>
          <Button fullWidth onClick={() => void pick()}>
            사진 고르기
          </Button>
        </>
      ) : null}

      {step === 'reading' ? (
        <div className="capture-sheet__reading" data-testid={TEST_IDS.captureReading}>
          <b className="capture-sheet__state">읽는 중이에요</b>
          <Gauge className="capture-sheet__gauge" ratio={0.9} size={8} label="읽는 중이에요" />
        </div>
      ) : null}

      {step === 'fail' ? (
        <div data-testid={TEST_IDS.captureFail}>
          <div className="capture-sheet__reading">
            <img className="capture-sheet__art" src={iconUrl('60_plant')} alt="" />
            <b className="capture-sheet__state">{failure ?? '이 사진에서는 잔액을 못 찾았어요'}</b>
          </div>
          <div className="capture-sheet__actions">
            <Button
              variant="outline"
              onClick={() => {
                reset();
                onManual();
              }}
            >
              직접 적기
            </Button>
            <Button className="capture-sheet__main" onClick={() => void pick()}>
              다른 사진 고르기
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'denied' ? (
        <PermissionDenied resource="photos" size="inline" onRetry={() => void pick()} />
      ) : null}

      {step === 'unsupported' ? <UnsupportedFeature feature="캡처로 채우기" size="inline" /> : null}

      {step === 'review' ? (
        <CaptureReview
          rows={rows}
          chosen={chosen}
          onChosenChange={setChosen}
          saveError={saveError}
          saving={save.isPending}
          canSave={assets.data != null}
          onCancel={() => {
            reset();
            onCancel();
          }}
          onSave={saveRows}
        />
      ) : null}
    </div>
  );

  return {
    step,
    locked,
    pending: step === 'review' ? rows.length : 0,
    adAvailable: interstitial.available,
    pick,
    reset,
    view,
  };
}
