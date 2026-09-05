import { useState } from 'react';

import { useCategories, type CategoryOut } from '../../shared/api';
import {
  Button,
  Card,
  CategoryAvatar,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  toIconName,
} from '../../shared/ui';

import { CategoryEditSheet } from './CategoryEditSheet';

/** 열려 있으면 대상이 있다. `category` 가 null 이면 새로 만드는 중이다. */
type EditTarget = { category: CategoryOut | null };

/**
 * 카테고리 관리 목록.
 *
 * 기본과 내가 만든 것을 자리로 가른다. 기본 줄에는 고치기 입구를 두지 않는다.
 * 눌리지 않는 버튼을 두면 왜 안 되는지 물어보게 된다.
 *
 * 순서는 서버가 준 그대로다. 화면이 다시 정렬하면 기록 시트의 칩 순서와 어긋난다.
 */
export function CategoryManageList() {
  const categories = useCategories();
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
  const defaults = items.filter((item) => item.is_default);
  const mine = items.filter((item) => !item.is_default);

  return (
    <div className="cat-manage">
      <Button fullWidth variant="outline" onClick={() => setTarget({ category: null })}>
        카테고리 만들기
      </Button>

      {defaults.length > 0 ? (
        <section className="cat-group" aria-label="기본 카테고리">
          <h2 className="cat-group__title">기본 카테고리</h2>
          <p className="cat-group__note">처음부터 있는 카테고리예요. 그대로 써요</p>
          <Card padding="list">
            <ul className="cat-list">
              {defaults.map((category) => (
                <li className="cat-row" key={category.id}>
                  <CategoryAvatar icon={toIconName(category.icon_key)} size={32} />
                  <span className="cat-row__name">{category.name}</span>
                  <Chip variant="kind">기본</Chip>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <section className="cat-group" aria-label="내가 만든 카테고리">
        <h2 className="cat-group__title">내가 만든 카테고리</h2>

        {mine.length === 0 ? (
          <EmptyState
            size="inline"
            title="아직 만든 카테고리가 없어요"
            description="자주 쓰는 이름으로 하나 만들어 두면 기록할 때 바로 골라요"
          />
        ) : (
          <Card padding="list">
            <ul className="cat-list">
              {mine.map((category) => (
                <li key={category.id}>
                  <button
                    type="button"
                    className="cat-row cat-row--hit"
                    aria-label={`${category.name} 고치기`}
                    onClick={() => setTarget({ category })}
                  >
                    <CategoryAvatar icon={toIconName(category.icon_key)} size={32} />
                    <span className="cat-row__name">{category.name}</span>
                    <span className="cat-row__go">고치기</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <CategoryEditSheet
        open={target != null}
        category={target?.category ?? undefined}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
