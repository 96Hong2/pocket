import { useState } from 'react';

import { useAssets, type AssetGroup, type AssetItemOut } from '../../shared/api';
import { Card, EmptyState, ErrorState, LoadingState } from '../../shared/ui';

import { AssetGroupSection } from './AssetGroupSection';
import { AssetItemSheet, type AssetItemTarget } from './AssetItemSheet';
import { NetWorthCard } from './NetWorthCard';

/** 처음 적을 때 미리 골라 두는 그룹. 대부분 통장 잔액부터 적는다. */
const FIRST_GROUP: AssetGroup = 'cash';

/**
 * 자산 화면 본문.
 *
 * 순자산과 그룹 소계는 서버가 센 값을 그대로 그린다. 저장은 목록을 통째로 보내는
 * PUT 하나뿐이라, 목록을 받지 못한 상태에서는 더하기 입구도 열지 않는다.
 * 그때 새 줄 하나만 보내면 나머지 줄이 통째로 사라진다.
 */
export function AssetsBoard() {
  const assets = useAssets();
  const [target, setTarget] = useState<AssetItemTarget | null>(null);

  if (assets.isError) {
    return (
      <Card padding="md">
        <ErrorState
          size="inline"
          title="자산을 불러오지 못했어요"
          description="지금 적으면 이미 적어 둔 것이 지워질 수 있어서, 먼저 다시 받아 볼게요."
          onRetry={() => void assets.refetch()}
        />
      </Card>
    );
  }

  const data = assets.data ?? null;

  if (data == null) {
    return (
      <Card padding="md">
        <LoadingState variant="rows" rows={2} label="자산을 불러오는 중이에요" />
      </Card>
    );
  }

  const items = data.items;

  function pick(item: AssetItemOut): void {
    setTarget({ sortOrder: item.sort_order, group: item.group });
  }

  function add(group: AssetGroup): void {
    setTarget({ sortOrder: null, group });
  }

  return (
    <div className="assets">
      {items.length === 0 ? (
        // 한 줄도 없을 때 구획 넷과 0원 순자산을 함께 펼치지 않는다. 다음 한 걸음만 보여준다.
        <Card padding="md">
          <EmptyState
            icon="32_piggybank"
            title="아직 자산을 적지 않았어요"
            description="대략이면 충분해요"
            actionLabel="자산 적기"
            onAction={() => add(FIRST_GROUP)}
          />
        </Card>
      ) : (
        <>
          <NetWorthCard summary={data.summary} snapshot={data.snapshot} />
          {/* 구획 순서는 서버가 준 순서 그대로다. 화면이 다시 정렬하지 않는다. */}
          {data.groups.map((row) => (
            <AssetGroupSection
              key={row.group}
              group={row.group}
              total={row.total}
              items={items.filter((item) => item.group === row.group)}
              onPick={pick}
              onAdd={add}
            />
          ))}
          <p className="assets__skip-note">모든 항목은 건너뛸 수 있어요</p>
        </>
      )}

      <AssetItemSheet target={target} items={items} onClose={() => setTarget(null)} />
    </div>
  );
}
