import { useState } from 'react';

import type { AssetGroup, AssetItemOut, InvestKind } from '../../shared/api';
import { Button, SheetHeader } from '../../shared/ui';
import { ASSET_GROUP_VIEWS, INVEST_KIND_LABEL, INVEST_KINDS } from '../assets';
import {
  DEST_GROUPS,
  DEST_LABEL_MAX,
  destFromItem,
  findSameDest,
  newAssetReady,
  type AssetDestPick,
  type NewAssetDraft,
} from './destinations';

export interface NewAssetFormProps {
  /** 같은 이름이 이미 있으면 새로 만들지 않고 그 항목을 고른다. */
  destinations: readonly AssetItemOut[];
  /** 처음 고른 그룹. 기록에서는 투자. */
  initialGroup?: AssetGroup;
  /** 「저장」. 서버에는 아직 만들지 않는다. 거래를 저장할 때 `new_asset` 으로 함께 만든다. */
  onDone: (pick: AssetDestPick) => void;
  onBack: () => void;
}

/** 「새 종목이나 통장」. 그룹, 종류(투자일 때), 이름만 받는다. */
export function NewAssetForm({
  destinations,
  initialGroup = 'investment',
  onDone,
  onBack,
}: NewAssetFormProps) {
  const [draft, setDraft] = useState<NewAssetDraft>({ group: initialGroup, kind: null, label: '' });
  const ready = newAssetReady(draft);

  const pickGroup = (group: AssetGroup) =>
    setDraft((prev) => ({ ...prev, group, kind: group === 'investment' ? prev.kind : null }));
  const pickKind = (kind: InvestKind) => setDraft((prev) => ({ ...prev, kind }));

  const submit = () => {
    if (!ready) return;
    const same = findSameDest(destinations, draft);
    const existing = same == null ? null : destFromItem(same);
    if (existing != null) {
      onDone({ dest: existing, from: 'new', position: 0 });
      return;
    }
    const asset: NewAssetDraft = {
      group: draft.group,
      kind: draft.group === 'investment' ? draft.kind : null,
      label: draft.label.trim(),
    };
    onDone({ dest: { type: 'new', asset }, from: 'new', position: 0 });
  };

  return (
    <div className="asset-dest-new" data-record-step="">
      <SheetHeader onBack={onBack} title="새 종목이나 통장" />
      <div className="asset-dest-new__body">
        <div className="asset-sheet__field">
          <span className="asset-sheet__label">어디에 있는 돈인가요</span>
          <div className="asset-sheet__groups" role="radiogroup" aria-label="자산 그룹">
            {DEST_GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                role="radio"
                aria-checked={draft.group === group}
                className="asset-sheet__group"
                onClick={() => pickGroup(group)}
              >
                {ASSET_GROUP_VIEWS[group].label}
              </button>
            ))}
          </div>
        </div>

        {draft.group === 'investment' ? (
          <div className="asset-sheet__field">
            <span className="asset-sheet__label">종류</span>
            <div className="asset-sheet__kinds" role="radiogroup" aria-label="투자 종류">
              {INVEST_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={draft.kind === kind}
                  className="asset-sheet__kind"
                  onClick={() => pickKind(kind)}
                >
                  {INVEST_KIND_LABEL[kind]}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="asset-sheet__field">
          <span className="asset-sheet__label">이름</span>
          <input
            className="asset-sheet__input"
            value={draft.label}
            onChange={(event) => {
              const label = event.target.value;
              setDraft((prev) => ({ ...prev, label }));
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
            }}
            placeholder={
              draft.group === 'investment' ? '예: 삼성전자, S&P500 ETF' : '예: 토스뱅크 통장'
            }
            maxLength={DEST_LABEL_MAX}
            enterKeyHint="done"
          />
        </label>
      </div>
      <Button className="asset-dest-new__done" disabled={!ready} onClick={submit}>
        저장
      </Button>
    </div>
  );
}
