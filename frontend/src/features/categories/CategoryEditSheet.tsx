import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import {
  ApiError,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
  type CategoryOut,
} from '../../shared/api';
import { KindToggle, type LedgerKind } from '../../shared/ledger';
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
      /*
        아이콘 격자만 여섯 줄이라 내용만큼 열면 아래 저장 버튼이 접힌 자리 밖으로 밀린다.
        저장을 못 찾아 이름만 고치고 시트를 닫은 사람이 실제로 있었다.
      */
      size="tall"
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

export interface CategoryEditFormProps {
  category?: CategoryOut;
  /** 저장·삭제가 도는 동안. 이 폼을 감싼 자리가 닫기를 잠그는 데 쓴다. 필요 없으면 안 넘긴다. */
  onBusyChange?: (busy: boolean) => void;
  onClose: () => void;
  /**
   * 종류를 고르지 못하게 못 박는다. 기록 시트 안에서 만들 때 쓴다.
   * 거기서는 이미 지출·수입을 골라 둔 상태라 다시 묻는 것이 한 단계 더다.
   */
  fixedKind?: LedgerKind;
  /** 만들어진 직후. 만든 것을 그 자리에서 바로 고르게 하려고 돌려준다. */
  onCreated?: (created: CategoryOut) => void;
}

/**
 * 카테고리 한 건을 만들거나 고치는 폼.
 *
 * 시트(`CategoryEditSheet`)와 기록 시트 안의 만들기 자리가 이 하나를 나눠 쓴다.
 * 두 벌로 두면 한쪽에만 아이콘 탭이 붙는 식으로 갈라진다.
 */
export function CategoryEditForm({
  category,
  onBusyChange,
  onClose,
  fixedKind,
  onCreated,
}: CategoryEditFormProps) {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();

  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState<IconName>(
    category == null ? FALLBACK_CATEGORY_ICON : toIconName(category.icon_key),
  );
  // 직접 건 이모지·사진. 있으면 아이콘 대신 이게 그려진다.
  const [custom, setCustom] = useState<string | null>(category?.icon_custom ?? null);
  // 종류는 만들 때만 정한다. 나중에 바꾸면 그 분류로 적어 둔 지난 기록이 종류와 어긋난다.
  const [kind, setKind] = useState<LedgerKind>(
    fixedKind ?? (category?.kind === 'income' ? 'income' : 'expense'),
  );
  // 지우기는 한 단을 더 받는다. 시트를 하나 더 겹치면 포커스가 흔들려 여기서 묻는다.
  const [confirming, setConfirming] = useState(false);
  /*
    이모지 칸에 이모지가 아닌 글자가 남았나.

    그대로 저장하면 친 글자는 버려지고 아무도 안 고른 별표가 걸린다. 아래 한 줄을 못 본
    사람에게는 친 글자가 그대로 될 것처럼 보여, 저장하고 나서야 다른 그림을 본다.
    **막고 왜 막혔는지 그 자리에 적는다.**
  */
  const [iconInvalid, setIconInvalid] = useState(false);

  const busy = create.isPending || update.isPending || remove.isPending;
  const trimmed = name.trim();
  const canSave = trimmed !== '' && !iconInvalid && !busy;

  // 지우기 실패 문구가 남아 있으면 그다음 저장이 왜 막혔는지 말하지 못한다.
  // 확인을 접을 때 지우기 오류를 함께 지운다.
  const failure =
    (confirming ? failureOf(remove.error, '카테고리를 지우지 못했어요.') : null) ??
    failureOf(update.error, '카테고리를 저장하지 못했어요.') ??
    failureOf(create.error, '카테고리를 저장하지 못했어요.');

  function save(): void {
    if (!canSave) return;
    // 껍데기 쪽이 닫기를 막을 수 있게 알린다. 여기서만 켜고 응답에서 끈다.
    onBusyChange?.(true);

    if (category == null) {
      create.mutate(
        { name: trimmed, icon_key: icon, icon_custom: custom, kind },
        {
          onSettled: () => onBusyChange?.(false),
          onSuccess: (created) => {
            // 만든 것을 먼저 넘기고 닫는다. 순서가 뒤집히면 받는 쪽이 이미 사라진 뒤다.
            onCreated?.(created);
            onClose();
          },
        },
      );
    } else {
      update.mutate(
        // 아이콘은 한 번에 하나만 보낸다. 서버가 보낸 쪽을 걸고 나머지를 지운다.
        {
          id: category.id,
          body:
            custom == null
              ? { name: trimmed, icon_key: icon }
              : { name: trimmed, icon_custom: custom },
        },
        { onSettled: () => onBusyChange?.(false), onSuccess: onClose },
      );
    }
  }

  function destroy(): void {
    if (category == null) return;
    onBusyChange?.(true);
    remove.mutate(category.id, {
      onSettled: () => onBusyChange?.(false),
      onSuccess: onClose,
    });
  }

  return (
    <div className="cat-sheet__body">
      {category == null && fixedKind == null ? (
        <div className="cat-sheet__field">
          <span className="cat-sheet__label">종류</span>
          <KindToggle value={kind} onChange={setKind} disabled={busy} ariaLabel="분류의 종류" />
          <span className="cat-sheet__note">
            기록 시트에서 이 종류를 골랐을 때 나와요. 만든 뒤에는 바꿀 수 없어요
          </span>
        </div>
      ) : null}

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

      <div className="cat-sheet__field cat-sheet__field--icon">
        <span className="cat-sheet__label">아이콘</span>
        <IconPicker
          value={icon}
          custom={custom}
          disabled={busy}
          onInvalidChange={setIconInvalid}
          onChange={(next) => {
            setIcon(next.icon);
            setCustom(next.custom);
          }}
        />
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
        /* 저장은 시트 바닥에 붙는다. 아이콘 격자를 스크롤해도 늘 같은 자리에 있어야 한다. */
        <div className="cat-sheet__foot">
          {/*
            저장이 왜 회색인지 그 자리에서 말한다. 이유가 위쪽 격자 아래에만 있으면,
            버튼만 보고 있는 사람에게는 앱이 고장 난 것으로 읽힌다.
          */}
          {iconInvalid ? (
            <p className="cat-sheet__notice" role="status">
              이모지가 아닌 글자가 들어 있어요. 지우거나 이모지를 골라 주세요
            </p>
          ) : null}
          {/* 같은 규칙이 이름에도 걸린다. 이쪽만 이유 없이 회색이면 앱이 고장 난 것으로 읽힌다. */}
          {!iconInvalid && trimmed === '' ? (
            <p className="cat-sheet__notice" role="status">
              이름을 적어 주세요
            </p>
          ) : null}
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
