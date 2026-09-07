import { useState } from 'react';
import { Link } from 'react-router';

import { IdentityNotice } from '../app/IdentityNotice';
import { useIdentity } from '../app/providers';
import { ROUTES } from '../app/router/routes';
import { AdSlot } from '../features/ads';
import {
  BudgetSuggestCard,
  ClosingEntryCard,
  GoalStatusCard,
  HomeHero,
  RecoveryCard,
  TodayList,
  resolveHeroLayout,
  resolveHomeView,
  toHomeViewInput,
} from '../features/home';
import { QuickRecordSheet, type RecordTab } from '../features/quick-record';
import { EditSheet } from '../features/transactions';
// 방식 → 탭 환산은 시트 옆에 있다. 배럴에는 시트만 나와 있어 파일을 곧장 가리킨다.
import { DEFAULT_RECORD_TAB, resolveRecordTab } from '../features/quick-record/recordTab';
import {
  useBudget,
  useCategories,
  useGoal,
  usePreferences,
  useTransactions,
  type TransactionOut,
} from '../shared/api';
import { Button, ErrorState, LoadingState, iconUrl } from '../shared/ui';

function RecordButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      className="home-cta"
      fullWidth
      onClick={onClick}
      leadingIcon={
        <img className="home-cta__icon" src={iconUrl('01_coins')} alt="" aria-hidden="true" />
      }
    >
      10초 기록
    </Button>
  );
}

function HomeContent({ onRecord }: { onRecord: (tab: RecordTab) => void }) {
  const { state } = useIdentity();
  // 홈에서 바로 고친다. 여기서 못 고치면 달력까지 들어가야 해서 아무도 안 고친다.
  const [editing, setEditing] = useState<TransactionOut | null>(null);
  const budget = useBudget();
  const categories = useCategories();
  const transactions = useTransactions();
  const preferences = usePreferences();
  const goal = useGoal();

  // 식별키가 없으면 조회가 시작되지 않아 pending 이 끝나지 않는다.
  // 아직 오는 중일 때만 기다리게 하고, 실패·미지원은 위 안내가 이유를 말한다.
  if (state.status !== 'ready') {
    return state.status === 'loading' ? (
      <LoadingState label="지금 상태를 불러오는 중이에요" />
    ) : null;
  }

  if (budget.isPending) return <LoadingState label="지금 상태를 불러오는 중이에요" />;

  // 예산 조회가 실패하면 히어로 자리만 대신한다.
  // 그 자리에서 통째로 return 하면 '10초 기록' 버튼까지 사라져, 읽기 실패가 쓰기 진입점을 막는다.
  // 이 앱의 목적은 기록이라 조회가 안 되는 동안에도 기록은 되어야 한다.
  const view = budget.data != null ? resolveHomeView(toHomeViewInput(budget.data)) : null;

  return (
    <>
      {view != null && budget.data != null ? (
        <HomeHero
          view={view}
          budget={budget.data}
          // 설정을 기다리느라 히어로를 비워 두지 않는다. 첫 진입이 한 박자 늦어 보이는 쪽이
          // 더 나쁘다. 대신 아직 못 받은 동안은 서버 기본값과 같은 화면이고, 실패로 굳으면
          // 히어로가 그 사실을 한 줄로 밝힌다.
          layout={resolveHeroLayout(preferences.data?.home_hero, view.hasBudget)}
          preferencesFailed={preferences.isError}
          onRetryPreferences={() => void preferences.refetch()}
        />
      ) : (
        <ErrorState onRetry={() => void budget.refetch()} />
      )}

      {/* 며칠치를 한 건씩 손으로 적는 것은 애초에 안 될 제안이라 캡처 탭으로 연다. */}
      {view?.mode === 'recovery' && budget.data != null ? (
        <RecoveryCard progress={budget.data.recovery} onCatchUp={() => onRecord('capture')} />
      ) : null}

      {/*
        마지막에 쓴 방식으로 연다. 설정이 아직 안 왔으면 기다리지 않고 키패드로 연다.
        시트가 늦게 열리면 10초 안에 적는다는 약속부터 깨진다.
      */}
      <RecordButton
        onClick={() => onRecord(resolveRecordTab(preferences.data?.last_record_method))}
      />

      {/*
        지난달 결산 안내. 달이 바뀐 뒤 며칠 동안, 지난달에 기록이 있고 아직 안 봤을 때만
        스스로 나타난다. 기록 버튼 아래에 두어 오늘 할 일을 가리지 않는다.
      */}
      <ClosingEntryCard />

      {view?.showBudgetSuggestion ? <BudgetSuggestCard /> : null}

      {/*
        목표가 있을 때만 그린다. 조회가 실패하면 이 자리를 비우고 오류 자리를 만들지 않는다.
        홈에서 할 일은 기록이고, 목표는 곁들여 보는 값이다.
      */}
      {goal.data?.goal != null ? <GoalStatusCard goal={goal.data.goal} /> : null}

      <TodayList
        transactions={transactions.data?.items ?? []}
        categories={categories.data?.items ?? []}
        loading={transactions.isPending || categories.isPending}
        loadFailed={transactions.isError || categories.isError}
        onRetry={() => {
          if (transactions.isError) void transactions.refetch();
          if (categories.isError) void categories.refetch();
        }}
        onPick={setEditing}
      />

      {/* 달력 화면으로 가는 유일한 입구다. 오늘 아래에 두어 "오늘 말고 그 전" 으로 읽히게 한다. */}
      <Link className="home-more" to={ROUTES.calendar}>
        전체 내역 보기
      </Link>

      {/*
        달력과 같은 시트를 쓴다. 고치는 자리가 둘이 되면 규칙도 둘이 된다.
        달은 넘기지 않는다. 홈의 조회도 달 없이 부르니, 수정 응답이 캐시에 쓰는 키를
        홈이 읽는 키와 맞춰야 히어로 숫자가 왕복 없이 바뀐다.
      */}
      <EditSheet
        transaction={editing}
        categories={categories.data?.items ?? []}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

export default function HomePage() {
  const [sheet, setSheet] = useState<{ open: boolean; tab: RecordTab }>({
    open: false,
    tab: DEFAULT_RECORD_TAB,
  });

  return (
    <div className="page home">
      <IdentityNotice />
      <HomeContent onRecord={(tab) => setSheet({ open: true, tab })} />
      {/*
        배너는 모드 분기 밖 최상위 자식이다. 안쪽에 두면 홈이 모드를 바꿀 때마다
        슬롯이 다시 마운트되고, 그것이 사실상 우리가 광고를 새로고침하는 것이 된다.
      */}
      <AdSlot />
      <div className="home__tail" />
      <QuickRecordSheet
        open={sheet.open}
        initialTab={sheet.tab}
        onClose={() => setSheet((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
