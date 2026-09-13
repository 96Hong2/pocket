import { useState } from 'react';

import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  useCategories,
  useSaveCategoryOrder,
  useUpdateCategory,
  type CategoryOut,
} from '../../shared/api';
import { QUICK_LIMIT, byUsage } from '../../shared/ledger';
import {
  Button,
  Card,
  CategoryAvatar,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  Toggle,
  iconOf,
} from '../../shared/ui';

import { CategoryEditSheet } from './CategoryEditSheet';

/** 열려 있으면 대상이 있다. `category` 가 null 이면 새로 만드는 중이다. */
type EditTarget = { category: CategoryOut | null };

/**
 * 종류마다 한 묶음. 화면에 보이는 순서가 곧 이 배열의 순서다.
 *
 * 지출을 맨 위에 둔다. 적는 것 대부분이 지출이고, 기록 시트도 지출로 열린다.
 */
const GROUPS: { kind: CategoryOut['kind']; title: string; note: string }[] = [
  {
    kind: 'expense',
    title: '지출 카테고리',
    note: '기록할 때 지출을 고르면 이 목록이 나와요',
  },
  {
    kind: 'income',
    title: '수입 카테고리',
    note: '들어온 돈을 적을 때 이 목록이 나와요',
  },
  {
    kind: 'transfer',
    title: '이체',
    note: '계좌 사이를 옮긴 돈이에요. 지출에도 수입에도 세지 않아요',
  },
];

/**
 * 카테고리 관리 목록.
 *
 * 지출과 수입을 다른 묶음으로 나눈다. 한 목록에 섞어 두면 수입 분류를 만들어 놓고도
 * 어디서 쓰이는지 알 수 없다. 기록 시트가 종류별로 갈라 보여주는 것과 같은 모양이다.
 *
 * **기록 화면은 앞자리 열한 개만 보여준다.** 그래서 이 화면의 순서가 곧 "무엇이 먼저
 * 보이나" 다. 열한 번째 줄 아래에 경계를 그려 어디까지가 앞자리인지 눈으로 보이게 한다.
 */
export function CategoryManageList() {
  const analytics = useAnalytics();
  const categories = useCategories();
  const update = useUpdateCategory();
  const saveOrder = useSaveCategoryOrder();
  const [target, setTarget] = useState<EditTarget | null>(null);

  if (categories.isError) {
    return (
      <ErrorState title="카테고리를 불러오지 못했어요" onRetry={() => void categories.refetch()} />
    );
  }

  if (categories.isPending) {
    return <LoadingState variant="rows" rows={4} label="카테고리를 불러오는 중이에요" />;
  }

  const items = categories.data?.items ?? [];
  const mineCount = items.filter((item) => !item.is_default).length;
  const busy = update.isPending || saveOrder.isPending;

  /**
   * 한 줄을 위나 아래로 한 칸 옮긴다.
   *
   * **목록 전체를 보낸다.** 옮긴 둘만 보내면 나머지가 뒤로 밀려, 한 칸 옮겼을 뿐인데
   * 화면이 통째로 뒤집힌다. 서버는 받은 순서를 그대로 앞에 세운다.
   */
  function move(kind: CategoryOut['kind'], index: number, delta: number): void {
    const rows = items.filter((item) => item.kind === kind);
    const next = index + delta;
    if (next < 0 || next >= rows.length) return;

    const moved = [...rows];
    [moved[index], moved[next]] = [moved[next], moved[index]];
    analytics.log(EVENTS.categoryOrderChanged, { how: 'step', kind }, { kind: 'click' });
    saveOrder.mutate(orderWith(items, kind, moved).map((item) => item.id));
  }

  /** 그 종류만 자주 쓴 순서로 다시 세운다. 나머지 종류는 지금 순서 그대로 둔다. */
  function sortByUsage(kind: CategoryOut['kind']): void {
    const sorted = byUsage(items.filter((item) => item.kind === kind));
    analytics.log(EVENTS.categoryOrderChanged, { how: 'usage', kind }, { kind: 'click' });
    saveOrder.mutate(orderWith(items, kind, sorted).map((item) => item.id));
  }

  return (
    <div className="cat-manage">
      <div className="cat-manage__add">
        <Button fullWidth variant="outline" onClick={() => setTarget({ category: null })}>
          카테고리 만들기
        </Button>
        {/*
          만든 것이 어디에 나타나는지 여기서 말한다. 빈 상태 안내는 하나라도 만들면 사라지는데,
          둘째·셋째를 만드는 사람은 그때 처음으로 "이게 어디에 쓰이나" 를 묻는다.
        */}
        <p className="cat-manage__hint">
          만들 때 지출인지 수입인지 골라요. 기록 시트에서 그 종류를 골랐을 때 나타나요.
        </p>
      </div>

      {mineCount === 0 ? (
        <EmptyState
          size="inline"
          title="아직 만든 카테고리가 없어요"
          description="자주 쓰는 이름으로 하나 만들어 두면 기록할 때 바로 골라요"
        />
      ) : null}

      {GROUPS.map((group) => {
        const rows = items.filter((item) => item.kind === group.kind);
        if (rows.length === 0) return null;
        // 이체는 기록 화면 칩에 서지 않는다. 순서도 켜고 끄기도 뜻이 없다.
        const arrangeable = group.kind !== 'transfer';
        const quickCount = rows.filter((item) => item.is_quick).length;

        return (
          <section className="cat-group" aria-label={group.title} key={group.kind}>
            <h2 className="cat-group__title">{group.title}</h2>
            <p className="cat-group__note">{group.note}</p>
            {arrangeable ? (
              <>
                <p className="cat-group__note cat-group__note--quick">
                  기록 화면에는 위에서 {QUICK_LIMIT}개까지 보여요. 화살표로 순서를 바꾸고, 스위치를
                  끄면 「더 보기」 뒤로 가요
                </p>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    className="cat-group__sort"
                    disabled={busy}
                    onClick={() => sortByUsage(group.kind)}
                  >
                    자주 쓴 순서로
                  </button>
                ) : null}
              </>
            ) : null}
            <Card padding="list">
              <ul className="cat-list">
                {rows.map((category, index) => (
                  <li
                    className="cat-row"
                    key={category.id}
                    // 열한 번째 아래에 선을 긋는다. 어디까지가 기록 화면 앞자리인지 보여 준다.
                    data-quick-edge={
                      arrangeable && quickCount > QUICK_LIMIT && index === QUICK_LIMIT - 1
                        ? ''
                        : undefined
                    }
                  >
                    {arrangeable ? (
                      <span className="cat-row__move">
                        <button
                          type="button"
                          className="cat-row__arrow"
                          aria-label={`${category.name} 위로`}
                          disabled={busy || index === 0}
                          onClick={() => move(group.kind, index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="cat-row__arrow"
                          aria-label={`${category.name} 아래로`}
                          disabled={busy || index === rows.length - 1}
                          onClick={() => move(group.kind, index, 1)}
                        >
                          ↓
                        </button>
                      </span>
                    ) : null}
                    {category.is_default ? (
                      <span className="cat-row__main">
                        <CategoryAvatar {...iconOf(category)} size={40} />
                        <span className="cat-row__name">{category.name}</span>
                        <Chip variant="kind">기본</Chip>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="cat-row__main cat-row__main--hit"
                        aria-label={`${category.name} 고치기`}
                        onClick={() => setTarget({ category })}
                      >
                        <CategoryAvatar {...iconOf(category)} size={40} />
                        <span className="cat-row__name">{category.name}</span>
                        <span className="cat-row__go">고치기</span>
                      </button>
                    )}
                    {/*
                      기본 분류도 여기서는 끌 수 있다. 그 값은 카테고리 행이 아니라 내 설정에
                      남아 남에게 번지지 않는다. 끈다고 없어지지는 않는다. 기록 시트의
                      「더 보기」 뒤로 갈 뿐이다.
                    */}
                    {arrangeable ? (
                      <Toggle
                        className="cat-row__quick"
                        checked={category.is_quick}
                        ariaLabel={`${category.name} 기록 화면에 보이기`}
                        disabled={busy}
                        onChange={(next) =>
                          update.mutate({ id: category.id, body: { is_quick: next } })
                        }
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        );
      })}

      <CategoryEditSheet
        open={target != null}
        category={target?.category ?? undefined}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}

/**
 * 그 종류만 새 순서로 갈아 끼운 전체 목록.
 *
 * 다른 종류의 줄은 있던 자리를 그대로 지킨다. 지출을 옮겼는데 수입 순서까지 흔들리면
 * 사용자가 한 적 없는 변화가 화면에 남는다.
 */
function orderWith(
  all: CategoryOut[],
  kind: CategoryOut['kind'],
  ordered: CategoryOut[],
): CategoryOut[] {
  const queue = [...ordered];
  return all.map((item) => (item.kind === kind ? (queue.shift() ?? item) : item));
}
