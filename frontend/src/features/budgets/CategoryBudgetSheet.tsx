import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import {
  ApiError,
  parseDecimalOr,
  useDeleteCategoryBudget,
  useSaveCategoryBudget,
  type CategoryBudgetOut,
  type CategoryOut,
  type MonthParams,
} from '../../shared/api';
import { AmountField, BottomSheet, Button, CategoryAvatar, toIconName } from '../../shared/ui';

/** 열려 있으면 대상이 있다. `categoryId` 가 null 이면 새로 추가하는 중이다. */
export interface CategoryBudgetTarget {
  categoryId: string | null;
}

export interface CategoryBudgetSheetProps {
  target: CategoryBudgetTarget | null;
  month: MonthParams;
  /** 고를 수 있는 지출 카테고리. */
  categories: CategoryOut[];
  /** 이미 한도를 정해 둔 줄들. 고르기 목록에서 빼고, 고칠 때 지금 금액을 읽는다. */
  rows: CategoryBudgetOut[];
  onClose: () => void;
}

/**
 * 카테고리 예산 시트. 추가와 수정이 같은 시트다.
 *
 * 이미 한도가 있는 카테고리는 고르기 목록에 없다. 두 번 고르면 앞서 정한 값이 소리 없이 덮인다.
 */
export function CategoryBudgetSheet({
  target,
  month,
  categories,
  rows,
  onClose,
}: CategoryBudgetSheetProps) {
  // 저장·삭제 응답을 기다리는 동안에는 닫히지 않는다.
  // 닫히면 폼이 사라져 실패를 그릴 자리가 없어진다. 적어 둔 한도도 함께 사라진다.
  const [busy, setBusy] = useState(false);

  // 시스템 뒤로가기를 시트가 먼저 가져간다. 안 그러면 시트가 열린 채 화면만 뒤로 빠진다.
  useOverlayBackClose(target != null, onClose, busy);

  const editing = target?.categoryId ?? null;

  return (
    <BottomSheet
      open={target != null}
      onClose={onClose}
      dismissible={!busy}
      title={editing == null ? '카테고리 예산 추가' : '카테고리 예산'}
      className="budget-sheet"
    >
      {target != null ? (
        <CategoryBudgetForm
          // 대상이 바뀌면 새로 마운트한다. 앞 카테고리의 금액이 남지 않는다.
          key={editing ?? 'new'}
          categoryId={editing}
          month={month}
          categories={categories}
          rows={rows}
          onBusyChange={setBusy}
          onClose={onClose}
        />
      ) : null}
    </BottomSheet>
  );
}

interface CategoryBudgetFormProps {
  categoryId: string | null;
  month: MonthParams;
  categories: CategoryOut[];
  rows: CategoryBudgetOut[];
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}

function CategoryBudgetForm({
  categoryId,
  month,
  categories,
  rows,
  onBusyChange,
  onClose,
}: CategoryBudgetFormProps) {
  const save = useSaveCategoryBudget(month);
  const remove = useDeleteCategoryBudget(month);

  const saved = rows.find((row) => row.category_id === categoryId) ?? null;
  const [picked, setPicked] = useState<string | null>(categoryId);
  const [digits, setDigits] = useState(
    saved == null ? '' : String(parseDecimalOr(saved.amount, 0)),
  );

  const busy = save.isPending || remove.isPending;
  const next = Number(digits);
  const canSave = picked != null && digits !== '' && next > 0 && !busy;
  const failure = save.error ?? remove.error;
  const message = failure instanceof ApiError ? failure.message : null;

  // 추가할 때는 아직 한도가 없는 카테고리만 고른다.
  const budgeted = new Set(rows.map((row) => row.category_id));
  const pickable = categories.filter((item) => !budgeted.has(item.id));
  const current = categories.find((item) => item.id === categoryId);
  const adding = categoryId == null;

  // 고를 것이 하나도 없으면 이유를 말한다. 칩도 없고 저장도 안 되는 빈 시트만 남으면
  // 사용자는 화면이 고장 난 것으로 읽는다.
  if (adding && pickable.length === 0) {
    return (
      <div className="budget-sheet__body">
        <p className="budget-sheet__notice">
          고를 수 있는 카테고리가 없어요. 이미 모든 카테고리에 한도를 정했거나 카테고리 목록을
          불러오지 못했어요.
        </p>
        <Button fullWidth variant="outline" onClick={onClose}>
          닫기
        </Button>
      </div>
    );
  }

  return (
    <div className="budget-sheet__body">
      {adding ? (
        <div className="budget-sheet__cats" role="group" aria-label="카테고리">
          {pickable.map((category) => (
            <button
              key={category.id}
              type="button"
              className={
                category.id === picked
                  ? 'budget-sheet__cat budget-sheet__cat--on'
                  : 'budget-sheet__cat'
              }
              aria-pressed={category.id === picked}
              onClick={() => setPicked(category.id)}
            >
              <CategoryAvatar icon={toIconName(category.icon_key)} size={22} />
              {category.name}
            </button>
          ))}
        </div>
      ) : (
        // 아이콘이 div 라 문단(p) 안에 둘 수 없다. 브라우저가 문단을 먼저 닫아 버린다.
        <div className="budget-sheet__picked">
          <CategoryAvatar icon={toIconName(current?.icon_key)} size={28} />
          {current?.name ?? '카테고리'}
        </div>
      )}

      <AmountField label="한도" value={digits} onChange={setDigits} />

      {message ? (
        <p className="budget-sheet__notice" role="alert">
          {message}
        </p>
      ) : null}

      <div className="budget-sheet__actions">
        {categoryId != null ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              // 껍데기 쪽이 닫기를 막을 수 있게 알린다. 여기서만 켜고 응답에서 끈다.
              onBusyChange(true);
              remove.mutate(categoryId, {
                onSettled: () => onBusyChange(false),
                onSuccess: onClose,
              });
            }}
          >
            지우기
          </Button>
        ) : null}
        <Button
          className="budget-sheet__done"
          disabled={!canSave}
          onClick={() => {
            if (picked == null) return;
            onBusyChange(true);
            save.mutate(
              { categoryId: picked, body: { amount: next } },
              { onSettled: () => onBusyChange(false), onSuccess: onClose },
            );
          }}
        >
          저장
        </Button>
      </div>
    </div>
  );
}
