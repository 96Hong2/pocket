import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import {
  ApiError,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
  type CategoryOut,
} from '../../shared/api';
import {
  BottomSheet,
  Button,
  FALLBACK_CATEGORY_ICON,
  toIconName,
  type IconName,
} from '../../shared/ui';

import { IconPicker } from './IconPicker';

export interface CategoryEditSheetProps {
  open: boolean;
  /** 있으면 고치는 중이다. 없으면 새로 만든다. */
  category?: CategoryOut;
  onClose: () => void;
}

/**
 * 카테고리 시트. 만들기와 고치기가 같은 시트다.
 *
 * 기본 카테고리는 여기까지 오지 않는다. 목록에서 아예 누를 수 없다.
 */
export function CategoryEditSheet({ open, category, onClose }: CategoryEditSheetProps) {
  // 저장·삭제 응답을 기다리는 동안에는 닫히지 않는다.
  // 닫히면 적어 둔 이름과 고른 아이콘이 함께 사라진다.
  const [busy, setBusy] = useState(false);

  // 시스템 뒤로가기를 시트가 먼저 가져간다. 안 그러면 시트가 열린 채 화면만 뒤로 빠진다.
  useOverlayBackClose(open, onClose, busy);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title={category == null ? '카테고리 만들기' : '카테고리 고치기'}
      className="cat-sheet"
    >
      {open ? (
        <CategoryEditForm
          // 대상이 바뀌면 새로 마운트한다. 앞 카테고리의 이름이 남지 않는다.
          key={category?.id ?? 'new'}
          category={category}
          onBusyChange={setBusy}
          onClose={onClose}
        />
      ) : null}
    </BottomSheet>
  );
}

interface CategoryEditFormProps {
  category?: CategoryOut;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}

function CategoryEditForm({ category, onBusyChange, onClose }: CategoryEditFormProps) {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();

  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState<IconName>(
    category == null ? FALLBACK_CATEGORY_ICON : toIconName(category.icon_key),
  );
  // 지우기는 한 단을 더 받는다. 시트를 하나 더 겹치면 포커스가 흔들려 여기서 묻는다.
  const [confirming, setConfirming] = useState(false);

  const busy = create.isPending || update.isPending || remove.isPending;
  const trimmed = name.trim();
  const canSave = trimmed !== '' && !busy;

  // 지우기 실패 문구가 남아 있으면 그다음 저장이 왜 막혔는지 말하지 못한다.
  // 확인을 접을 때 지우기 오류를 함께 지운다.
  const failure =
    (confirming ? failureOf(remove.error, '카테고리를 지우지 못했어요.') : null) ??
    failureOf(update.error, '카테고리를 저장하지 못했어요.') ??
    failureOf(create.error, '카테고리를 저장하지 못했어요.');

  function save(): void {
    if (!canSave) return;
    // 껍데기 쪽이 닫기를 막을 수 있게 알린다. 여기서만 켜고 응답에서 끈다.
    onBusyChange(true);

    if (category == null) {
      create.mutate(
        { name: trimmed, icon_key: icon },
        { onSettled: () => onBusyChange(false), onSuccess: onClose },
      );
    } else {
      update.mutate(
        { id: category.id, body: { name: trimmed, icon_key: icon } },
        { onSettled: () => onBusyChange(false), onSuccess: onClose },
      );
    }
  }

  function destroy(): void {
    if (category == null) return;
    onBusyChange(true);
    remove.mutate(category.id, {
      onSettled: () => onBusyChange(false),
      onSuccess: onClose,
    });
  }

  return (
    <div className="cat-sheet__body">
      <label className="cat-sheet__field">
        <span className="cat-sheet__label">이름</span>
        <input
          className="cat-sheet__input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          // 무엇을 적으면 되는지 예를 보여 준다. 물음만 던지면 무엇이 답인지 모른다.
          placeholder="이름 (예: 반려동물, 데이트)"
          maxLength={40}
        />
      </label>

      <div className="cat-sheet__field">
        <span className="cat-sheet__label">아이콘</span>
        <IconPicker value={icon} onChange={setIcon} disabled={busy} />
      </div>

      {failure ? (
        <p className="cat-sheet__notice" role="alert">
          {failure}
        </p>
      ) : null}

      {confirming ? (
        <div className="cat-sheet__confirm" role="group" aria-label="지우기 확인">
          <p className="cat-sheet__confirm-text">
            지울까요? 이 카테고리로 적어 둔 기록은 그대로 남아요. 대신 걸어 둔 한도와 기억한 분류는
            함께 사라지고, 같은 이름으로 다시 만들어도 그 둘은 돌아오지 않아요
          </p>
          <div className="cat-sheet__actions">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                remove.reset();
                setConfirming(false);
              }}
            >
              그대로 둘게요
            </Button>
            <Button variant="outline" disabled={busy} onClick={destroy}>
              지우기
            </Button>
          </div>
        </div>
      ) : (
        <div className="cat-sheet__actions">
          {category != null ? (
            <Button variant="outline" disabled={busy} onClick={() => setConfirming(true)}>
              지우기
            </Button>
          ) : null}
          <Button className="cat-sheet__done" disabled={!canSave} onClick={save}>
            저장
          </Button>
        </div>
      )}
    </div>
  );
}

/** 왜 막혔는지는 서버가 안다. 이름 중복 같은 문구를 화면이 새로 짓지 않는다. */
function failureOf(error: unknown, fallback: string): string | null {
  if (error == null) return null;
  return error instanceof ApiError ? error.message : fallback;
}
