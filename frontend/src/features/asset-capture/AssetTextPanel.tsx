import { useImperativeHandle, useState } from 'react';

import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  ApiError,
  useAssets,
  useCaptureAssetsText,
  useSaveAssets,
  type AssetCaptureItemOut,
} from '../../shared/api';
import { NL_TEXT_MAX_LENGTH } from '../../shared/lib/limits';
import { TEST_IDS } from '../../shared/testIds';
import { Button, LoadingState } from '../../shared/ui';

import type { AssetFillPanelProps } from './AssetCapturePanel';
import { CaptureReview } from './CaptureReview';
import { mergeCaptured } from './captureMerge';
import { useReport } from './useReport';

const PLACEHOLDER = '삼성전자 3주 21만원, 카카오뱅크 적금 300만원';
const FIELD_ID = 'asset-text';

type TextStep = 'write' | 'review' | 'empty';

export interface AssetTextPanelProps extends AssetFillPanelProps {
  /**
   * 아직 안 읽힌 글이 적혀 있나. 줄글 패널과 같은 까닭으로 상태가 아니라 칸에 적는다.
   * 감싼 시트가 나가기 전에 물을지를 이 값으로도 정한다.
   */
  draftRef?: { current: boolean };
}

/**
 * 기록하기의 「글로 쓰기」 + 「저축·투자」. 적은 보유 내역을 캡처와 같은 검토 화면으로 채운다.
 *
 * 읽기는 광고 없이 한다. 기록하기의 줄글 읽기와 같다. 저장은 자산 목록에 얹는다.
 */
export function AssetTextPanel({
  ref,
  draftRef,
  onBusyChange,
  onPendingChange,
  onSaved,
  onCancel,
}: AssetTextPanelProps) {
  const analytics = useAnalytics();
  const assets = useAssets();
  const read = useCaptureAssetsText();
  const save = useSaveAssets();
  const [text, setText] = useState('');
  const [step, setStep] = useState<TextStep>('write');
  const [rows, setRows] = useState<AssetCaptureItemOut[]>([]);
  const [chosen, setChosen] = useState<boolean[]>([]);

  const locked = read.isPending || save.isPending;
  const pending = step === 'review' ? rows.length : 0;
  const picked = rows.filter((_, index) => chosen[index]);
  if (draftRef != null) draftRef.current = step === 'write' && text.trim() !== '';

  function log(params: Record<string, string | number>): void {
    analytics.log(
      EVENTS.assetCapture,
      { ...params, from: 'record', input: 'text' },
      { kind: 'click' },
    );
  }

  function reset(): void {
    if (locked) return;
    if (step === 'review') log({ step: 'cancelled' });
    setStep('write');
    setRows([]);
    setChosen([]);
    save.reset();
  }

  useImperativeHandle(ref, () => ({ start: () => undefined, reset }));

  useReport(locked, onBusyChange);
  useReport(pending, onPendingChange);

  function analyze(): void {
    const value = text.trim();
    if (value === '' || locked) return;
    read.mutate(value, {
      onSuccess: (result) => {
        const fresh = result.items.filter((row) => row.item_key == null).length;
        if (result.items.length === 0) {
          log({ step: 'failed', rows: 0, new_items: 0 });
          setStep('empty');
          return;
        }
        log({ step: 'read', rows: result.items.length, new_items: fresh });
        setRows(result.items);
        setChosen(result.items.map(() => true));
        setStep('review');
      },
    });
  }

  function saveRows(): void {
    if (assets.data == null || picked.length === 0) return;
    save.mutate(
      // 사람이 적은 값이라 캡처 출처로 적지 않는다.
      { items: mergeCaptured(assets.data.items, picked), source: 'manual' },
      {
        onSuccess: () => {
          log({
            step: 'saved',
            rows: picked.length,
            new_items: picked.filter((row) => row.item_key == null).length,
          });
          setText('');
          setStep('write');
          setRows([]);
          setChosen([]);
          onSaved();
        },
      },
    );
  }

  if (step === 'review') {
    return (
      <div className="capture-sheet" data-testid={TEST_IDS.captureSheet} data-step="review">
        <CaptureReview
          rows={rows}
          chosen={chosen}
          onChosenChange={setChosen}
          saveError={save.error instanceof ApiError ? save.error.message : null}
          saving={save.isPending}
          canSave={assets.data != null}
          onCancel={() => {
            reset();
            onCancel();
          }}
          onSave={saveRows}
        />
      </div>
    );
  }

  if (step === 'empty') {
    return (
      <div className="capture-sheet" data-testid={TEST_IDS.captureSheet} data-step="fail">
        <p className="capture-text__empty" data-testid={TEST_IDS.captureFail}>
          금액을 찾지 못했어요. 「삼성전자 3주 21만원」 처럼 금액을 함께 적어 주세요
        </p>
        <Button variant="outline" fullWidth onClick={() => setStep('write')}>
          다시 쓰기
        </Button>
      </div>
    );
  }

  const message = read.error instanceof ApiError ? read.error.message : null;

  return (
    <div className="capture-sheet" data-testid={TEST_IDS.captureSheet} data-step="intro">
      <div className="capture-text">
        <label className="capture-text__label" htmlFor={FIELD_ID}>
          어디에 얼마 있나요
        </label>
        <textarea
          id={FIELD_ID}
          className="capture-text__input"
          value={text}
          rows={4}
          maxLength={NL_TEXT_MAX_LENGTH}
          placeholder={PLACEHOLDER}
          disabled={read.isPending}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      {message != null ? (
        <p className="capture-sheet__error" role="alert">
          {message}
        </p>
      ) : null}
      {read.isPending ? <LoadingState size="inline" label="읽는 중이에요" /> : null}
      <Button fullWidth disabled={text.trim() === '' || locked} onClick={analyze}>
        분석
      </Button>
    </div>
  );
}
