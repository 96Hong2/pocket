import { useState } from 'react';

import { useCategories, useUpdateCategory, type CategoryOut } from '../../shared/api';
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
 * 한 묶음 안에서는 기본과 내가 만든 것을 다시 가르지 않는다. 순서는 서버가 준 그대로라
 * 기록 시트의 칩 순서와 같고, 고칠 수 있는 줄만 '고치기' 를 달고 있어 눈으로 갈린다.
 */
export function CategoryManageList() {
  const categories = useCategories();
  const update = useUpdateCategory();
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

        return (
          <section className="cat-group" aria-label={group.title} key={group.kind}>
            <h2 className="cat-group__title">{group.title}</h2>
            <p className="cat-group__note">{group.note}</p>
            {group.kind === 'transfer' ? null : (
              <p className="cat-group__note cat-group__note--quick">
                오른쪽 스위치를 끄면 기록 화면에서 「더 보기」 뒤로 가요
              </p>
            )}
            <Card padding="list">
              <ul className="cat-list">
                {rows.map((category) => (
                  <li className="cat-row" key={category.id}>
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
                    {group.kind === 'transfer' ? null : (
                      <Toggle
                        className="cat-row__quick"
                        checked={category.is_quick}
                        ariaLabel={`${category.name} 기록 화면에 보이기`}
                        disabled={update.isPending}
                        onChange={(next) =>
                          update.mutate({ id: category.id, body: { is_quick: next } })
                        }
                      />
                    )}
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
