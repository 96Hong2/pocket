import { useState, type CSSProperties } from 'react';

import { EVENTS, useAnalytics } from '../../shared/analytics';
import { useDeleteTag, useTags, type TagKind, type TagOut } from '../../shared/api';
import { BottomSheet, Button, Card, ErrorState, LoadingState } from '../../shared/ui';

import { TagForm } from './TagForm';
import { tagColorVar } from '../../shared/lib/tagColors';

/** 한 사람이 만들 수 있는 수. 서버(`app/domain/tags.py`)와 같은 값이다. */
const PER_KIND_MAX = 20;

/**
 * 종류마다 한 묶음. 지출이 위다. 적는 것 대부분이 지출이다.
 *
 * 설명 한 줄이 「이 목록이 어디서 쓰이나」 를 말한다. 그 말이 없으면 수입 태그를
 * 만들어 놓고도 어디서 쓰이는지 알 수 없다. 카테고리 관리와 같은 모양이다.
 */
const GROUPS: { kind: TagKind; title: string; note: string }[] = [
  { kind: 'expense', title: '지출 태그', note: '지출을 적고 나면 이 목록에서 골라요' },
  { kind: 'income', title: '수입 태그', note: '들어온 돈을 적을 때 이 목록이 나와요' },
];

/** 열려 있으면 대상이 있다. `tag` 가 null 이면 새로 만드는 중이다. */
type EditTarget = { kind: TagKind; tag: TagOut | null };

/**
 * 태그 관리 목록.
 *
 * 태그가 하나도 없는 것이 정상이라, 빈 묶음에도 오류 자리를 만들지 않고 만들기 버튼만 둔다.
 *
 * **지울 때 몇 건이 이 태그를 잃는지 먼저 말한다.** 기록 자체는 남고 태그만 떨어지는데,
 * 그 말을 안 하면 「지우면 그 기록도 사라지나」 를 알 수 없어 아무도 못 지운다.
 */
export function TagManageList() {
  const analytics = useAnalytics();
  const tags = useTags();
  const remove = useDeleteTag();
  const [target, setTarget] = useState<EditTarget | null>(null);
  const [confirming, setConfirming] = useState<TagOut | null>(null);

  if (tags.isPending) return <LoadingState label="태그를 불러오는 중이에요" />;
  if (tags.isError) {
    return <ErrorState title="태그를 불러오지 못했어요" onRetry={() => void tags.refetch()} />;
  }

  const items = tags.data?.items ?? [];

  return (
    <>
      {GROUPS.map((group) => {
        const rows = items.filter((tag) => tag.kind === group.kind);
        const full = rows.length >= PER_KIND_MAX;
        return (
          <Card key={group.kind} className="tags-card" padding="md">
            <section className="tags-group" aria-label={group.title}>
              <p className="tags-group__head">
                <span>{group.title}</span>
                <span className="tags-group__count">
                  {rows.length} / {PER_KIND_MAX}
                </span>
              </p>
              <p className="tags-group__empty">{group.note}</p>

              {rows.map((tag) => (
                <div className="tags-row" key={tag.id}>
                  <span
                    className="tags-row__mark"
                    aria-hidden="true"
                    style={{ '--tag-color': tagColorVar(tag.color) } as CSSProperties}
                  />
                  <span className="tags-row__name">{tag.name}</span>
                  <span className="tags-row__count">{tag.usage_count}건</span>
                  <Button
                    className="tags-row__edit"
                    variant="ghost"
                    onClick={() => setTarget({ kind: group.kind, tag })}
                  >
                    고치기
                  </Button>
                </div>
              ))}

              <Button
                variant="outline"
                fullWidth
                disabled={full}
                onClick={() => setTarget({ kind: group.kind, tag: null })}
              >
                {full ? `${PER_KIND_MAX}개까지 만들 수 있어요` : '＋ 새 태그'}
              </Button>
            </section>
          </Card>
        );
      })}

      <BottomSheet
        open={target != null}
        onClose={() => setTarget(null)}
        title={target?.tag != null ? '태그 고치기' : '새 태그'}
      >
        {target != null ? (
          <>
            <TagForm
              // 대상이 바뀌면 폼을 새로 만든다. 안에서 effect 로 채우지 않기 위해서다.
              key={target.tag?.id ?? `new-${target.kind}`}
              tag={target.tag ?? undefined}
              kind={target.kind}
              onDone={() => setTarget(null)}
              onCancel={() => setTarget(null)}
            />
            {/*
              지우기는 고칠 때만 나온다. 만들다 말고 지울 것이 없다.
              한 번 되묻는 이유는 되돌릴 수 없어서다.
            */}
            {target.tag != null ? (
              <Button
                variant="ghost"
                fullWidth
                disabled={remove.isPending}
                onClick={() => setConfirming(target.tag)}
              >
                이 태그 지우기
              </Button>
            ) : null}
          </>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={confirming != null}
        onClose={() => setConfirming(null)}
        title="태그를 지울까요?"
      >
        {confirming != null ? (
          <div className="tag-form">
            <p className="tags-group__empty">
              {confirming.usage_count > 0
                ? `${confirming.usage_count}건에서 「${confirming.name}」 표시만 사라져요. 기록과 금액은 그대로 남아요.`
                : '아직 이 태그를 단 기록이 없어요.'}
            </p>
            {/* 지우기가 막히면 시트가 열린 채 이유를 말한다. 시트 밖에 두면 안 보인다. */}
            {remove.isError ? (
              <p className="tag-form__notice" role="alert">
                태그를 지우지 못했어요. 잠시 후 다시 시도해 주세요.
              </p>
            ) : null}
            <div className="tag-form__actions">
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                그만두기
              </Button>
              <Button
                variant="danger"
                fullWidth
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(confirming.id, {
                    onSuccess: () => {
                      // 몇 건이 표시를 잃었는지까지 남긴다. 한 번도 안 쓴 태그를 지우는 것과
                      // 여러 건에 달아 둔 태그를 지우는 것은 다른 일이다.
                      analytics.log(
                        EVENTS.tagChanged,
                        { action: 'deleted', kind: confirming.kind, used: confirming.usage_count },
                        { kind: 'click' },
                      );
                      setConfirming(null);
                      setTarget(null);
                    },
                  })
                }
              >
                지우기
              </Button>
            </div>
          </div>
        ) : null}
      </BottomSheet>
    </>
  );
}
