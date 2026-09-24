import { useCallback, useState } from 'react';

import { useBridge } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { ApiError, useApiClient, type ApiClient, type TransactionOut } from '../../shared/api';
import { toLedgerDate } from '../../shared/lib/format';
import { BridgeError, type MiniAppBridge } from '../../shared/toss';

import { exportFileName, exportRange, type ExportPeriod, type ExportRange } from './period';
import {
  CATEGORY_HEADER,
  LEDGER_HEADER,
  MONTHLY_HEADER,
  toCategoryCells,
  toCategoryLines,
  toCsv,
  toExportLines,
  toLedgerCells,
  toMonthlyCells,
  toMonthlyLines,
} from './rows';
import { CSV_MIME, toCsvBase64, toXlsxBase64, XLSX_MIME } from './workbook';

export type ExportFormat = 'xlsx' | 'csv';

export type ExportOutcome =
  | { status: 'done'; fileName: string; rows: number; capped: boolean }
  /** 그 기간에 적어 둔 것이 없다. 오류가 아니라 결과의 한 종류다. */
  | { status: 'empty' }
  | { status: 'failed'; message: string };

/** 한 번에 받아 올 줄 수. 서버 상한이 200 이다(`docs/openapi.json`). 적게 받으면 왕복만 는다. */
const PAGE_SIZE = 200;

/**
 * 받아 올 줄의 천장.
 *
 * 둘을 막는다. 커서가 같은 자리를 되풀이하면 끝없이 도는 것, 그리고 몇 만 줄을 한꺼번에
 * 들고 엑셀을 만들다 WebView 가 먼저 죽는 것이다. 목록은 최근 것부터 오므로 천장에 닿으면
 * **최근 1만 줄**이 나간다. 그 사실은 화면에 적는다. 조용히 자르면 없는 기록을 없다고 믿는다.
 */
const MAX_ROWS = 10_000;

const MESSAGES: Record<string, string> = {
  UNSUPPORTED: '토스 앱을 최신으로 올리면 파일로 저장할 수 있어요',
  PERMISSION_DENIED: '저장 권한이 없어 파일을 만들지 못했어요',
};

const FALLBACK = '지금은 파일을 만들지 못했어요. 잠시 뒤 다시 해 주세요';

/**
 * 가계부를 파일 한 장으로 만들어 기기에 내려놓는 한 번.
 *
 * 받아 오기·표 만들기·파일 만들기·저장이 한 줄로 이어져야 한다. 화면이 넷을 따로 부르면
 * 파일까지 만들어 놓고 저장을 못 한 상태가 생기는데, 그때 사용자에게는 아무 일도 안
 * 일어난 것으로 보인다.
 *
 * **실패를 조용히 삼키지 않는다.** 무엇 때문에 막혔는지 한 줄로 돌려주고 화면이 그 자리에
 * 적는다. 공유(`features/share/useShare.ts`)와 같은 규칙이다.
 */
export function useLedgerExport(): {
  busy: boolean;
  outcome: ExportOutcome | null;
  supported: boolean;
  /** 못 쓰는 버전일 때 필요한 숫자까지 적은 한 줄. 쓸 수 있으면 null. */
  unsupportedNotice: string | null;
  run: (period: ExportPeriod, format: ExportFormat) => Promise<void>;
  reset: () => void;
} {
  const bridge = useBridge();
  const client = useApiClient();
  const analytics = useAnalytics();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ExportOutcome | null>(null);

  const supported = bridge.supports('file');

  const run = useCallback(
    async (period: ExportPeriod, format: ExportFormat): Promise<void> => {
      setBusy(true);
      setOutcome(null);

      const log = (params: {
        result: 'ok' | 'failed' | 'unsupported';
        rows: number;
        error_code?: string;
      }) => {
        analytics.log(EVENTS.exportResult, { format, period, ...params }, { kind: 'click' });
      };

      // 못 쓰는 버전이면 버튼이 이미 잠겨 있고 그 이유도 화면에 적혀 있다. 여기서 빨간 줄을
      // 하나 더 세우지 않고 세기만 한다. 여기까지 온 것 자체가 화면과 어긋난 것이라 남긴다.
      if (!supported) {
        log({ result: 'unsupported', rows: 0 });
        setBusy(false);
        return;
      }

      try {
        const today = toLedgerDate(new Date());
        const range = exportRange(period, today);
        const [page, categories] = await Promise.all([
          fetchAll(client, range),
          client.listCategories(),
        ]);
        const lines = toExportLines(page.items, categories.items, range.prefix);

        if (lines.length === 0) {
          setOutcome({ status: 'empty' });
          log({ result: 'failed', rows: 0, error_code: 'empty' });
          return;
        }

        const fileName = exportFileName(period, today, format);
        await bridge.file.save({
          fileName,
          mimeType: format === 'xlsx' ? XLSX_MIME : CSV_MIME,
          data: await buildFile(format, lines),
        });

        setOutcome({ status: 'done', fileName, rows: lines.length, capped: page.capped });
        log({ result: 'ok', rows: lines.length });
      } catch (error) {
        const code = errorCode(error);
        setOutcome({ status: 'failed', message: MESSAGES[code] ?? FALLBACK });
        log({ result: 'failed', rows: 0, error_code: code });
      } finally {
        setBusy(false);
      }
    },
    [analytics, bridge, client, supported],
  );

  return {
    busy,
    outcome,
    supported,
    unsupportedNotice: supported ? null : unsupportedNotice(bridge),
    run,
    reset: useCallback(() => setOutcome(null), []),
  };
}

/**
 * 못 쓰는 이유 한 줄.
 *
 * "토스 앱을 업데이트하세요" 만 말하면 이미 최신인 사람은 무엇을 해야 할지 모른다.
 * 숫자 둘을 나란히 보여 주면 업데이트로 풀리는 일인지 스스로 가를 수 있다
 * (`shared/toss/types.ts` 의 `minAppVersion`).
 */
function unsupportedNotice(bridge: MiniAppBridge): string {
  const required = bridge.minAppVersion('file');
  if (required == null || bridge.appVersion === '') {
    return '파일로 내보내기는 토스 앱을 업데이트하면 쓸 수 있어요.';
  }
  return `파일로 내보내기는 토스 앱 ${required} 이상에서 쓸 수 있어요. 지금 쓰는 토스 앱은 ${bridge.appVersion} 이에요.`;
}

/**
 * 그 기간의 거래를 끝까지 받아 온다.
 *
 * 한 달이면 서버에 그 달만 물어 한두 번으로 끝난다. 올해·전체는 서버가 연 단위 조회를
 * 주지 않아 커서를 따라 전부 받은 뒤 부르는 쪽이 거른다.
 *
 * 빈 쪽이 오는데 커서가 계속 오면 멈춘다. 그 자리는 더 받을 것이 없다는 뜻이고,
 * 안 멈추면 화면이 영영 「만드는 중」 에 머문다.
 */
async function fetchAll(
  client: ApiClient,
  range: ExportRange,
): Promise<{ items: TransactionOut[]; capped: boolean }> {
  const month =
    range.month == null
      ? {}
      : { year: Number(range.month.slice(0, 4)), month: Number(range.month.slice(5, 7)) };

  const items: TransactionOut[] = [];
  let cursor: string | undefined;

  for (;;) {
    const page = await client.listTransactions({ ...month, limit: PAGE_SIZE, cursor });
    items.push(...page.items);
    cursor = page.next_cursor ?? undefined;
    if (cursor == null || page.items.length === 0 || items.length >= MAX_ROWS) break;
  }

  return { items: items.slice(0, MAX_ROWS), capped: cursor != null && items.length >= MAX_ROWS };
}

/**
 * 고른 형식으로 파일 본문을 만든다.
 *
 * CSV 에는 「전체 내역」 한 장만 담는다. 한 파일에 표 하나뿐인 형식이라, 요약까지 붙이면
 * 열 수가 다른 표 셋이 한 장에 섞여 어느 서비스도 못 읽는다. 요약이 필요한 사람은 엑셀을
 * 고르면 된다.
 */
async function buildFile(
  format: ExportFormat,
  lines: ReturnType<typeof toExportLines>,
): Promise<string> {
  const ledgerRows = lines.map(toLedgerCells);
  if (format === 'csv') return toCsvBase64(toCsv(LEDGER_HEADER, ledgerRows));

  return toXlsxBase64([
    { name: '전체 내역', header: LEDGER_HEADER, rows: ledgerRows },
    {
      name: '월별 요약',
      header: MONTHLY_HEADER,
      rows: toMonthlyLines(lines).map(toMonthlyCells),
    },
    {
      name: '카테고리별 요약',
      header: CATEGORY_HEADER,
      rows: toCategoryLines(lines).map(toCategoryCells),
    },
  ]);
}

/** 무엇이 막았는지 한 낱말로. 화면 문구와 로그가 같은 값을 본다. */
function errorCode(error: unknown): string {
  if (error instanceof BridgeError) return error.code;
  if (error instanceof ApiError) return error.code;
  return 'unknown';
}
