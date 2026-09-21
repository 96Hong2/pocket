import { useId, useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  ApiError,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
  type CategoryOut,
  type TagColor,
} from '../../shared/api';
import { KindToggle, type LedgerKind } from '../../shared/ledger';
import {
  BottomSheet,
  Button,
  ColorPicker,
  FALLBACK_CATEGORY_ICON,
  parseCustomIcon,
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
 * **기본 카테고리도 여기까지 온다.** 이름·아이콘·색을 고칠 수 있고, 고친 것은 그 사람
 * 화면에만 남는다(서버가 내 설정에 덮어쓰기로 적는다). 「식비」 를 「밥값」 이라 부르는
 * 사람이 기본 분류를 통째로 버리고 같은 것을 손으로 다시 만들지 않아도 된다.
 *
 * 기본 분류에서 막히는 것은 둘이다. **지우기**(그 행을 남들도 쓴다)와 **종류 바꾸기**
 * (그 분류로 적어 둔 지난 기록이 종류와 어긋난다).
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
  const colorId = useId();
  const analytics = useAnalytics();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  /** 기본 분류인가. 지우기와 종류 바꾸기만 막힌다. 이름·아이콘·색은 고칠 수 있다. */
  const isDefault = category?.is_default === true;

  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState<IconName>(
    category == null ? FALLBACK_CATEGORY_ICON : toIconName(category.icon_key),
  );
  // 직접 건 이모지·사진. 있으면 아이콘 대신 이게 그려진다.
  const [custom, setCustom] = useState<string | null>(category?.icon_custom ?? null);
  // 동그라미 바탕색. 안 고르면 null 이고 무채색 기본 바탕이다.
  const [color, setColor] = useState<TagColor | null>(category?.color ?? null);
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
  /** 사진을 걸었나. 사진은 동그라미를 꽉 채워 바탕색이 안 드러난다. */
  const photoPicked = parseCustomIcon(custom)?.kind === 'photo';
  const trimmed = name.trim();
  const canSave = trimmed !== '' && !iconInvalid && !busy;

  // 지우기 실패 문구가 남아 있으면 그다음 저장이 왜 막혔는지 말하지 못한다.
  // 확인을 접을 때 지우기 오류를 함께 지운다.
  const failure =
    (confirming ? failureOf(remove.error, '카테고리를 지우지 못했어요.') : null) ??
    failureOf(update.error, '카테고리를 저장하지 못했어요.') ??
    failureOf(create.error, '카테고리를 저장하지 못했어요.');

  /**
   * 무엇을 건드렸나. 로그에만 쓴다.
   *
   * 셋 중 어느 것을 고치려고 들어오는지가 이 화면의 값이다. 색만 바꾸러 오는 사람이
   * 거의 없으면 색은 없어도 되는 기능이고, 이름만 바꾸러 오는 사람이 많으면 기본
   * 이름이 그 사람들 말과 어긋난 것이다. **이름 자체는 안 싣는다.**
   */
  function touched(): string {
    if (category == null) return 'new';
    const parts = [
      trimmed === category.name ? null : 'name',
      icon === toIconName(category.icon_key) && custom === (category.icon_custom ?? null)
        ? null
        : 'icon',
      color === (category.color ?? null) ? null : 'color',
    ].filter((part) => part != null);
    return parts.length === 0 ? 'none' : parts.join('+');
  }

  /** 서버가 받아 준 뒤에만 센다. 이름은 안 싣는다. */
  function logged(action: 'created' | 'updated' | 'deleted', fields: string): void {
    analytics.log(
      EVENTS.categoryChanged,
      { action, scope: isDefault ? 'default' : 'mine', kind, fields },
      { kind: 'click' },
    );
  }

  function save(): void {
    if (!canSave) return;
    // 껍데기 쪽이 닫기를 막을 수 있게 알린다. 여기서만 켜고 응답에서 끈다.
    onBusyChange?.(true);
    const fields = touched();

    if (category == null) {
      create.mutate(
        { name: trimmed, icon_key: icon, icon_custom: custom, color, kind },
        {
          onSettled: () => onBusyChange?.(false),
          onSuccess: (created) => {
            logged('created', fields);
            // 만든 것을 먼저 넘기고 닫는다. 순서가 뒤집히면 받는 쪽이 이미 사라진 뒤다.
            onCreated?.(created);
            onClose();
          },
        },
      );
    } else {
      update.mutate(
        /*
          아이콘은 한 번에 하나만 보낸다. 서버가 보낸 쪽을 걸고 나머지를 지운다.

          색은 **늘 보낸다.** null 이 「그대로 둔다」 가 아니라 「색을 뗀다」 라서,
          안 보내면 한 번 고른 색을 영영 못 뗀다. 이름·아이콘과 규칙이 다르다.
        */
        {
          id: category.id,
          body:
            custom == null
              ? { name: trimmed, icon_key: icon, color }
              : { name: trimmed, icon_custom: custom, color },
        },
        {
          onSettled: () => onBusyChange?.(false),
          onSuccess: () => {
            logged('updated', fields);
            onClose();
          },
        },
      );
    }
  }

  function destroy(): void {
    if (category == null) return;
    onBusyChange?.(true);
    remove.mutate(category.id, {
      onSettled: () => onBusyChange?.(false),
      onSuccess: () => {
        logged('deleted', 'none');
        onClose();
      },
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

      {/*
        기본 분류를 고치러 들어온 사람에게 **무엇이 남의 화면에 가는지** 먼저 말한다.
        이 한 줄이 없으면 「식비」 를 고쳐 놓고 남들 화면도 바뀐 줄 아는 사람이 생긴다.
      */}
      {isDefault ? (
        <p className="cat-sheet__note cat-sheet__note--lead">
          기본 분류예요. 여기서 바꾼 이름과 그림, 색은 내 화면에만 보여요
        </p>
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
          color={color}
          disabled={busy}
          startOpen={category == null}
          onInvalidChange={setIconInvalid}
          onChange={(next) => {
            setIcon(next.icon);
            setCustom(next.custom);
          }}
        />
      </div>

      <div className="cat-sheet__field">
        <span className="cat-sheet__label" id={`${colorId}-label`}>
          색
        </span>
        {/*
          태그와 같은 것을 쓴다. 카테고리는 아이콘이 이미 얼굴이라 **색을 안 골라도 된다.**
          격자 위의 「색 없음」 이 그 자리이고, 한 번 고른 색을 떼는 길도 그것뿐이다.
        */}
        <ColorPicker
          value={color}
          disabled={busy || photoPicked}
          clearable
          labelledBy={`${colorId}-label`}
          onChange={setColor}
        />
        {/*
          **사진을 건 분류에는 색이 안 보인다.** 사진이 동그라미를 꽉 채워서 바탕이
          한 픽셀도 안 드러난다. 고를 수 있게 두고 아무 일도 안 일어나면 고장으로
          읽히므로, 잠그고 왜 잠겼는지 그 자리에 적는다.
        */}
        <span className="cat-sheet__note">
          {photoPicked
            ? '사진은 동그라미를 꽉 채워서 색이 보이지 않아요. 아이콘이나 이모지로 바꾸면 고를 수 있어요'
            : '목록과 기록 화면에서 이 색이 동그라미에 깔려요'}
        </span>
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
            {/* 기본 분류는 남들도 쓰는 한 행이라 지우는 길을 두지 않는다. */}
            {category != null && !isDefault ? (
              <Button variant="outline" disabled={busy} onClick={() => setConfirming(true)}>
                지우기
              </Button>
            ) : null}
            {/* 「저장」 만 적으면 무엇이 저장되는지가 안 보인다. 만들 때만 대상을 적는다. */}
            <Button className="cat-sheet__done" disabled={!canSave} onClick={save}>
              {category == null ? '새 카테고리 저장' : '저장'}
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
