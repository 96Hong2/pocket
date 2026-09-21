import { useId, useState } from 'react';

import { EVENTS, useAnalytics, type ItemAction } from '../../shared/analytics';
import {
  ApiError,
  useCreateTag,
  useUpdateTag,
  type TagColor,
  type TagKind,
  type TagOut,
} from '../../shared/api';
import { Button, ColorPicker } from '../../shared/ui';

import { TAG_COLORS } from '../../shared/lib/tagColors';

/** 서버가 받는 길이. 화면에서 먼저 막아 422 를 왕복하지 않는다. */
const NAME_MAX = 12;

/**
 * 태그를 만들고 고치는 폼.
 *
 * 만들 때만 종류를 정한다. 지출 태그를 수입 태그로 바꾸면 그 태그로 적어 둔 지난 기록이
 * 종류와 어긋나고, 이미 본 리포트의 숫자가 나중에 달라진다. 카테고리와 같은 규칙이다.
 *
 * 색은 열네 개 중에서 고른다. 자유 입력으로 받으면 배경과 구분이 안 되는 색이 들어오고,
 * 그 위에 얹을 글자색을 화면이 매번 계산해야 한다. 일곱씩 두 줄로 세워 한 번에 다 보인다.
 *
 * **처음 값은 마운트할 때 한 번만 읽는다.** 부르는 쪽이 `key` 로 대상이 바뀐 것을 알려 준다.
 * effect 로 다시 채우면 저장 응답이 돌아오는 순간 사용자가 적던 값이 덮인다.
 */
export interface TagFormProps {
  /** 고칠 태그. 없으면 새로 만든다. */
  tag?: TagOut;
  /** 새로 만들 때의 종류. 고칠 때는 그 태그의 종류를 그대로 쓴다. */
  kind: TagKind;
  onDone: () => void;
  onCancel: () => void;
}

export function TagForm({ tag, kind, onDone, onCancel }: TagFormProps) {
  const nameId = useId();
  const analytics = useAnalytics();
  const create = useCreateTag();
  const update = useUpdateTag();
  const [name, setName] = useState(tag?.name ?? '');
  const [color, setColor] = useState<TagColor>(tag?.color ?? TAG_COLORS[0]);

  const busy = create.isPending || update.isPending;
  const trimmed = name.trim();
  const failure = create.error ?? update.error;
  const message =
    failure instanceof ApiError
      ? failure.message
      : failure != null
        ? '태그를 저장하지 못했어요.'
        : null;

  /** 서버가 받아 준 뒤에만 센다. 이름은 안 싣는다. */
  function done(action: ItemAction): void {
    analytics.log(EVENTS.tagChanged, { action, kind }, { kind: 'click' });
    onDone();
  }

  function save(): void {
    if (trimmed === '' || busy) return;
    if (tag != null) {
      update.mutate(
        { id: tag.id, body: { name: trimmed, color } },
        { onSuccess: () => done('updated') },
      );
      return;
    }
    create.mutate({ name: trimmed, color, kind }, { onSuccess: () => done('created') });
  }

  return (
    <div className="tag-form">
      <div className="tag-form__field">
        <label className="tag-form__label" htmlFor={nameId}>
          이름
        </label>
        <input
          id={nameId}
          className="tag-form__input"
          value={name}
          maxLength={NAME_MAX}
          placeholder="예: 데이트"
          autoComplete="off"
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
          }}
        />
      </div>

      <div className="tag-form__field">
        <span className="tag-form__label" id={`${nameId}-color`}>
          색
        </span>
        {/*
          카테고리와 같은 것을 쓴다. 두 벌로 두면 한쪽에만 색이 늘거나 동그라미 크기가
          달라져서, 같은 일을 하는 화면이 앱 안에서 서로 달라 보인다.

          태그는 색을 반드시 하나 고른다(`clearable` 없음). 태그에는 아이콘이 없어서
          색이 곧 그 태그의 얼굴이다.
        */}
        <ColorPicker
          value={color}
          disabled={busy}
          labelledBy={`${nameId}-color`}
          onChange={(next) => setColor(next ?? TAG_COLORS[0])}
        />
      </div>

      {message ? (
        <p className="tag-form__notice" role="alert">
          {message}
        </p>
      ) : null}

      <div className="tag-form__actions">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          취소
        </Button>
        <Button fullWidth onClick={save} disabled={trimmed === '' || busy}>
          {tag != null ? '고치기' : '만들기'}
        </Button>
      </div>
    </div>
  );
}
