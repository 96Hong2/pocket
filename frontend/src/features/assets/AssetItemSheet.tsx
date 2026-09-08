import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import {
  ApiError,
  parseDecimalOr,
  useSaveAssets,
  type AssetGroup,
  type AssetItemIn,
  type AssetItemOut,
} from '../../shared/api';
import { AmountField, BottomSheet, Button, SegmentedControl } from '../../shared/ui';

import { ASSET_GROUP_VIEWS } from './assetGroups';

/** 열려 있으면 대상이 있다. `sortOrder` 가 null 이면 새로 더하는 중이다. */
export interface AssetItemTarget {
  sortOrder: number | null;
  /** 새로 더할 때 미리 골라 둘 그룹. 고칠 때는 그 줄의 그룹이 들어온다. */
  group: AssetGroup;
}

export interface AssetItemSheetProps {
  target: AssetItemTarget | null;
  /**
   * 지금 저장돼 있는 목록 전체.
   *
   * 저장은 목록을 통째로 보내는 PUT 하나뿐이라, 고친 줄만 보낼 수 없다.
   * 이 목록에 한 줄을 얹거나 갈거나 빼서 보낸다.
   */
  items: AssetItemOut[];
  onClose: () => void;
}

/** 자산 항목 시트. 더하기와 고치기가 같은 시트다. */
export function AssetItemSheet({ target, items, onClose }: AssetItemSheetProps) {
  // 저장 응답을 기다리는 동안에는 닫히지 않는다.
  // 닫히면 폼이 사라져 실패를 그릴 자리가 없어진다. 적어 둔 금액도 함께 사라진다.
  const [saving, setSaving] = useState(false);

  // 시스템 뒤로가기를 시트가 먼저 가져간다. 안 그러면 시트가 열린 채 화면만 뒤로 빠진다.
  useOverlayBackClose(target != null, onClose, saving);

  const editing = target?.sortOrder ?? null;

  return (
    <BottomSheet
      open={target != null}
      onClose={onClose}
      dismissible={!saving}
      title={editing == null ? '자산 항목 추가' : '자산 항목 고치기'}
      className="asset-sheet"
    >
      {target != null ? (
        <AssetItemForm
          // 대상이 바뀌면 새로 마운트한다. 앞 항목의 이름과 금액이 남지 않는다.
          key={editing ?? `new-${target.group}`}
          target={target}
          items={items}
          onSavingChange={setSaving}
          onClose={onClose}
        />
      ) : null}
    </BottomSheet>
  );
}

interface AssetItemFormProps {
  target: AssetItemTarget;
  items: AssetItemOut[];
  onSavingChange: (saving: boolean) => void;
  onClose: () => void;
}

const GROUP_OPTIONS = (Object.keys(ASSET_GROUP_VIEWS) as AssetGroup[]).map((group) => ({
  value: group,
  label: ASSET_GROUP_VIEWS[group].label,
}));

function AssetItemForm({ target, items, onSavingChange, onClose }: AssetItemFormProps) {
  const save = useSaveAssets();

  const saved = items.find((item) => item.sort_order === target.sortOrder) ?? null;
  const [group, setGroup] = useState<AssetGroup>(saved?.group ?? target.group);
  const [label, setLabel] = useState(saved?.label ?? '');
  const [digits, setDigits] = useState(
    saved == null ? '' : String(parseDecimalOr(saved.amount, 0)),
  );

  const canSave = digits !== '' && !save.isPending;
  const message = save.error instanceof ApiError ? save.error.message : null;

  function send(next: AssetItemIn[]): void {
    // 껍데기 쪽이 닫기를 막을 수 있게 알린다. 여기서만 켜고 응답에서 끈다.
    onSavingChange(true);
    save.mutate({ items: next }, { onSettled: () => onSavingChange(false), onSuccess: onClose });
  }

  return (
    <div className="asset-sheet__body">
      <div className="asset-sheet__field">
        <span className="asset-sheet__label">어디에 있는 돈인가요</span>
        <SegmentedControl
          options={GROUP_OPTIONS}
          value={group}
          onChange={setGroup}
          ariaLabel="자산 그룹"
        />
        <span className="asset-sheet__hint">{ASSET_GROUP_VIEWS[group].hint}</span>
      </div>

      <label className="asset-sheet__field">
        <span className="asset-sheet__label">이름 (선택)</span>
        <input
          className="asset-sheet__input"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="예: 토스뱅크 통장"
          maxLength={80}
        />
      </label>

      <AmountField label="금액" value={digits} onChange={setDigits} />
      {/* 부채도 양수로 적는다. 빼는 것은 그룹이 정하므로 마이너스를 적을 이유가 없다. */}
      <p className="asset-sheet__hint">대략이면 충분해요. 부채도 그냥 남은 금액을 적어요</p>

      {message ? (
        <p className="asset-sheet__notice" role="alert">
          {message}
        </p>
      ) : null}

      <div className="asset-sheet__actions">
        {target.sortOrder != null ? (
          <Button
            variant="outline"
            disabled={save.isPending}
            onClick={() =>
              send(items.filter((item) => item.sort_order !== target.sortOrder).map(toItemIn))
            }
          >
            지우기
          </Button>
        ) : null}
        <Button
          className="asset-sheet__done"
          disabled={!canSave}
          onClick={() => {
            const next: AssetItemIn = {
              group,
              label: label.trim() === '' ? null : label.trim(),
              amount: Number(digits),
            };
            if (target.sortOrder == null) {
              send([...items.map(toItemIn), next]);
              return;
            }
            send(
              items.map((item) => (item.sort_order === target.sortOrder ? next : toItemIn(item))),
            );
          }}
        >
          저장
        </Button>
      </div>
    </div>
  );
}

/** 저장돼 있는 줄을 그대로 다시 보낼 형태로 옮긴다. 금액은 서버가 준 문자열을 건드리지 않는다. */
function toItemIn(item: AssetItemOut): AssetItemIn {
  return { group: item.group, label: item.label, amount: item.amount };
}
