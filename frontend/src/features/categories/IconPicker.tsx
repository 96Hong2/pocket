import { useEffect, useState } from 'react';

import { useBridge } from '../../app/providers';
import { BridgeError } from '../../shared/toss';
import {
  CategoryAvatar,
  SegmentedControl,
  emojiIcon,
  iconUrl,
  isEmoji,
  NOT_EMOJI_MESSAGE,
  parseCustomIcon,
  SM_ICONS,
  type IconName,
} from '../../shared/ui';

import { IconPhotoError, toIconPhoto } from './iconPhoto';

/** 무엇으로 아이콘을 고를 것인가. 셋 중 하나만 걸린다. */
type Source = 'basic' | 'emoji' | 'photo';

const SOURCES = [
  { value: 'basic' as const, label: '기본' },
  { value: 'emoji' as const, label: '이모지' },
  { value: 'photo' as const, label: '사진' },
];

export interface IconPickerProps {
  /** 앱에 든 아이콘. 이모지·사진을 지우면 여기로 돌아온다. */
  value: IconName;
  /** 직접 건 것. 없으면 null. */
  custom: string | null;
  onChange: (next: { icon: IconName; custom: string | null }) => void;
  /**
   * 이모지 칸에 이모지가 아닌 글자가 남아 있나.
   *
   * 그대로 저장하면 친 글자는 버려지고 **아무도 안 고른 별표**가 걸린다. 아래 한 줄을
   * 못 본 사람에게는 친 글자가 그대로 될 것처럼 보여, 저장하고 나서야 다른 그림을 본다.
   * 그래서 이 값이 참인 동안은 감싼 폼이 저장을 막는다.
   */
  onInvalidChange?: (invalid: boolean) => void;
  /** 지금 고른 바탕색. 미리보기에 함께 그린다. */
  color?: string | null;
  disabled?: boolean;
  /**
   * 기본 아이콘 격자를 펼친 채로 열까.
   *
   * 새로 만들 때는 펼친다. 아직 아무것도 안 골랐으니 고를 것이 바로 보여야 한다.
   * 이미 있는 분류를 고칠 때는 접는다. 그 사람은 아이콘을 이미 고른 사람이다.
   */
  startOpen?: boolean;
}

/**
 * 카테고리에 붙일 아이콘을 고른다.
 *
 * 세 가지를 한 자리에서 고른다: 앱에 든 그림 · 휴대폰 자판의 이모지 · 직접 찍거나 고른 사진.
 * 어느 쪽을 고르든 걸리는 것은 하나라, 탭을 옮기는 순간이 아니라 실제로 고른 순간에만 바뀐다.
 * 탭만 눌렀다고 아이콘이 바뀌면, 구경하다가 실수로 지워진다.
 *
 * 기본 아이콘 목록의 정본은 `shared/ui/icons` 의 `SM_ICONS` 다.
 */
export function IconPicker({
  value,
  custom,
  color = null,
  onChange,
  onInvalidChange,
  disabled = false,
  startOpen = true,
}: IconPickerProps) {
  const picked = parseCustomIcon(custom);
  const [source, setSource] = useState<Source>(picked?.kind ?? 'basic');
  /*
    격자는 고르는 순간 접힌다.

    아이콘이 예순 칸을 넘어 격자가 화면을 다 먹었다. 그 아래 저장 버튼이 안 보여서,
    이름까지 다 적고도 어디를 눌러야 저장인지 못 찾았다는 신고가 왔다.
    고르고 나면 더 볼 일이 없는 목록이라 접고, 다시 고를 길만 남긴다.
  */
  const [gridOpen, setGridOpen] = useState(startOpen);

  /*
    이모지 탭을 떠나면 막힌 것도 함께 풀린다.

    다른 탭에서 그림을 골랐는데 안 보이는 칸에 남은 글자 때문에 저장이 막히면, 무엇이
    잘못됐는지 화면 어디에도 없다.
  */
  function markInvalid(invalid: boolean): void {
    onInvalidChange?.(invalid);
  }

  return (
    <div className="icon-picker">
      <div className="icon-picker__head">
        {/* 지금 걸린 것을 늘 보여 준다. 탭을 옮겨도 이 자리는 안 바뀐다. */}
        {/* 색도 함께 그린다. 아래에서 색을 고르는데 위 미리보기가 회색이면 안 먹은 줄 안다. */}
        <CategoryAvatar icon={value} custom={custom} color={color} size={52} />
        <SegmentedControl
          className="icon-picker__tabs"
          options={SOURCES}
          value={source}
          onChange={(next) => {
            if (next !== 'emoji') markInvalid(false);
            setSource(next);
          }}
          ariaLabel="아이콘 고르는 방법"
        />
      </div>

      {source === 'basic' ? (
        gridOpen ? (
          <BasicGrid
            value={custom == null ? value : null}
            disabled={disabled}
            onPick={(icon) => {
              onChange({ icon, custom: null });
              setGridOpen(false);
            }}
          />
        ) : (
          <div className="icon-picker__pane">
            <button
              type="button"
              className="icon-picker__reopen"
              disabled={disabled}
              onClick={() => setGridOpen(true)}
            >
              아이콘 다시 고르기
            </button>
          </div>
        )
      ) : source === 'emoji' ? (
        <EmojiField
          glyph={picked?.kind === 'emoji' ? picked.glyph : ''}
          disabled={disabled}
          onInvalidChange={markInvalid}
          onPick={(glyph) =>
            onChange({ icon: value, custom: glyph === '' ? null : emojiIcon(glyph) })
          }
        />
      ) : (
        <PhotoField
          hasPhoto={picked?.kind === 'photo'}
          disabled={disabled}
          onPick={(photo) => onChange({ icon: value, custom: photo })}
        />
      )}
    </div>
  );
}

/** 앱에 든 아이콘 격자. 사진·이모지가 걸려 있으면 아무 칸도 눌려 있지 않다. */
function BasicGrid({
  value,
  disabled,
  onPick,
}: {
  value: IconName | null;
  disabled: boolean;
  onPick: (icon: IconName) => void;
}) {
  return (
    <div className="icon-picker__grid" role="group" aria-label="아이콘">
      {SM_ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          className={
            icon === value ? 'icon-picker__cell icon-picker__cell--on' : 'icon-picker__cell'
          }
          aria-pressed={icon === value}
          aria-label={iconLabel(icon)}
          disabled={disabled}
          onClick={() => onPick(icon)}
        >
          <img
            className="icon-picker__img"
            src={iconUrl(icon)}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * 휴대폰 자판으로 이모지를 하나 넣는다.
 *
 * 이모지 목록을 우리가 그리지 않는다. 기기마다 쓸 수 있는 이모지가 다르고, 목록을 들고 있으면
 * 새 이모지가 나올 때마다 앱을 새로 내야 한다. 자판에 이미 있는 것을 쓴다.
 */
function EmojiField({
  glyph,
  disabled,
  onPick,
  onInvalidChange,
}: {
  glyph: string;
  disabled: boolean;
  onPick: (glyph: string) => void;
  onInvalidChange: (invalid: boolean) => void;
}) {
  /*
    입력 칸에 보이는 글자와 실제로 걸린 이모지는 다를 수 있다.

    숫자나 자음을 눌렀을 때 칸이 비어 버리면 무엇을 눌렀는지도 모른 채 다시 누르게 된다.
    친 것은 그대로 두고, 이모지가 아닐 때만 아래에 왜 안 되는지 적는다.

    **그 상태로는 저장도 막는다.** 아래 한 줄을 못 본 사람에게는 친 글자가 그대로 될
    것처럼 보이는데, 실제로 걸리는 것은 아무도 안 고른 별표다.
  */
  const [typed, setTyped] = useState(glyph);
  const rejected = typed !== '' && !isEmoji(typed);

  useEffect(() => {
    onInvalidChange(rejected);
    // 칸이 사라지면 막힌 것도 함께 푼다. 안 보이는 칸이 저장을 막으면 이유를 찾을 수 없다.
    return () => onInvalidChange(false);
    // 부르는 쪽이 인라인 함수를 넘겨도 값이 같으면 아무것도 다시 그리지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rejected]);

  function change(raw: string): void {
    // 두 글자를 넣어도 마지막 하나만 남긴다. 아이콘 자리에는 하나만 들어간다.
    const next = lastGlyph(raw);
    setTyped(next);
    // 이모지가 아닌 글자로 걸린 아이콘을 덮지 않는다. 지우려면 아래 되돌리기가 있다.
    if (next === '' || isEmoji(next)) onPick(next);
  }

  return (
    <div className="icon-picker__pane">
      <label className="icon-picker__emoji-row">
        <span className="icon-picker__sr">이모지</span>
        <input
          className="icon-picker__emoji-input"
          value={typed}
          disabled={disabled}
          inputMode="text"
          onChange={(event) => change(event.target.value)}
          placeholder="🙂"
          aria-describedby="icon-picker-emoji-hint"
          aria-invalid={rejected}
        />
      </label>
      {rejected ? (
        <p className="icon-picker__notice" role="alert">
          {NOT_EMOJI_MESSAGE}
        </p>
      ) : (
        <p className="icon-picker__hint" id="icon-picker-emoji-hint">
          자판의 이모지 버튼을 눌러 골라 주세요. 하나만 들어가요
        </p>
      )}
      {glyph ? (
        <button
          type="button"
          className="icon-picker__clear"
          disabled={disabled}
          onClick={() => {
            setTyped('');
            onPick('');
          }}
        >
          기본 아이콘으로 되돌리기
        </button>
      ) : null}
    </div>
  );
}

/** 앨범에서 고르거나 그 자리에서 찍는다. 줄이는 일은 `iconPhoto` 가 한다. */
function PhotoField({
  hasPhoto,
  disabled,
  onPick,
}: {
  hasPhoto: boolean;
  disabled: boolean;
  onPick: (photo: string | null) => void;
}) {
  const bridge = useBridge();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const locked = disabled || busy;

  async function take(from: 'album' | 'camera'): Promise<void> {
    setFailure(null);
    setBusy(true);
    try {
      const image =
        from === 'album'
          ? ((await bridge.pickPhotos({ maxCount: 1, maxWidth: 1024 }))[0] ?? null)
          : await bridge.captureReceipt({ maxWidth: 1024 });
      // 취소하면 null 이다. 사용자가 그만둔 것이라 아무 말도 하지 않는다.
      if (image == null) return;
      onPick(await toIconPhoto(image.dataUri));
    } catch (error) {
      setFailure(reasonOf(error, from));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="icon-picker__pane">
      <div className="icon-picker__photo-actions">
        <button
          type="button"
          className="icon-picker__photo-button"
          disabled={locked || !bridge.supports('albumPick')}
          onClick={() => void take('album')}
        >
          앨범에서 고르기
        </button>
        <button
          type="button"
          className="icon-picker__photo-button"
          disabled={locked || !bridge.supports('camera')}
          onClick={() => void take('camera')}
        >
          사진 찍기
        </button>
      </div>
      <p className="icon-picker__hint">
        {busy ? '사진을 준비하고 있어요' : '가운데를 동그랗게 잘라서 아이콘으로 써요'}
      </p>
      {failure ? (
        <p className="icon-picker__notice" role="alert">
          {failure}
        </p>
      ) : null}
      {hasPhoto ? (
        <button
          type="button"
          className="icon-picker__clear"
          disabled={locked}
          onClick={() => onPick(null)}
        >
          기본 아이콘으로 되돌리기
        </button>
      ) : null}
    </div>
  );
}

/** 왜 안 됐는지 한 줄. 권한과 낮은 앱 버전은 다르게 말해야 다음에 할 일이 달라진다. */
function reasonOf(error: unknown, from: 'album' | 'camera'): string {
  const place = from === 'album' ? '앨범' : '카메라';
  if (error instanceof IconPhotoError) return error.message;
  if (error instanceof BridgeError) {
    if (error.code === 'PERMISSION_DENIED') {
      return `${place} 접근이 꺼져 있어요. 휴대폰 설정에서 켜 주세요.`;
    }
    if (error.code === 'UNSUPPORTED') {
      return `이 토스 앱 버전에서는 ${place}를 열 수 없어요.`;
    }
  }
  return `${place}를 열지 못했어요. 다시 시도해 주세요.`;
}

/**
 * 마지막 이모지 하나만 남긴다.
 *
 * 살색이나 깃발처럼 코드 포인트 여럿이 한 글자인 이모지가 있어 문자 단위로 자르면 깨진다.
 * `Intl.Segmenter` 가 글자 단위를 안다.
 */
function lastGlyph(raw: string): string {
  const value = raw.trim();
  if (value === '') return '';
  const parts = [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(value)];
  return parts[parts.length - 1]?.segment ?? '';
}

/** 파일 이름 앞의 번호는 추가된 순서일 뿐이라 읽을 이름에서 뗀다. */
function iconLabel(icon: IconName): string {
  return icon.replace(/^\d+_/, '').replace(/_/g, ' ');
}
