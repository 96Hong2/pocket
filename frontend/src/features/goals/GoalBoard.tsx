import { useState } from 'react';

import { parseDecimalOr, useGoal } from '../../shared/api';
import { Card, EmptyState, ErrorState, LoadingState } from '../../shared/ui';
import { goalLine, ShareInviteCard } from '../share';

import { ContributionList } from './ContributionList';
import { ContributionSheet } from './ContributionSheet';
import { GoalCard } from './GoalCard';
import { GoalDonePanel } from './GoalDonePanel';
import { GoalFormSheet } from './GoalFormSheet';
import { GoalHistoryList } from './GoalHistoryList';

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
            title="아직 정한 목표가 없어요"
            description="기한까지 정하면 한 달에 얼마씩 모을지 알려 드려요"
            actionLabel="목표 만들기"
            onAction={() => setFormOpen(true)}
          />
        </Card>
      ) : (
        <>
          {/*
            다 모았으면 축하가 카드보다 위다. 게이지가 꽉 찬 것만으로는 끝났다는 것이
            안 읽히고, 그러면 마치지도 새로 정하지도 않은 채 그 목표가 영영 남는다.
          */}
          {goal.is_achieved ? (
            <GoalDonePanel goal={goal} onFinished={() => setFormOpen(true)} />
          ) : null}
          <GoalCard
            goal={goal}
            onEdit={() => setFormOpen(true)}
            onContribute={() => setContributionOpen(true)}
          />
          {/*
            목표를 정하고 나면 바로 이 카드가 선다. 카드 안 조용한 줄로는 눈에 안 들어온다는
            실사용 지적을 받고 올렸다. 그림 하나에 멘트 한 줄이다.

            **다 모으면 세우지 않는다.** 그때는 위 축하 자리가 같은 이름의 버튼을 크게
            들고 있어, 둘 다 두면 한 화면에 똑같은 버튼이 두 개가 된다.

            닫기를 두지 않았다. 목표 화면은 일부러 찾아 들어오는 자리라 홈처럼 지나치다
            걸리는 자리가 아니고, 목표를 마치면 스스로 사라진다.
          */}
          {goal.is_achieved ? null : (
            <ShareInviteCard
              ariaLabel="목표 공유"
              kind="goal"
              where="goal"
              icon="14_friends"
              title="이 목표, 친구도 알면 좋잖아요"
              lead="모은 금액은 빼고 진행률만 보내요"
              label="이 목표 친구에게 공유하기"
              message={goalLine(goal.title, parseDecimalOr(goal.progress, 0) * 100)}
            />
          )}

          <ContributionList goalId={goal.id} contributions={goal.contributions} />
          <p className="goal__closing">목표는 언제든 바꿔도, 지워도 괜찮아요</p>
        </>
      )}

      {/* 마친 것이 하나도 없으면 이 자리는 아예 안 그린다. */}
      <GoalHistoryList />

      <GoalFormSheet open={formOpen} goal={goal} onClose={() => setFormOpen(false)} />
      <ContributionSheet
        open={contributionOpen}
        goalId={goal?.id ?? null}
        onClose={() => setContributionOpen(false)}
      />
    </div>
  );
}
