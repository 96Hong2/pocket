import type { TagKind, TagOut } from '../../shared/api';
import { LoadingState, SheetHeader } from '../../shared/ui';

import { TagForm } from '../tags';

import { tagStyle } from './recordLabels';

/** 종류마다 만들 수 있는 태그 수. 서버 상한과 같다. */
const TAGS_PER_KIND_MAX = 20;

export interface RecordTagStepProps {
  kind: TagKind;
  /** 그 종류 태그. 많이 쓴 것부터. 아직 못 받았으면 `null`. */
  tags: TagOut[] | null;
  selectedId: string | null;
  /** 새 태그 폼을 펴 둔 중인가. */
  composing: boolean;
  /** 고르거나 뗀다. 같은 것을 다시 누르면 `null` 이 온다. */
  onPick: (tagId: string | null) => void;
  onCompose: () => void;
  /** 새 태그를 만들었다. 만든 것을 찾지 못했으면 비어 온다. */
  onCreated: (tag?: TagOut) => void;
  onBack: () => void;
}

/**
 * 기록에 붙일 태그를 고르는 단계. 하나만 고른다.
 *
 * 관리 화면으로 가는 길은 두지 않는다. 화면을 옮기면 적던 금액을 잃는다.
 * 대신 이 자리에서 바로 만든다. 종류는 지금 적는 종류로 정해져 있다.
 */
export function RecordTagStep({
  kind,
  tags,
  selectedId,
  composing,
  onPick,
  onCompose,
  onCreated,
  onBack,
}: RecordTagStepProps) {
  if (composing) {
    return (
      <div className="record-tags" data-record-step="">
        <SheetHeader onBack={onBack} title="새 태그" />
        <TagForm kind={kind} onDone={onCreated} onCancel={onBack} />
      </div>
    );
  }

  return (
    <div className="record-tags" data-record-step="">
      <SheetHeader onBack={onBack} title="태그" />
      {tags == null ? (
        <LoadingState size="inline" />
      ) : (
        <div className="record-tags__grid" role="group" aria-label="태그">
          {tags.map((tag) => {
            const picked = tag.id === selectedId;
            return (
              <button
                key={tag.id}
                type="button"
                className="record-tags__item"
                aria-pressed={picked}
                style={tagStyle(tag)}
                onClick={() => onPick(picked ? null : tag.id)}
              >
                <span className="record-tags__dot" aria-hidden="true" />
                <span className="record-tags__name">{tag.name}</span>
              </button>
            );
          })}
          {tags.length < TAGS_PER_KIND_MAX ? (
            <button
              type="button"
              className="record-tags__item record-tags__item--new"
              onClick={onCompose}
            >
              ＋ 새 태그
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
