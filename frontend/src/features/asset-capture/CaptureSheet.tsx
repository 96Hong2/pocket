import { useState } from 'react';

import { useBridge } from '../../app/providers';
import { EVENTS, useAnalytics, type AssetCaptureAd } from '../../shared/analytics';
import {
  ApiError,
  useAssets,
  useCaptureAssets,
  useSaveAssets,
  type AssetCaptureItemOut,
} from '../../shared/api';
import { formatCurrency, formatSignedCurrency } from '../../shared/lib/format';
import { BridgeError, type PickedImage } from '../../shared/toss';
import { TEST_IDS } from '../../shared/testIds';
import {
  BottomSheet,
  Button,
  Gauge,
  PermissionDenied,
  UnsupportedFeature,
  iconUrl,
} from '../../shared/ui';
import { useInterstitial } from '../ads';
import { assetGroupLabel } from '../assets';

import { captureDelta, captureRowState, mergeCaptured } from './captureMerge';

type Step = 'intro' | 'reading' | 'review' | 'fail' | 'denied' | 'unsupported';

/**
 * 못 읽은 다음 한 번은 광고 없이 읽는다. 시트를 닫거나 빈 자산 화면에서 「직접 적기」 로
 * 넘어가 시트가 새로 마운트돼도 앱을 켜 둔 동안은 남는다.
 */
let freeAfterFail = false;

export interface CaptureSheetProps {
  open: boolean;
  onClose: () => void;
  /** 「직접 적기」. 없으면 시트만 닫는다. */
  onManual?: () => void;
}

/**
 * 잔액 화면 캡처로 자산을 채우는 시트.
 *
 * 사진을 고르면 읽는 동안 전면 광고가 한 편 선다(상한 없음). 광고가 어떻게 끝나든 읽은
 * 결과를 보인다. 못 읽었으면 다음 한 번은 광고 없이 읽는다. 아무것도 저장하지 않은 채
 * 닫으면 서버에도 남는 것이 없다.
 */
export function CaptureSheet({ open, onClose, onManual }: CaptureSheetProps) {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const assets = useAssets();
  const capture = useCaptureAssets();
  const save = useSaveAssets();
  const interstitial = useInterstitial('asset_capture');
  const [step, setStep] = useState<Step>('intro');
  const [rows, setRows] = useState<AssetCaptureItemOut[]>([]);
  const [chosen, setChosen] = useState<boolean[]>([]);
  const [ad, setAd] = useState<AssetCaptureAd>('skipped');
  const [failure, setFailure] = useState<string | null>(null);

  const picked = rows.filter((_, index) => chosen[index]);
  const newCount = picked.filter((row) => row.item_key == null).length;

  function close(): void {
    if (step === 'reading' || save.isPending) return;
    if (step === 'review') {
      analytics.log(EVENTS.assetCapture, { step: 'cancelled', ad }, { kind: 'click' });
    }
    setStep('intro');
    setRows([]);
    setChosen([]);
    setFailure(null);
    save.reset();
    onClose();
  }

  async function pick(): Promise<void> {
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
      analytics.log(EVENTS.assetCapture, { step: 'cancelled' }, { kind: 'click' });
      return;
    }
    const image = images[0];
    if (image == null) {
      analytics.log(EVENTS.assetCapture, { step: 'cancelled' }, { kind: 'click' });
      return;
    }

    analytics.log(EVENTS.assetCapture, { step: 'picked' }, { kind: 'click' });
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
      analytics.log(
        EVENTS.assetCapture,
        { step: 'failed', ad: adUsed, rows: 0, new_items: 0 },
        { kind: 'click' },
      );
      setStep('fail');
      return;
    }

    setRows(result.items);
    setChosen(result.items.map(() => true));
    analytics.log(
      EVENTS.assetCapture,
      {
        step: 'read',
        ad: adUsed,
        rows: result.items.length,
        new_items: result.items.filter((row) => row.item_key == null).length,
      },
      { kind: 'click' },
    );
    setStep('review');
  }

  function saveRows(): void {
    // 목록을 못 받은 채 보내면 남은 항목이 사라진다.
    if (assets.data == null || picked.length === 0) return;
    save.mutate(
      { items: mergeCaptured(assets.data.items, picked), source: 'screenshot' },
      {
        onSuccess: () => {
          analytics.log(
            EVENTS.assetCapture,
            { step: 'saved', ad, rows: picked.length, new_items: newCount },
            { kind: 'click' },
          );
          setStep('intro');
          setRows([]);
          setChosen([]);
          onClose();
        },
      },
    );
  }

  const saveError = save.error instanceof ApiError ? save.error.message : null;

  return (
    <BottomSheet
      open={open}
      onClose={close}
      dismissible={step !== 'reading' && !save.isPending}
      title={step === 'intro' ? '캡처로 채우기' : step === 'review' ? '이렇게 읽었어요' : undefined}
      size={step === 'review' ? 'tall' : 'auto'}
    >
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
              <b className="capture-sheet__state">
                {failure ?? '이 사진에서는 잔액을 못 찾았어요'}
              </b>
            </div>
            <div className="capture-sheet__actions">
              <Button
                variant="outline"
                onClick={() => {
                  close();
                  onManual?.();
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

        {step === 'unsupported' ? (
          <UnsupportedFeature feature="캡처로 채우기" size="inline" />
        ) : null}

        {step === 'review' ? (
          <>
            <ul className="capture-rows">
              {rows.map((row, index) => {
                const state = captureRowState(row);
                return (
                  <li key={`${row.name}-${index}`}>
                    <button
                      type="button"
                      className="capture-row"
                      role="checkbox"
                      aria-checked={chosen[index] === true}
                      data-testid={TEST_IDS.captureRow}
                      data-state={state}
                      onClick={() =>
                        setChosen((current) =>
                          current.map((value, at) => (at === index ? !value : value)),
                        )
                      }
                    >
                      <span className="capture-row__check" aria-hidden="true">
                        ✓
                      </span>
                      <span className="capture-row__name">
                        {row.name}
                        <i className={`capture-row__chip is-${state}`}>
                          {state === 'same'
                            ? '그대로'
                            : state === 'changed'
                              ? formatSignedCurrency(captureDelta(row))
                              : `새 항목, ${assetGroupLabel(row.group)}`}
                        </i>
                      </span>
                      <b className="capture-row__amount">{formatCurrency(Number(row.amount))}</b>
                    </button>
                  </li>
                );
              })}
            </ul>
            {saveError != null ? (
              <p className="capture-sheet__error" role="alert">
                {saveError}
              </p>
            ) : null}
            <div className="capture-sheet__actions">
              <Button variant="outline" disabled={save.isPending} onClick={close}>
                취소
              </Button>
              <Button
                className="capture-sheet__main"
                disabled={picked.length === 0 || assets.data == null || save.isPending}
                onClick={saveRows}
              >
                {picked.length}줄 저장
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </BottomSheet>
  );
}
