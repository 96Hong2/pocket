import { ApiError, useCategories, useDeleteMerchantRule, useMerchantRules } from '../../shared/api';
import { TEST_IDS } from '../../shared/testIds';
import {
  Card,
  CategoryAvatar,
  EmptyState,
  ErrorState,
  LoadingState,
  toIconName,
} from '../../shared/ui';

/**
 * 줄글로 저장하면서 기억한 분류.
 *
 * 지울 수 있어야 기억이다. 지우면 그 상호는 다음 분석에서 다시 처음부터 판단한다.
 */
export function MerchantRuleList() {
  const rules = useMerchantRules();
  const categories = useCategories();
  const remove = useDeleteMerchantRule();

  const failure = remove.error instanceof ApiError ? remove.error.message : null;
  const items = rules.data?.items ?? [];

  return (
    <section className="rules" aria-labelledby="rules-title">
      <div className="rules__head">
        <h2 className="rules__title" id="rules-title">
          기억한 분류
        </h2>
        <p className="rules__lead">줄글로 저장할 때 상호와 분류를 기억해요. 지우면 다시 물어봐요</p>
      </div>

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
          description="줄글로 저장하면 상호마다 분류를 기억해요"
        />
      ) : null}

      {items.length > 0 ? (
        <Card padding="list">
          <ul className="rules__list">
            {items.map((rule) => {
              const category = categories.data?.items.find((item) => item.id === rule.category_id);
              return (
                <li className="rules__row" key={rule.id} data-testid={TEST_IDS.merchantRuleRow}>
                  <CategoryAvatar icon={toIconName(category?.icon_key)} size={28} />
                  <span className="rules__merchant">{rule.merchant}</span>
                  <span className="rules__category">{category?.name ?? '분류 없음'}</span>
                  <button
                    type="button"
                    className="rules__delete"
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

      {failure ? (
        <p className="rules__notice" role="alert">
          {failure}
        </p>
      ) : null}
    </section>
  );
}
