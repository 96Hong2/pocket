import { useState } from 'react';

import { useIdentity } from '../app/providers';
import { AdSlot } from '../features/ads';
import {
  BudgetSuggestCard,
  HomeHero,
  RecoveryCard,
  TodayList,
  resolveHomeView,
  toHomeViewInput,
} from '../features/home';
import { QuickRecordSheet } from '../features/quick-record';
import { useBudget, useCategories, useTransactions } from '../shared/api';
import { Button, ErrorState, LoadingState, UnsupportedFeature, iconUrl } from '../shared/ui';

/** 익명 식별키를 못 받은 상태. 앱은 떠 있지만 저장과 조회가 전부 막힌다. */
function IdentityNotice() {
  const { state, retry } = useIdentity();

  if (state.status === 'unsupported') {
    return <UnsupportedFeature feature="기록 저장" description={state.message} />;
  }
  if (state.status === 'failed') {
    return (
      <ErrorState
        title="사용자 확인을 마치지 못했어요"
        description={state.message}
        onRetry={retry}
      />
    );
  }
  return null;
}

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

function HomeContent({ onRecord }: { onRecord: () => void }) {
  const { state } = useIdentity();
  const budget = useBudget();
  const categories = useCategories();
  const transactions = useTransactions();

  // 식별키가 없으면 조회가 시작되지 않아 pending 이 끝나지 않는다.
  // 아직 오는 중일 때만 기다리게 하고, 실패·미지원은 위 안내가 이유를 말한다.
  if (state.status !== 'ready') {
    return state.status === 'loading' ? (
      <LoadingState label="지금 상태를 불러오는 중이에요" />
    ) : null;
  }

  if (budget.isPending) return <LoadingState label="지금 상태를 불러오는 중이에요" />;
  if (budget.isError || budget.data == null) {
    return <ErrorState onRetry={() => void budget.refetch()} />;
  }

  const view = resolveHomeView(toHomeViewInput(budget.data));

  return (
    <>
      <HomeHero view={view} budget={budget.data} />

      {view.mode === 'recovery' ? (
        <RecoveryCard daysAway={budget.data.days_since_last_transaction} onCatchUp={onRecord} />
      ) : null}

      <RecordButton onClick={onRecord} />

      {view.showBudgetSuggestion ? <BudgetSuggestCard /> : null}

      <TodayList
        transactions={transactions.data?.items ?? []}
        categories={categories.data?.items ?? []}
        loadFailed={transactions.isError || categories.isError}
        onRetry={() => {
          if (transactions.isError) void transactions.refetch();
          if (categories.isError) void categories.refetch();
        }}
      />
    </>
  );
}

export default function HomePage() {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="page home">
      <IdentityNotice />
      <HomeContent onRecord={() => setSheetOpen(true)} />
      {/*
        배너는 모드 분기 밖 최상위 자식이다. 안쪽에 두면 홈이 모드를 바꿀 때마다
        슬롯이 다시 마운트되고, 그것이 사실상 우리가 광고를 새로고침하는 것이 된다.
      */}
      <AdSlot />
      <div className="home__tail" />
      <QuickRecordSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
