import { useState } from 'react';

import {
  ApiError,
  useCategories,
  useDeleteMerchantRule,
  useMerchantRules,
  type MerchantRuleOut,
} from '../../shared/api';
import { TEST_IDS } from '../../shared/testIds';
import {
  Card,
  CategoryAvatar,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  toIconName,
} from '../../shared/ui';

import { MerchantRuleSheet } from './MerchantRuleSheet';

/**
 * 한 번에 보여 주는 최대 줄 수.
 *
 * 쓸수록 늘어나는 목록이라 상한이 없으면 이 화면이 스크롤만 남는다. 넘치는 줄은 감추는 대신
 * 몇 개가 더 있는지 적고 검색을 연다. 찾는 사람은 상호 이름을 이미 알고 있다.
 */
const VISIBLE_LIMIT = 20;

type Filter = 'all' | 'mine';

/**
 * 기억한 분류.
 *
 * 세 가지를 한 자리에서 한다: 앱이 기억한 것 보기, 내가 직접 걸어 두기, 지우기.
 * 지울 수 있어야 기억이다. 지우면 그 상호는 다음 분석에서 다시 처음부터 판단한다.
 */
export function MerchantRuleList() {
  const rules = useMerchantRules();
  const categories = useCategories();
  const remove = useDeleteMerchantRule();

  const [filter, setFilter] = useState<Filter>('all');
  const [keyword, setKeyword] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  const failure = remove.error instanceof ApiError ? remove.error.message : null;
  const items = rules.data?.items ?? [];
  const mineCount = items.filter((item) => item.source === 'manual').length;

  // 목록이 짧으면 검색칸도 필터도 두지 않는다. 세 줄짜리 목록 위의 검색칸은 방해일 뿐이다.
  const searchable = items.length > VISIBLE_LIMIT;
  const filtered = matching(items, filter, searchable ? keyword : '');
  const shown = filtered.slice(0, VISIBLE_LIMIT);
  const hidden = filtered.length - shown.length;

  return (
    <section className="rules" aria-labelledby="rules-title">
      <div className="rules__head">
        <div className="rules__heading">
          <h2 className="rules__title" id="rules-title">
            기억한 분류
          </h2>
          <button type="button" className="rules__add" onClick={() => setSheetOpen(true)}>
            걸어두기
          </button>
        </div>
        <p className="rules__lead">
          저장할 때 상호와 분류를 기억해요. 자주 가는 곳은 미리 걸어 둘 수도 있어요
        </p>
      </div>

      {/* 직접 걸어 둔 것이 하나도 없으면 가를 것이 없다. */}
      {mineCount > 0 ? (
        <div className="rules__filters" role="group" aria-label="무엇을 볼지">
          <FilterChip
            value="all"
            current={filter}
            onPick={setFilter}
            label="전체"
            count={items.length}
          />
          <FilterChip
            value="mine"
            current={filter}
            onPick={setFilter}
            label="내가 걸어둔 것"
            count={mineCount}
          />
        </div>
      ) : null}

      {searchable ? (
        <label className="rules__search">
          <span className="rules__search-label">상호 검색</span>
          <input
            className="rules__search-input"
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="가게 이름으로 찾기"
          />
        </label>
      ) : null}

      {rules.isPending ? <LoadingState variant="rows" rows={2} size="inline" /> : null}

      {rules.isError ? (
        <ErrorState
          size="inline"
          title="기억한 분류를 불러오지 못했어요"
          onRetry={() => void rules.refetch()}
        />
      ) : null}

      {rules.isSuccess && items.length === 0 ? (
        <EmptyState
          size="inline"
          title="아직 기억한 분류가 없어요"
          description="저장하면 상호마다 분류를 기억해요. 자주 가는 곳은 지금 걸어 둬도 돼요"
        />
      ) : null}

      {/* 걸러서 비었을 때. 아무것도 없는 것과 못 찾은 것은 다른 상황이라 말이 달라야 한다. */}
      {items.length > 0 && filtered.length === 0 ? (
        <p className="rules__notice" role="status">
          찾는 상호가 없어요
        </p>
      ) : null}

      {shown.length > 0 ? (
        <Card padding="list">
          <ul className="rules__list">
            {shown.map((rule) => {
              const category = categories.data?.items.find((item) => item.id === rule.category_id);
              return (
                <li className="rules__row" key={rule.id} data-testid={TEST_IDS.merchantRuleRow}>
                  <CategoryAvatar icon={toIconName(category?.icon_key)} size={40} />
                  <span className="rules__merchant">{rule.merchant}</span>
                  {rule.source === 'manual' ? <Chip variant="kind">내가</Chip> : null}
                  <span className="rules__category">{category?.name ?? '분류 없음'}</span>
                  <button
                    type="button"
                    className="rules__delete"
                    aria-label={`${rule.merchant} 기억 지우기`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(rule.id)}
                  >
                    지우기
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {hidden > 0 ? (
        <p className="rules__more" role="status">
          {hidden}개를 더 기억하고 있어요. 위에서 상호로 찾아보세요
        </p>
      ) : null}

      {failure ? (
        <p className="rules__notice" role="alert">
          {failure}
        </p>
      ) : null}

      <MerchantRuleSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </section>
  );
}

function FilterChip({
  value,
  current,
  onPick,
  label,
  count,
}: {
  value: Filter;
  current: Filter;
  onPick: (next: Filter) => void;
  label: string;
  count: number;
}) {
  const on = value === current;
  return (
    <button
      type="button"
      className={on ? 'rules__filter rules__filter--on' : 'rules__filter'}
      aria-pressed={on}
      onClick={() => onPick(value)}
    >
      {label} {count}
    </button>
  );
}

/**
 * 보여 줄 줄만 남긴다.
 *
 * 검색은 띄어쓰기와 대소문자를 지우고 견준다. 서버가 상호를 그렇게 기억하기 때문에,
 * 화면만 다르게 견주면 '스타 벅스' 로 쳤을 때 이미 있는 '스타벅스' 를 못 찾는다.
 */
function matching(items: MerchantRuleOut[], filter: Filter, keyword: string): MerchantRuleOut[] {
  const needle = normalize(keyword);
  return items.filter((item) => {
    if (filter === 'mine' && item.source !== 'manual') return false;
    return needle === '' || normalize(item.merchant).includes(needle);
  });
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}
