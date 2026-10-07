import type { Dispatch, SetStateAction } from 'react';

import type { AssetCaptureItemOut } from '../../shared/api';
import { formatCurrency, formatSignedCurrency } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { Button } from '../../shared/ui';
import { assetGroupLabel, itemMetaOf, rateChipOf } from '../assets';

import { captureDelta, captureRowState, capturedItemOf } from './captureMerge';

export interface CaptureReviewProps {
  rows: AssetCaptureItemOut[];
  chosen: boolean[];
  onChosenChange: Dispatch<SetStateAction<boolean[]>>;
  /** 저장 실패 문구. 없으면 null. */
  saveError: string | null;
  saving: boolean;
  /** 지금 목록을 못 받았으면 저장을 막는다. 보내면 남은 항목이 사라진다. */
  canSave: boolean;
  onCancel: () => void;
  onSave: () => void;
}

/**
 * 읽은 줄 검토. 캡처와 적은 글이 같은 화면을 쓴다.
 *
 * 줄마다 그대로, 바뀐 금액, 새 항목을 칩으로 보이고 눌러서 뺄 수 있다.
 */
export function CaptureReview({
  rows,
  chosen,
  onChosenChange,
  saveError,
  saving,
  canSave,
  onCancel,
  onSave,
}: CaptureReviewProps) {
  const count = chosen.filter(Boolean).length;
  return (
    <>
      <ul className="capture-rows">
        {rows.map((row, index) => {
          const state = captureRowState(row);
          const view = capturedItemOf(row);
          const meta = itemMetaOf(view);
          const chip = rateChipOf(view);
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
                  onChosenChange((current) =>
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
                  {meta != null ? (
                    <span className="capture-row__meta" data-numeric="">
                      {meta}
                    </span>
                  ) : null}
                </span>
                <span className="capture-row__right">
                  <b className="capture-row__amount">{formatCurrency(Number(row.amount))}</b>
                  {chip != null ? (
                    <i
                      className={`asset-chip asset-chip--${chip.tone}`}
                      data-testid={TEST_IDS.captureRate}
                    >
                      {chip.text}
                    </i>
                  ) : null}
                </span>
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
        <Button variant="outline" disabled={saving} onClick={onCancel}>
          취소
        </Button>
        <Button
          className="capture-sheet__main"
          disabled={count === 0 || !canSave || saving}
          onClick={onSave}
        >
          {count}줄 저장
        </Button>
      </div>
    </>
  );
}
