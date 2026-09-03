import { useState } from 'react';
import { Link } from 'react-router';

import { IdentityNotice } from '../app/IdentityNotice';
import { useIdentity } from '../app/providers';
import { ROUTES } from '../app/router/routes';
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

  // 예산 조회가 실패하면 히어로 자리만 대신한다.
  // 그 자리에서 통째로 return 하면 '10초 기록' 버튼까지 사라져, 읽기 실패가 쓰기 진입점을 막는다.
  // 이 앱의 목적은 기록이라 조회가 안 되는 동안에도 기록은 되어야 한다.
  const view = budget.data != null ? resolveHomeView(toHomeViewInput(budget.data)) : null;

  return (
    <>
      {view != null && budget.data != null ? (
        <HomeHero view={view} budget={budget.data} />
      ) : (
        <ErrorState onRetry={() => void budget.refetch()} />
      )}

      {view?.mode === 'recovery' && budget.data != null ? (
        <RecoveryCard daysAway={budget.data.days_since_last_transaction} onCatchUp={onRecord} />
      ) : null}

      <RecordButton onClick={onRecord} />

      {view?.showBudgetSuggestion ? <BudgetSuggestCard /> : null}

      <TodayList
        transactions={transactions.data?.items ?? []}
        categories={categories.data?.items ?? []}
        loading={transactions.isPending || categories.isPending}
        loadFailed={transactions.isError || categories.isError}
        onRetry={() => {
          if (transactions.isError) void transactions.refetch();
          if (categories.isError) void categories.refetch();
        }}
      />

      {/* 달력 화면으로 가는 유일한 입구다. 오늘 아래에 두어 "오늘 말고 그 전" 으로 읽히게 한다. */}
      <Link className="home-more" to={ROUTES.calendar}>
        전체 내역 보기
      </Link>
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
