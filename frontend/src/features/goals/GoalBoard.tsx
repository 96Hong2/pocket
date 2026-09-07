import { useState } from 'react';

import { useGoal } from '../../shared/api';
import { Card, EmptyState, ErrorState, LoadingState } from '../../shared/ui';

import { ContributionList } from './ContributionList';
import { ContributionSheet } from './ContributionSheet';
import { GoalCard } from './GoalCard';
import { GoalFormSheet } from './GoalFormSheet';

/**
 * 목표 화면 본문.
 *
 * 진행 중인 목표는 하나다. 목록도 만들기 버튼도 그 하나를 기준으로 그린다.
 *
 * 조회에 실패하면 만들기 입구를 열지 않는다. 목표가 이미 있는지 없는지를 모르는 상태라,
 * 그때 만들기를 눌러도 서버가 '진행 중인 목표가 이미 있어요' 로 막는다. 눌러 봐야 아는
 * 버튼보다 먼저 다시 받는 쪽이 낫다. 자산 화면과 같은 이유로 둔 예외다.
 */
export function GoalBoard() {
  const state = useGoal();
  const [formOpen, setFormOpen] = useState(false);
  const [contributionOpen, setContributionOpen] = useState(false);

  if (state.isError) {
    return (
      <Card padding="md">
        <ErrorState
          size="inline"
          title="목표를 불러오지 못했어요"
          description="적어 둔 목표가 사라진 게 아니에요. 다시 시도해 주세요."
          onRetry={() => void state.refetch()}
        />
      </Card>
    );
  }

  if (state.data == null) {
    return (
      <Card padding="md">
        <LoadingState variant="rows" rows={2} label="목표를 불러오는 중이에요" />
      </Card>
    );
  }

  const goal = state.data.goal;

  return (
    <div className="goal">
      {goal == null ? (
        <Card padding="md">
          <EmptyState
            icon="32_piggybank"
            title="목표는 언제든 바꿔도, 지워도 괜찮아요"
            description="모으고 싶은 것 하나만 정해 봐요"
            actionLabel="목표 만들기"
            onAction={() => setFormOpen(true)}
          />
        </Card>
      ) : (
        <>
          <GoalCard
            goal={goal}
            onEdit={() => setFormOpen(true)}
            onContribute={() => setContributionOpen(true)}
          />
          <ContributionList goalId={goal.id} contributions={goal.contributions} />
        </>
      )}

      <GoalFormSheet open={formOpen} goal={goal} onClose={() => setFormOpen(false)} />
      <ContributionSheet
        open={contributionOpen}
        goalId={goal?.id ?? null}
        onClose={() => setContributionOpen(false)}
      />
    </div>
  );
}
