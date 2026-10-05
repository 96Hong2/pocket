import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { ASSET_CHECKIN_QUERY } from '../../app/router/routes';
import { AdSlot } from '../ads';
import { AnalysisEntry } from '../asset-analysis';
import { CaptureEntry } from '../asset-capture';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { useAssetHistory, useAssets, type AssetGroup, type AssetItemOut } from '../../shared/api';
import { ASSET_ITEM_MAX_COUNT } from '../../shared/lib/limits';
import { Button, Card, EmptyState, ErrorState, LoadingState } from '../../shared/ui';

import { AssetGroupSection } from './AssetGroupSection';
import { AssetItemSheet, type AssetItemTarget } from './AssetItemSheet';
import { CheckinSheet } from './CheckinSheet';
import { NetWorthCard } from './NetWorthCard';
import { NetWorthDetailSheet } from './NetWorthDetailSheet';

/** 「직접 적기」 로 열 때 미리 골라 두는 그룹. 대부분 통장 잔액부터 적는다. */
const FIRST_GROUP: AssetGroup = 'cash';

/**
 * 자산 화면 본문. 차례: 순자산 카드, 「내 자산 분석」, 캡처로 채우기, 배너, 그룹 다섯.
 *
 * 저장은 목록을 통째로 보내는 PUT 하나뿐이라, 목록을 받지 못한 상태에서는 더하기 입구도
 * 열지 않는다. 그때 새 줄 하나만 보내면 나머지 줄이 통째로 사라진다.
 */
export function AssetsBoard() {
  const analytics = useAnalytics();
  const assets = useAssets();
  const history = useAssetHistory();
  const [target, setTarget] = useState<AssetItemTarget | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  // 홈 체크인 카드에서 왔으면 목록을 받은 뒤 「바뀐 것만 고쳐요」 를 연다. 닫으면 쿼리를 걷는다.
  const checkinOpen =
    params.get(ASSET_CHECKIN_QUERY) === '1' && (assets.data?.items.length ?? 0) > 0;

  function closeCheckin(): void {
    setParams(
      (current) => {
        current.delete(ASSET_CHECKIN_QUERY);
        return current;
      },
      { replace: true },
    );
  }

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
  // 옛 `groups` 는 연금이 없는 넷이다. 다섯 그룹은 `all_groups` 에 온다.
  const groups = data.all_groups ?? data.groups;
  const points = history.data?.points ?? [];
  const full = items.length >= ASSET_ITEM_MAX_COUNT;

  function pick(item: AssetItemOut): void {
    setTarget({ sortOrder: item.sort_order, group: item.group });
  }

  function add(group: AssetGroup): void {
    setTarget({ sortOrder: null, group });
  }

  function openDetail(): void {
    analytics.log(EVENTS.assetNetworthOpened, {}, { kind: 'click' });
    setDetailOpen(true);
  }

  return (
    <div className="assets">
      {items.length === 0 ? (
        <>
          <Card padding="md">
            <EmptyState
              icon="32_piggybank"
              title="아직 자산을 적지 않았어요"
              action={
                <div className="assets-empty__actions">
                  <CaptureEntry onManual={() => add(FIRST_GROUP)} />
                  <Button variant="outline" fullWidth onClick={() => add(FIRST_GROUP)}>
                    직접 적기
                  </Button>
                </div>
              }
            />
          </Card>
          <AdSlot placement="assets_top" />
        </>
      ) : (
        <>
          <NetWorthCard
            summary={data.summary}
            snapshot={data.snapshot}
            points={points}
            onOpen={openDetail}
          />
          <AnalysisEntry />
          <CaptureEntry onManual={() => add(FIRST_GROUP)} />
          <AdSlot placement="assets_top" />
          {/* 구획 순서는 서버가 준 순서 그대로다. */}
          {groups.map((row) => (
            <AssetGroupSection
              key={row.group}
              group={row.group}
              total={row.total}
              items={items.filter((item) => item.group === row.group)}
              full={full}
              onPick={pick}
              onAdd={add}
            />
          ))}
          {full ? (
            <p className="assets__full">자산은 {ASSET_ITEM_MAX_COUNT}개까지 적을 수 있어요</p>
          ) : null}
        </>
      )}

      <NetWorthDetailSheet
        open={detailOpen}
        summary={data.summary}
        snapshot={data.snapshot}
        points={points}
        onClose={() => setDetailOpen(false)}
      />
      <AssetItemSheet target={target} items={items} onClose={() => setTarget(null)} />
      <CheckinSheet open={checkinOpen} items={items} onClose={closeCheckin} />
    </div>
  );
}
