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
  // 시스템 뒤로가기를 시트가 먼저 가져간다. 안 그러면 시트가 열린 채 화면만 뒤로 빠진다.
  useOverlayBackClose(target != null, onClose);

  const editing = target?.categoryId ?? null;

  return (
    <BottomSheet
      open={target != null}
      onClose={onClose}
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
  onClose: () => void;
}

function CategoryBudgetForm({
  categoryId,
  month,
  categories,
  rows,
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

  return (
    <div className="budget-sheet__body">
      {categoryId == null ? (
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
        <p className="budget-sheet__picked">
          <CategoryAvatar icon={toIconName(current?.icon_key)} size={28} />
          {current?.name ?? '카테고리'}
        </p>
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
            onClick={() => remove.mutate(categoryId, { onSuccess: onClose })}
          >
            지우기
          </Button>
        ) : null}
        <Button
          className="budget-sheet__done"
          disabled={!canSave}
          onClick={() => {
            if (picked == null) return;
            save.mutate(
              { categoryId: picked, body: { amount: next } },
              { onSuccess: onClose },
            );
          }}
        >
          저장
        </Button>
      </div>
    </div>
  );
}
