import { useState } from 'react';

import { EVENTS, useAnalytics, type RecurringAction } from '../../shared/analytics';
import {
  parseDecimalOr,
  useCategories,
  useDeleteRecurring,
  useRecurring,
  useUpdateRecurring,
  type RecurringOut,
} from '../../shared/api';
import { formatCurrency, formatDayLabel } from '../../shared/lib/format';
import {
  BottomSheet,
  Button,
  Card,
  CategoryAvatar,
  EmptyState,
  ErrorState,
  LoadingState,
  Toggle,
  iconOf,
} from '../../shared/ui';

import { RecurringForm } from './RecurringForm';

/** 서버와 같은 값. 여기서 먼저 막아 만들기 버튼을 회색으로 둔다. */
const MAX = 20;

/**
 * 반복 지출 목록.
 *
 * 걸어 둔 것이 없는 것이 정상이라, 빈 화면에도 오류 자리를 만들지 않고 무엇을 하는
 * 자리인지 한 줄로 말한다.
 *
 * **끄기와 지우기를 갈라 둔다.** 구독을 잠시 멈춘 것과 아주 그만둔 것은 다르다.
 * 끈 것은 목록에 흐리게 남아, 다시 켤 때 금액과 날짜를 새로 적지 않아도 된다.
 */
export function RecurringManageList() {
  const analytics = useAnalytics();
  const items = useRecurring();
  const categories = useCategories();
  const update = useUpdateRecurring();
  const remove = useDeleteRecurring();
  /** 열려 있으면 대상이 있다. `item` 이 null 이면 새로 만드는 중이다. */
  const [target, setTarget] = useState<{ item: RecurringOut | null } | null>(null);
  const [confirming, setConfirming] = useState<RecurringOut | null>(null);

  if (items.isPending) return <LoadingState label="반복 지출을 불러오는 중이에요" />;
  if (items.isError) {
    return (
      <ErrorState title="반복 지출을 불러오지 못했어요" onRetry={() => void items.refetch()} />
    );
  }

  const rows = items.data?.items ?? [];
  const byId = new Map((categories.data?.items ?? []).map((row) => [row.id, row]));

  return (
    <>
      <Card className="recurring-card" padding={rows.length === 0 ? 'md' : 'list'}>
        {rows.length === 0 ? (
          <EmptyState
            size="inline"
            icon="27_clock"
            title="걸어 둔 것이 없어요"
            description="매달 같은 날 나가는 돈을 적어 두면 그날 알려드려요"
          />
        ) : (
          <ul className="recurring-list">
            {rows.map((item) => {
              const category = item.category_id == null ? null : byId.get(item.category_id);
              return (
                <li
                  className={item.is_active ? 'recurring-row' : 'recurring-row recurring-row--off'}
                  key={item.id}
                >
                  {/* 분류를 안 고른 것도 정상이라, 그때는 시계 그림으로 자리를 채운다. */}
                  {category == null ? (
                    <CategoryAvatar icon="27_clock" size={44} />
                  ) : (
                    <CategoryAvatar {...iconOf(category)} size={44} />
                  )}
                  <button
                    type="button"
                    className="recurring-row__main"
                    onClick={() => setTarget({ item })}
                  >
                    <span className="recurring-row__name">{item.name}</span>
                    <span className="recurring-row__when">
                      매달 {item.day_of_month}일 ·{' '}
                      {formatCurrency(parseDecimalOr(item.amount, 0))}
                    </span>
                    {/*
                      **언제 적히는지를 줄에서 바로 읽게 한다.** 「매달 31일」 만으로는
                      2월에 무슨 일이 나는지 모른다. 서버가 당겨 준 날짜를 그대로 적는다.
                    */}
                    <span className="recurring-row__next">
                      다음 {formatDayLabel(item.next_due_on)}
                      {item.next_remind_on === item.next_due_on
                        ? ''
                        : ` · 알림 ${formatDayLabel(item.next_remind_on)}`}
                    </span>
                  </button>
                  <Toggle
                    checked={item.is_active}
                    ariaLabel={`${item.name} 알림`}
                    disabled={update.isPending}
                    onChange={(next) =>
                      update.mutate(
                        { id: item.id, body: { is_active: next } },
                        {
                          // 끄는 것과 지우는 것은 다른 뜻이다. 껐다는 것은 이 항목이 아직
                          // 맞는데 지금만 안 알리고 싶다는 말이라, 지운 수에 섞으면 안 된다.
                          //
                          // 서버가 받아 준 뒤에만 센다. 실패하면 토글이 원래대로 돌아가는데
                          // 로그만 남으면 「잠시 끈 사람」 이 실제보다 부풀어 오른다.
                          onSuccess: () => {
                            const action: RecurringAction = next ? 'resumed' : 'paused';
                            analytics.log(EVENTS.recurringChanged, { action }, { kind: 'click' });
                          },
                        },
                      )
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Button
        variant="outline"
        fullWidth
        disabled={rows.length >= MAX}
        onClick={() => setTarget({ item: null })}
      >
        {rows.length >= MAX ? `${MAX}개까지 걸어 둘 수 있어요` : '＋ 반복 지출 추가'}
      </Button>

      <BottomSheet
        open={target != null}
        onClose={() => setTarget(null)}
        title={target?.item != null ? '반복 지출 고치기' : '새 반복 지출'}
      >
        {target != null ? (
          <>
            <RecurringForm
              // 대상이 바뀌면 폼을 새로 만든다. 안에서 effect 로 채우지 않기 위해서다.
              key={target.item?.id ?? 'new'}
              item={target.item ?? undefined}
              onDone={() => setTarget(null)}
              onCancel={() => setTarget(null)}
            />
            {target.item != null ? (
              <Button
                variant="ghost"
                fullWidth
                disabled={remove.isPending}
                onClick={() => setConfirming(target.item)}
              >
                이 반복 지출 지우기
              </Button>
            ) : null}
          </>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={confirming != null}
        onClose={() => setConfirming(null)}
        title="반복 지출을 지울까요?"
      >
        {confirming != null ? (
          <div className="recurring-form">
            {/* 무엇이 사라지고 무엇이 남는지 먼저 말한다. 이미 적은 기록은 안 건드린다. */}
            <p className="recurring-form__hint">
              이 예고만 사라져요. 「{confirming.name}」 으로 이미 적어 둔 기록은 그대로 남아요.
            </p>
            <div className="recurring-form__actions">
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
                      const action: RecurringAction = 'deleted';
                      analytics.log(
                        EVENTS.recurringChanged,
                        { action, active: confirming.is_active },
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
