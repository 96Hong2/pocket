import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { assetAnalysisPath, type AssetAnalysisScope } from '../../app/router/routes';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  parseDecimal,
  parseDecimalOr,
  useAssetAnalysis,
  useAssetHistory,
  useCurrentPeriod,
  type AnalysisReturnRowOut,
  type AnalysisReturnsOut,
  type AnalysisSavedItemOut,
  type AssetAnalysisOut,
  type TransactionOut,
} from '../../shared/api';
import {
  formatCurrency,
  formatDayLabel,
  formatSignedCurrency,
  toLedgerDate,
} from '../../shared/lib/format';
import { formatPeriodRange } from '../../shared/lib/monthPeriod';
import { TEST_IDS } from '../../shared/testIds';
import { Card, ErrorState, LoadingState, PeriodRange, iconUrl } from '../../shared/ui';
import { ASSET_GROUP_VIEWS, assetItemName } from '../assets';
import { CategoryDonut, MonthBars, RankList, ShareBars, donutColors } from '../reports';

import { AnalysisLockedCard } from './AnalysisEntry';
import {
  foldSlices,
  formatManWon,
  formatRatio,
  formatSignedRatio,
  monthsEndingAt,
  toDonutRows,
  toneOf,
  type AnalysisSlice,
} from './analysisFormat';
import { ANALYSIS_KINDS } from './analysisKinds';
import { SignedBars } from './SignedBars';
import { useAssetAnalysisUnlock, type AssetAnalysisUnlock } from './useAssetAnalysisUnlock';

/** 막대 여섯 개. 리포트 「6개월 흐름」 과 같다. */
const TREND_MONTHS = 6;

/**
 * 분석 화면 본문. 잠겨 있으면 입구와 같은 확인 창을 먼저 세운다.
 *
 * 경로로 바로 들어온 사람도 광고를 건너뛰지 못하게, 지문이 같을 때만 본문을 그린다.
 */
export function AnalysisScreen({
  scope,
  onEditRecord,
}: {
  scope: AssetAnalysisScope;
  /**
   * 「큰 저축·투자 Top 5」 줄을 눌렀다. 고치기 시트는 페이지가 띄운다.
   * 시트가 저장하거나 지우면 `onSaved` 를 부른다.
   */
  onEditRecord: (transaction: TransactionOut, onSaved: () => void) => void;
}) {
  const analysis = useAssetAnalysis(scope);
  const unlock = useAssetAnalysisUnlock();
  const fingerprint = analysis.data?.fingerprint ?? null;
  const seen = unlock.stateOf(scope, fingerprint);
  /*
    열린 분석 안에서 기록을 고쳐 숫자가 바뀐 것은 다시 광고를 묻지 않는다.
    `edited` 는 고치기를 연 때의 지문과 저장한 시각이다. 저장 뒤 처음 새로 받은 분석에서 지문이 바뀌었으면
    그 지문 하나만 `carry` 로 남기고 `edited` 는 지운다. 그 뒤 다른 데서 자산이 바뀌면 다시 광고를 묻는다.
  */
  const [edited, setEdited] = useState<{ from: string | null; at: number } | null>(null);
  const [carry, setCarry] = useState<string | null>(null);
  if (edited != null && analysis.dataUpdatedAt > edited.at) {
    setEdited(null);
    setCarry(fingerprint !== edited.from ? fingerprint : null);
  }
  const carried = seen === 'stale' && carry != null && carry === fingerprint;
  const state = carried ? 'open' : seen;
  const { request, grant } = unlock;
  // 들어오자마자 한 번만 묻는다. 닫으면 카드가 남아 다시 누를 수 있다.
  const asked = useRef(false);

  useEffect(() => {
    if (carried) grant([{ scope, fingerprint }]);
  }, [carried, fingerprint, grant, scope]);

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
        <AllAnalysis
          data={analysis.data}
          unlock={unlock}
          onEdit={(transaction) => {
            const from = fingerprint;
            onEditRecord(transaction, () => setEdited({ from, at: Date.now() }));
          }}
        />
      ) : (
        <KindAnalysis scope={scope} data={analysis.data} />
      )}
      {unlock.prompt}
    </div>
  );
}

function AllAnalysis({
  data,
  unlock,
  onEdit,
}: {
  data: AssetAnalysisOut;
  unlock: AssetAnalysisUnlock;
  /** Top 5 줄을 눌러 그 기록을 고치러 간다. */
  onEdit: (transaction: TransactionOut) => void;
}) {
  const navigate = useNavigate();
  const analytics = useAnalytics();
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
  const debt = parseDecimalOr(summary?.total_liabilities, 0);
  const total = parseDecimalOr(
    noPension ? summary?.total_assets_without_pension : summary?.total_assets,
    0,
  );
  const bundles = (data.bundles ?? []).filter(
    (bundle) => bundle.scope !== 'all' && bundle.item_count > 0,
  );
  const { grant } = unlock;

  // 전체 분석을 연 동안은 그 안의 종류별 분석도 연 것으로 적는다. 종류마다 광고를 또 보지 않게.
  useEffect(() => {
    grant(
      (data.bundles ?? [])
        .filter((bundle) => bundle.scope !== 'all')
        .map((bundle) => ({ scope: bundle.scope, fingerprint: bundle.fingerprint })),
    );
  }, [data.bundles, grant]);

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
            <b>
              {debt > 0 ? '-' : ''}
              {formatCurrency(debt)}
            </b>
            <span>순자산</span>
            <b>{formatCurrency(parseDecimalOr(summary.net_worth, 0))}</b>
          </div>
        ) : null}
      </Card>

      <NetWorthTrend />

      <ReturnsCard title="투자 수익률" returns={data.returns ?? null} />

      {data.month_change != null ? (
        <Card className="analysis-card" data-testid={TEST_IDS.analysisMonthChange}>
          <span className="analysis-card__kicker">지난달 대비</span>
          <BigSigned value={parseDecimalOr(data.month_change.delta, 0)} />
          <SignedBars
            rows={data.month_change.groups.map((change) => {
              const delta = parseDecimalOr(change.delta, 0);
              return {
                key: change.group,
                name: ASSET_GROUP_VIEWS[change.group].label,
                value: delta,
                text: delta === 0 ? '그대로' : formatSignedCurrency(delta),
              };
            })}
          />
        </Card>
      ) : null}

      {data.saving != null ? <SavingCard saving={data.saving} /> : null}

      <SavedItemsCard items={data.saved_items ?? []} />

      <SavedTrendCard points={data.saved_trend ?? []} />

      <TopSavesCard
        rows={data.large_saves ?? []}
        items={data.saved_items ?? []}
        onPick={(transaction, rank) => {
          analytics.log(EVENTS.assetAnalysisTopOpened, { rank }, { kind: 'click' });
          onEdit(transaction);
        }}
      />

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

/** 달마다 월말 순자산. 첫 기록보다 앞 달은 막대 없이 달 이름만, 점이 하나뿐이면 카드를 안 세운다. */
function NetWorthTrend() {
  const history = useAssetHistory(TREND_MONTHS);
  const points = history.data?.points ?? [];
  if (points.length < 2) return null;
  // 이번 기간의 이름 달. 첫 점 뒤로는 기간마다 점이 있어 마지막 점이 늘 이번 기간이다.
  const thisMonth = points[points.length - 1].month;
  const byMonth = new Map(points.map((point) => [point.month, parseDecimalOr(point.net_worth, 0)]));

  return (
    <Card className="analysis-card" data-testid={TEST_IDS.analysisNetWorthTrend}>
      <span className="analysis-card__kicker">순자산 흐름</span>
      <MonthBars
        bars={monthsEndingAt(thisMonth, TREND_MONTHS).map((month) => ({
          month,
          value: byMonth.get(month) ?? null,
        }))}
        currentMonth={thisMonth}
        testId={TEST_IDS.analysisTrendBar}
      />
    </Card>
  );
}

/** 「어디에」 이름. 같은 날 지운 항목은 서버가 이름도 그룹도 없이 보낸다. */
function savedItemName(item: Pick<AnalysisSavedItemOut, 'group' | 'label'>): string {
  if (item.group == null) return item.label ?? '지운 항목';
  return assetItemName(item.group, item.label);
}

/** 이번 달 넣은 돈을 「어디에」 마다. 없으면 카드를 안 세운다. */
function SavedItemsCard({ items }: { items: AnalysisSavedItemOut[] }) {
  if (items.length === 0) return null;
  return (
    <Card className="analysis-card">
      <span className="analysis-card__kicker">어디에 모았나</span>
      <ShareBars
        className="analysis-share"
        testId={TEST_IDS.analysisSavedItems}
        rows={items.map((item) => ({
          key: item.item_key,
          name: savedItemName(item),
          amount: parseDecimalOr(item.amount, 0),
          share: (parseDecimal(item.ratio) ?? 0) / 100,
        }))}
      />
    </Card>
  );
}

/** 기간마다 모은 돈. 여섯 기간 모두 0 이면 그릴 것이 없다. */
function SavedTrendCard({ points }: { points: NonNullable<AssetAnalysisOut['saved_trend']> }) {
  const bars = points.map((point) => ({
    month: point.period_key,
    value: parseDecimalOr(point.amount, 0),
  }));
  if (!bars.some((bar) => bar.value > 0)) return null;

  return (
    <Card className="analysis-card" data-testid={TEST_IDS.analysisSavedTrend}>
      <span className="analysis-card__kicker">달마다 모은 돈</span>
      <MonthBars
        bars={bars}
        currentMonth={bars.at(-1)?.month ?? ''}
        testId={TEST_IDS.analysisTrendBar}
      />
    </Card>
  );
}

/** 이번 달 넣은 기록 중 큰 것 다섯. 서버가 골라 준 순서 그대로, 누르면 그 기록의 고치기 시트. */
function TopSavesCard({
  rows,
  items,
  onPick,
}: {
  rows: TransactionOut[];
  items: AnalysisSavedItemOut[];
  onPick: (transaction: TransactionOut, rank: number) => void;
}) {
  if (rows.length === 0) return null;
  const byKey = new Map(items.map((item) => [item.item_key, item]));

  return (
    <Card className="analysis-card" data-testid={TEST_IDS.analysisTopSaves}>
      <span className="analysis-card__kicker">큰 저축·투자 Top 5</span>
      <RankList
        rowTestId={TEST_IDS.analysisTopSaveRow}
        amountTestId={TEST_IDS.analysisTopSaveAmount}
        rows={rows.map((row, index) => {
          const item = byKey.get(row.asset_item_key ?? '');
          const group = item?.group ?? null;
          return {
            key: row.id,
            name: item != null ? savedItemName(item) : (row.asset_label ?? '저축·투자'),
            sub: formatDayLabel(toLedgerDate(new Date(row.occurred_at))),
            icon:
              group != null ? (
                <img
                  className="analysis-top__icon"
                  src={iconUrl(ASSET_GROUP_VIEWS[group].icon)}
                  alt=""
                  aria-hidden="true"
                />
              ) : (
                <span className="analysis-top__icon" aria-hidden="true" />
              ),
            amount: parseDecimalOr(row.amount, 0),
            onSelect: () => onPick(row, index + 1),
          };
        })}
      />
    </Card>
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
        <ReturnsCard title="수익률" returns={data.returns ?? null} bars />
      ) : (
        <Card className="analysis-card" data-testid={TEST_IDS.analysisMonthly}>
          <span className="analysis-card__kicker">매달 넣는 돈</span>
          <b className="analysis-card__big" data-testid={TEST_IDS.analysisMonthlyTotal}>
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
function ReturnsCard({
  title,
  returns,
  bars = false,
}: {
  title: string;
  returns: AnalysisReturnsOut | null;
  /** 평가 줄을 늘고 줄고 막대로 그린다(주식 분석). 판 것 줄은 그대로 글줄이다. */
  bars?: boolean;
}) {
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
  const lines = rows.flatMap((row, index) => returnLines(row, index, !bars));
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
      {bars ? <ValuationBars rows={rows} /> : null}
      {lines.length > 0 ? <ul className="analysis-lines">{lines}</ul> : null}
    </Card>
  );
}

/** 종목마다 지금 수익률 막대. 넣은 돈과 지금 가격을 아는 종목만 서버가 rate 를 준다. */
function ValuationBars({ rows }: { rows: AnalysisReturnRowOut[] }) {
  const rated = rows.filter((row) => parseDecimal(row.rate) != null);
  if (rated.length === 0) return null;
  return (
    <SignedBars
      testId={TEST_IDS.analysisStockRates}
      rows={rated.map((row, index) => ({
        key: row.item_key ?? `rate-${index}`,
        name: assetItemName('investment', row.label),
        value: parseDecimalOr(row.rate, 0),
        text: `${formatSignedRatio(row.rate)} (${formatSignedCurrency(parseDecimalOr(row.gain, 0))})`,
      }))}
    />
  );
}

/** 한 종목이 평가와 판 기록을 둘 다 가지면 두 줄이다. 평가를 막대로 그렸으면 판 것만. */
function returnLines(row: AnalysisReturnRowOut, index: number, withValuation: boolean) {
  const name = assetItemName('investment', row.label);
  const key = row.item_key ?? `row-${index}`;
  const lines = [];
  const rate = parseDecimal(row.rate);
  if (rate != null && withValuation) {
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
  // 서버도 오늘이 든 기간으로 센다. 한 달 시작일이 1 이 아니면 「이번 달」 이 며칠부터인지 적는다.
  const current = useCurrentPeriod();

  return (
    <Card className="analysis-card analysis-card--two" data-testid={TEST_IDS.analysisSaving}>
      <div className="analysis-card__half">
        <span className="analysis-card__titled">
          <span className="analysis-card__kicker">
            {rate != null ? '이번 달 저축률' : '이번 달 모은 돈'}
          </span>
          {current.startDay !== 1 ? (
            <PeriodRange
              className="analysis-card__period"
              range={formatPeriodRange(current.period)}
              testId={TEST_IDS.analysisSavingPeriod}
            />
          ) : null}
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
