import { Fragment, useEffect, useRef, useState } from 'react';

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
  RetryButton,
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
  /**
   * 아직 서버에 안 보낸 순서.
   *
   * 예전에는 화살표를 누를 때마다 요청을 하나씩 보내고, 그 사이 화살표를 잠갔다.
   * 맨 아래 줄을 위로 올리려면 열한 번을 눌러야 하는데 한 번 누를 때마다 왕복을 기다리니
   * 사실상 못 옮겼다. 지금은 화면에서 먼저 옮기고 손을 뗀 뒤에 한 번만 보낸다.
   */
  const [draft, setDraft] = useState<string[] | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef<string[] | null>(null);

  /** 담아 둔 순서를 지금 보낸다. 보낼 것이 없으면 아무 일도 안 한다. */
  function flushOrder(): void {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const ids = queued.current;
    queued.current = null;
    if (ids == null) return;
    /*
      **실패하면 화면에 옮겨 둔 순서를 그대로 둔다.** 되돌리면 방금 옮긴 것이 눈앞에서
      튀어 올라 무슨 일이 난 건지 알 수 없다. 대신 못 보냈다고 적고 다시 보낼 길을 준다.
    */
    saveOrder.mutate(ids, { onSuccess: () => setDraft(null) });
  }

  /*
    화면을 떠날 때 **취소가 아니라 전송**이다. 그냥 타이머만 지우면 마지막으로 옮긴
    순서가 조용히 사라진다. 화살표를 누르자마자 뒤로 가는 것이 오히려 흔한 손짓이다.
    요청은 나가고 응답만 못 받는데, 순서는 서버에 남으므로 그것으로 충분하다.

    첫 렌더의 함수를 그대로 쓴다. 안이 참조와 안 바뀌는 것들뿐이라 최신 것과 같다.
  */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => flushOrder(), []);

  if (categories.isError) {
    return (
      <ErrorState title="카테고리를 불러오지 못했어요" onRetry={() => void categories.refetch()} />
    );
  }

  if (categories.isPending) {
    return <LoadingState variant="rows" rows={4} label="카테고리를 불러오는 중이에요" />;
  }

  const served = categories.data?.items ?? [];
  // 화면은 손에서 먼저 움직인다. 보낼 것이 남아 있으면 그 순서로 그린다.
  const items = draft != null ? sortByIds(served, draft) : served;
  const mineCount = items.filter((item) => !item.is_default).length;
  // 화살표는 잠그지 않는다. 잠그면 연달아 누르지 못해 먼 자리로 못 옮긴다.
  const busy = update.isPending;

  /** 옮긴 순서를 담아 두고, 손이 멈추면 한 번만 보낸다. */
  function queueOrder(ids: string[]): void {
    setDraft(ids);
    queued.current = ids;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushOrder, 400);
  }

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
    queueOrder(orderWith(items, kind, moved).map((item) => item.id));
  }

  /** 그 종류만 자주 쓴 순서로 다시 세운다. 나머지 종류는 지금 순서 그대로 둔다. */
  function sortByUsage(kind: CategoryOut['kind']): void {
    const sorted = byUsage(items.filter((item) => item.kind === kind));
    analytics.log(EVENTS.categoryOrderChanged, { how: 'usage', kind }, { kind: 'click' });
    queueOrder(orderWith(items, kind, sorted).map((item) => item.id));
  }

  return (
    // 아직 안 보낸 순서가 있으면 표시해 둔다. 화면에는 안 보이고 검증만 이걸 기다린다.
    <div className="cat-manage" data-order-dirty={draft != null ? '' : undefined}>
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

      {/*
        순서를 못 보냈다.

        화살표는 누르는 즉시 화면을 옮긴다. 저장이 실패한 것을 여기서 말하지 않으면
        옮긴 사람은 다 된 줄 알고 나가고, 다음에 열면 전부 원래대로다.
      */}
      {saveOrder.isError ? (
        <p className="cat-list__order-fail" role="alert">
          <span>순서를 저장하지 못했어요. 화면에 옮겨 둔 것은 그대로 있어요.</span>{' '}
          <RetryButton variant="ghost" onRetry={() => flushOrder()} />
        </p>
      ) : null}

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
        /*
          경계선을 그을 자리.

          **줄 번호가 아니라 켜 둔 줄의 수로 센다.** 기록 화면 앞자리는 켜 둔 분류에서만
          열한 개를 가져가는데, 선을 열한 번째 「줄」 뒤에 그으면 앞자리 안에서 하나를 꺼
          둔 사람에게 한 칸 어긋난다. 선을 믿고 순서를 맞춘 사람이 화면에서 다른 것을 본다.
          켜 둔 것이 열한 개 이하면 넘칠 것이 없어 선을 안 긋는다.
        */
        let quickSeen = 0;
        const edgeIndex =
          quickCount > QUICK_LIMIT
            ? rows.findIndex((item) => item.is_quick && (quickSeen += 1) === QUICK_LIMIT)
            : -1;

        return (
          <section className="cat-group" aria-label={group.title} key={group.kind}>
            <h2 className="cat-group__title">{group.title}</h2>
            <p className="cat-group__note">{group.note}</p>
            {/*
              **규칙을 문단으로 적지 않는다.** 예전에는 열한 개 제한·화살표·스위치를 두 줄로
              설명했는데, 넘칠 일이 없는 묶음(수입 넷)에도 그대로 떴고 글자색이 흐려 읽히지도
              않았다. 설명이 필요한 것은 경계선 하나뿐이라, 그 선 위에 한 줄만 붙인다.
            */}
            {arrangeable && rows.length > 1 ? (
              <button
                type="button"
                className="cat-group__sort"
                disabled={busy}
                onClick={() => sortByUsage(group.kind)}
              >
                자주 쓴 순서로
              </button>
            ) : null}
            <Card padding="list">
              <ul className="cat-list">
                {rows.map((category, index) => (
                  <Fragment key={category.id}>
                    <li className="cat-row">
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
                      {/*
                        **기본 분류도 누를 수 있다.** 이름·그림·색을 고치면 그 사람
                        화면에만 남는다(서버가 내 설정에 덮어쓴다). 예전에는 못 누르는
                        줄이라 「식비」 를 「밥값」 이라 부르는 사람이 기본 분류를 통째로
                        버리고 같은 것을 손으로 다시 만들어야 했다.

                        「기본」 칩은 그대로 둔다. 지우는 길이 없다는 것을 그 칩이 말한다.
                      */}
                      <button
                        type="button"
                        className="cat-row__main cat-row__main--hit"
                        aria-label={`${category.name} 고치기`}
                        onClick={() => setTarget({ category })}
                      >
                        <CategoryAvatar {...iconOf(category)} size={40} />
                        <span className="cat-row__name">{category.name}</span>
                        {category.is_default ? <Chip variant="kind">기본</Chip> : null}
                        {/*
                          「고치기」 라고 적던 자리다. 줄마다 같은 글자가 열여섯 번 서서
                          정보가 아니라 잡음이었다. 줄 전체가 버튼이고 스크린리더에는
                          「식비 고치기」 로 읽히므로, 눈에는 방향만 보여 준다.
                          결산 입구도 같은 모양이라 앱 안에서 뜻이 갈리지 않는다.
                        */}
                        <span className="cat-row__go" aria-hidden="true">
                          ›
                        </span>
                      </button>
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
                    {/* 어디까지가 기록 화면 앞자리인지. 선만으로는 무슨 선인지 모른다. */}
                    {arrangeable && edgeIndex >= 0 && index === edgeIndex ? (
                      <li className="cat-list__edge" data-quick-edge="">
                        여기까지 기록 화면에 보여요
                      </li>
                    ) : null}
                  </Fragment>
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

/**
 * 아직 안 보낸 순서대로 세운다.
 *
 * 그 사이 서버에서 새 줄이 왔으면(다른 화면에서 만들었을 수 있다) 목록에서 빼지 않고
 * 뒤에 붙인다. 보내려던 순서 때문에 방금 만든 분류가 사라져 보이면 안 된다.
 */
function sortByIds(all: CategoryOut[], ids: string[]): CategoryOut[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return [...all].sort((a, b) => (rank.get(a.id) ?? ids.length) - (rank.get(b.id) ?? ids.length));
}
