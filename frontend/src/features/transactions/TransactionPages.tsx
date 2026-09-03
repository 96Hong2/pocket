import type { ReactNode } from 'react';

import type { CategoryOut, TransactionOut } from '../../shared/api';
import { LedgerRow } from '../../shared/ledger';
import { Button, Card, ErrorState, LoadingState } from '../../shared/ui';

/**
 * 커서로 이어 받는 거래 목록.
 *
 * 선택한 날 목록과 검색 결과가 같은 것을 쓴다. 둘은 감싸는 제목만 다르다.
 *
 * "더 보기" 를 관찰자(IntersectionObserver) 대신 버튼으로 둔 이유: 버튼이 있으면
 * 다음 페이지를 받는 동작을 화면으로 증명할 수 있다. 관찰자만 두면 헤드리스에서
 * 스크롤이 안 잡히는 환경이 있어 "되는지 모르는 채" 로 남는다.
 */
export interface TransactionPagesProps {
  items: TransactionOut[];
  categories: CategoryOut[];
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onMore: () => void;
  onPick: (transaction: TransactionOut) => void;
  /** 한 건도 없을 때 그릴 것. 자리마다 문구가 달라서 받는다. */
  empty: ReactNode;
}

export function TransactionPages({
  items,
  categories,
  isPending,
  isError,
  onRetry,
  hasMore,
  isLoadingMore,
  onMore,
  onPick,
  empty,
}: TransactionPagesProps) {
  if (isPending) return <LoadingState variant="rows" label="기록을 불러오는 중이에요" />;

  if (isError) {
    return (
      <Card padding="md">
        <ErrorState
          size="inline"
          title="기록을 불러오지 못했어요"
          description="적어 둔 것이 사라진 게 아니에요. 다시 시도해 주세요."
          onRetry={onRetry}
        />
      </Card>
    );
  }

  if (items.length === 0) return <>{empty}</>;

  return (
    <>
      <Card padding="list">
        {items.map((tx, index) => (
          <LedgerRow
            key={tx.id}
            transaction={tx}
            categories={categories}
            hideDivider={index === items.length - 1}
            onClick={() => onPick(tx)}
          />
        ))}
      </Card>
      {hasMore ? (
        <Button
          className="tx-more"
          variant="outline"
          fullWidth
          onClick={onMore}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? '불러오는 중…' : '더 보기'}
        </Button>
      ) : null}
    </>
  );
}
