import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { assetAnalysisPath, type AssetAnalysisScope } from '../../app/router/routes';
import {
  parseDecimal,
  parseDecimalOr,
  useAssetAnalysis,
  type AnalysisReturnRowOut,
  type AnalysisReturnsOut,
  type AssetAnalysisOut,
} from '../../shared/api';
import { formatCurrency, formatSignedCurrency } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { Card, ErrorState, LoadingState, iconUrl } from '../../shared/ui';
import { ASSET_GROUP_VIEWS, assetItemName } from '../assets';
import { CategoryDonut, donutColors } from '../reports';

import { AnalysisLockedCard } from './AnalysisEntry';
import {
  foldSlices,
  formatManWon,
  formatRatio,
  formatSignedRatio,
  toDonutRows,
  type AnalysisSlice,
} from './analysisFormat';
import { ANALYSIS_KINDS } from './analysisKinds';
import { useAssetAnalysisUnlock, type AssetAnalysisUnlock } from './useAssetAnalysisUnlock';

/**
 * 분석 화면 본문. 잠겨 있으면 입구와 같은 확인 창을 먼저 세운다.
 *
 * 경로로 바로 들어온 사람도 광고를 건너뛰지 못하게, 지문이 같을 때만 본문을 그린다.
 */
export function AnalysisScreen({ scope }: { scope: AssetAnalysisScope }) {
  const analysis = useAssetAnalysis(scope);
  const unlock = useAssetAnalysisUnlock();
  const fingerprint = analysis.data?.fingerprint ?? null;
  const state = unlock.stateOf(scope, fingerprint);
  const { request } = unlock;
  // 들어오자마자 한 번만 묻는다. 닫으면 카드가 남아 다시 누를 수 있다.
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current || (state !== 'locked' && state !== 'stale')) return;
    asked.current = true;
    request({ scope, fingerprint }, () => undefined);
  }, [fingerprint, request, scope, state]);

  if (analysis.isError) {
    return <ErrorState size="inline" onRetry={() => void analysis.refetch()} />;
  }
  if (analysis.data == null || state === 'unknown') {
    return <LoadingState label="분석을 불러오는 중이에요" />;
  }
  if (state !== 'open') {
    return (
      <>
        <AnalysisLockedCard
          scope={scope}
          stale={state === 'stale'}
          busy={unlock.busy}
          onOpen={() => request({ scope, fingerprint }, () => undefined)}
        />
        {unlock.prompt}
      </>
    );
  }

  return (
    <div className="analysis">
      {scope === 'all' ? (
        <AllAnalysis data={analysis.data} unlock={unlock} />
      ) : (
        <KindAnalysis scope={scope} data={analysis.data} />
      )}
      {unlock.prompt}
    </div>
  );
}

function AllAnalysis({ data, unlock }: { data: AssetAnalysisOut; unlock: AssetAnalysisUnlock }) {
  const navigate = useNavigate();
  // 종류별 분석도 뒤로는 자산 화면이다. 맡겨 둔 자산 화면의 이동 상태를 그대로 넘긴다.
  const { state: carried } = useLocation();
  const [noPension, setNoPension] = useState(false);
  const groups = data.groups ?? [];
  const hasPension = groups.some(
    (group) => group.group === 'pension' && parseDecimalOr(group.amount, 0) > 0,
  );
  const slices: AnalysisSlice[] = groups
    .filter((group) => !(noPension && group.group === 'pension'))
    .map((group) => ({
      key: group.group,
      name: ASSET_GROUP_VIEWS[group.group].label,
      amount: parseDecimalOr(group.amount, 0),
      ratio: noPension ? group.ratio_without_pension : group.ratio,
    }));
  const summary = data.summary;
  const total = parseDecimalOr(
    noPension ? summary?.total_assets_without_pension : summary?.total_assets,
    0,
  );
  const bundles = (data.bundles ?? []).filter(
    (bundle) => bundle.scope !== 'all' && bundle.item_count > 0,
  );

  return (
    <>
      <Card className="analysis-card" data-testid={TEST_IDS.analysisDonut}>
        <div className="analysis-card__head">
          <span className="analysis-card__kicker">어디에 얼마 있나</span>
          {hasPension ? (
            <button
              type="button"
              className="analysis-chip"
              aria-pressed={noPension}
              data-testid={TEST_IDS.analysisNoPension}
              onClick={() => setNoPension((value) => !value)}
            >
              {noPension ? '연금 뺌 ✓' : '연금 빼고 보기'}
            </button>
          ) : null}
        </div>
        <SliceChart slices={slices} caption="자산 합계" total={total} />
        {summary != null ? (
          <div className="analysis-net" data-testid={TEST_IDS.analysisNetWorth}>
            <span>부채</span>
            <b>-{formatCurrency(parseDecimalOr(summary.total_liabilities, 0))}</b>
            <span>순자산</span>
            <b>{formatCurrency(parseDecimalOr(summary.net_worth, 0))}</b>
          </div>
        ) : null}
      </Card>

      <ReturnsCard title="투자 수익률" returns={data.returns ?? null} />

      {data.month_change != null ? (
        <Card className="analysis-card" data-testid={TEST_IDS.analysisMonthChange}>
          <span className="analysis-card__kicker">지난달 대비</span>
          <BigSigned value={parseDecimalOr(data.month_change.delta, 0)} />
          <ul className="analysis-lines">
            {data.month_change.groups.map((change) => {
              const delta = parseDecimalOr(change.delta, 0);
              return (
                <li key={change.group} className="analysis-lines__row">
                  <span>{ASSET_GROUP_VIEWS[change.group].label}</span>
                  <b>{delta === 0 ? '그대로' : formatSignedCurrency(delta)}</b>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {data.saving != null ? <SavingCard saving={data.saving} /> : null}

      {bundles.length > 0 ? (
        <section className="analysis-more" aria-label="종류별로 더 보기">
          <h2 className="analysis-more__title">종류별로 더 보기</h2>
          {bundles.map((bundle) => {
            const kind = ANALYSIS_KINDS[bundle.scope];
            return (
              <Card key={bundle.scope} padding="none" className="analysis-row-card">
                <button
                  type="button"
                  className="analysis-row"
                  data-testid={TEST_IDS.analysisKindRow}
                  data-scope={bundle.scope}
                  data-state={unlock.stateOf(bundle.scope, bundle.fingerprint)}
                  disabled={unlock.busy}
                  onClick={() =>
                    unlock.request(
                      { scope: bundle.scope, fingerprint: bundle.fingerprint },
                      () => void navigate(assetAnalysisPath(bundle.scope), { state: carried }),
                    )
                  }
                >
                  <img
                    className="analysis-row__icon"
                    src={iconUrl(kind.icon)}
                    alt=""
                    aria-hidden="true"
                  />
                  <span className="analysis-row__label">{kind.label}</span>
                  <span className="analysis-row__chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              </Card>
            );
          })}
        </section>
      ) : null}
    </>
  );
}

function KindAnalysis({
  scope,
  data,
}: {
  scope: Exclude<AssetAnalysisScope, 'all'>;
  data: AssetAnalysisOut;
}) {
  const items = data.items ?? [];
  const slices: AnalysisSlice[] = items.map((item, index) => ({
    key: item.item_key ?? `item-${index}`,
    name: assetItemName(item.group, item.label),
    amount: parseDecimalOr(item.amount, 0),
    ratio: item.ratio,
  }));
  const total = parseDecimalOr(data.total, 0);

  return (
    <>
      <Card className="analysis-card" data-testid={TEST_IDS.analysisDonut}>
        <span className="analysis-card__kicker">무엇에 얼마 있나</span>
        <SliceChart slices={slices} caption={`${items.length}개 항목`} total={total} />
      </Card>

      {scope === 'stock' ? (
        <ReturnsCard title="수익률" returns={data.returns ?? null} />
      ) : (
        <Card className="analysis-card" data-testid={TEST_IDS.analysisMonthly}>
          <span className="analysis-card__kicker">매달 넣는 돈</span>
          <b className="analysis-card__big">
            {formatCurrency(parseDecimalOr(data.monthly_total, 0))}
          </b>
          <ul className="analysis-lines">
            {items.map((item, index) => {
              const monthly = parseDecimal(item.monthly_amount);
              return (
                <li key={item.item_key ?? index} className="analysis-lines__row">
                  <span>{assetItemName(item.group, item.label)}</span>
                  <b>
                    {monthly != null && monthly > 0
                      ? `매달 ${formatCurrency(monthly)}`
                      : '한 번 넣은 돈'}
                  </b>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

/** 도넛과 범례. 조각이 하나뿐이면 도넛은 안 서고 범례만 남는다. */
function SliceChart({
  slices,
  caption,
  total,
}: {
  slices: AnalysisSlice[];
  caption: string;
  total: number;
}) {
  const folded = foldSlices(slices);
  const rows = toDonutRows(folded);
  const colors = donutColors(rows);

  return (
    <>
      <CategoryDonut
        rows={rows}
        label="자산 비중"
        testId={TEST_IDS.analysisRing}
        center={{ caption, name: formatManWon(total), share: '' }}
      />
      <ul className="analysis-legend">
        {folded.map((slice) => (
          <li key={slice.key} className="analysis-legend__row">
            <span
              className="analysis-legend__swatch"
              style={{ background: colors.get(slice.key) ?? 'var(--color-dashed)' }}
              aria-hidden="true"
            />
            <span className="analysis-legend__name">{slice.name}</span>
            <span className="analysis-legend__share">{formatRatio(slice.ratio)}</span>
            <b className="analysis-legend__amount">{formatCurrency(slice.amount)}</b>
          </li>
        ))}
      </ul>
    </>
  );
}

/** 현재가나 판 기록이 있는 종목만 센다. 없으면 무엇을 적으면 보이는지 한 줄. */
function ReturnsCard({ title, returns }: { title: string; returns: AnalysisReturnsOut | null }) {
  const rows = returns?.rows ?? [];

  if (returns == null || rows.length === 0) {
    return (
      <Card className="analysis-card" data-testid={TEST_IDS.analysisReturns} data-empty="">
        <span className="analysis-card__kicker">{title}</span>
        <p className="analysis-card__empty">현재가나 판 기록을 적은 종목이 있으면 여기 보여요</p>
      </Card>
    );
  }

  const rate = parseDecimal(returns.rate);
  return (
    <Card className="analysis-card" data-testid={TEST_IDS.analysisReturns}>
      <span className="analysis-card__kicker">{title}</span>
      {rate != null ? (
        <>
          <b className={`analysis-card__big ${toneOf(rate)}`}>{formatSignedRatio(returns.rate)}</b>
          <span className="analysis-card__sub">
            평가 중인 종목 넣은 돈 {formatCurrency(parseDecimalOr(returns.cost, 0))}, 지금{' '}
            {formatCurrency(parseDecimalOr(returns.value, 0))}
          </span>
        </>
      ) : null}
      <ul className="analysis-lines">{rows.flatMap((row, index) => returnLines(row, index))}</ul>
    </Card>
  );
}

/** 한 종목이 평가와 판 기록을 둘 다 가지면 두 줄이다. */
function returnLines(row: AnalysisReturnRowOut, index: number) {
  const name = assetItemName('investment', row.label);
  const key = row.item_key ?? `row-${index}`;
  const lines = [];
  const rate = parseDecimal(row.rate);
  if (rate != null) {
    lines.push(
      <li key={`${key}-eval`} className="analysis-lines__row" data-kind="valuation">
        <span>
          {name} <i className="analysis-tag">평가</i>
        </span>
        <b className={toneOf(rate)}>
          {formatSignedRatio(row.rate)} ({formatSignedCurrency(parseDecimalOr(row.gain, 0))})
        </b>
      </li>,
    );
  }
  const realized = parseDecimal(row.realized);
  if (realized != null) {
    lines.push(
      <li key={`${key}-real`} className="analysis-lines__row" data-kind="realized">
        <span>
          {name} <i className="analysis-tag">판 것</i>
        </span>
        <b className={toneOf(realized)}>
          {row.realized_rate != null ? `${formatSignedRatio(row.realized_rate)} ` : ''}(
          {formatSignedCurrency(realized)})
        </b>
      </li>,
    );
  }
  return lines;
}

function SavingCard({ saving }: { saving: NonNullable<AssetAnalysisOut['saving']> }) {
  const rate = parseDecimal(saving.rate);
  const saved = parseDecimalOr(saving.saved, 0);
  const goal = saving.goal;

  return (
    <Card className="analysis-card analysis-card--two" data-testid={TEST_IDS.analysisSaving}>
      <div className="analysis-card__half">
        <span className="analysis-card__kicker">
          {rate != null ? '이번 달 저축률' : '이번 달 모은 돈'}
        </span>
        <b className="analysis-card__big">
          {rate != null ? formatRatio(saving.rate) : formatCurrency(saved)}
        </b>
        {rate != null ? (
          <span className="analysis-card__sub">
            번 돈 {formatCurrency(parseDecimalOr(saving.income, 0))} 중 {formatCurrency(saved)}
          </span>
        ) : null}
      </div>
      {goal != null ? (
        <div className="analysis-card__half">
          <span className="analysis-card__kicker">목표 「{goal.title}」</span>
          <b className="analysis-card__big">
            {Math.round(parseDecimalOr(goal.progress, 0) * 100)}%
          </b>
          <span className="analysis-card__sub">
            남은 돈 {formatCurrency(parseDecimalOr(goal.remaining, 0))}
          </span>
        </div>
      ) : null}
    </Card>
  );
}

function BigSigned({ value }: { value: number }) {
  return <b className={`analysis-card__big ${toneOf(value)}`}>{formatSignedCurrency(value)}</b>;
}

function toneOf(value: number): string {
  return value > 0 ? 'is-up' : value < 0 ? 'is-down' : '';
}
