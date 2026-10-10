import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useNavigationType, useSearchParams } from 'react-router';

import { IdentityNotice } from '../app/IdentityNotice';
import { useBookView, useToast } from '../app/providers';
import {
  REPORT_MONTH_QUERY,
  REPORT_TAB_QUERY,
  ROUTES,
  parseReportTab,
  reportCategoryPath,
  reportPath,
  type BackState,
  type ReportTab,
} from '../app/router/routes';
import { AdSlot } from '../features/ads';
import { BookChip, bookPeriodNow } from '../features/books';
import { MonthStartSheet } from '../features/budgets';
import { BookReport, MonthlyReport } from '../features/reports';
import { EditSheet } from '../features/transactions';
import { EVENTS, useAnalytics } from '../shared/analytics';
import {
  useBooks,
  useCategories,
  useCurrentPeriod,
  useFetchTransaction,
  type TransactionOut,
} from '../shared/api';
import { toLedgerDate } from '../shared/lib/format';
import { CalendarGlyph } from '../shared/ui';

/**
 * 분류 화면이나 자산 화면에 다녀오면 보던 자리로 돌아온다. 화면이 바뀌면 앱이 맨 위로 올리므로
 * 나가기 직전 자리를 리포트 주소(달과 탭)와 함께 적어 두고, 돌아와 그 주소면 한 번 쓴다.
 */
const SCROLL_KEY = 'pocket.report.scroll';
// 본문이 다 그려질 때까지 기다리는 한도. 넘기면 맨 위에 둔다.
const RESTORE_WAIT_MS = 2000;

interface SavedScroll {
  at: string;
  y: number;
}

function rememberScroll(at: string): void {
  try {
    const saved: SavedScroll = { at, y: Math.round(window.scrollY) };
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(saved));
  } catch {
    // 저장소가 막힌 기기는 돌아오면 맨 위다.
  }
}

function readScroll(): SavedScroll | null {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as Partial<SavedScroll> | null;
    if (typeof parsed?.at !== 'string' || typeof parsed.y !== 'number' || parsed.y <= 0)
      return null;
    return { at: parsed.at, y: parsed.y };
  } catch {
    return null;
  }
}

function forgetScroll(): void {
  try {
    sessionStorage.removeItem(SCROLL_KEY);
  } catch {
    // 못 지우면 다음에 같은 주소로 돌아올 때 한 번 더 쓰일 뿐이다.
  }
}

/** `2026-08` 모양인지. 홈 카드가 붙여 준 값이라 아무 문자열이나 들어올 수 있다. */
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `2026-09` 에서 `2026-07` 은 2달 전. 로그에 날짜 대신 싣는 수다. */
function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return ty * 12 + tm - (fy * 12 + fm);
}

/**
 * 리포트 탭. 그 달에 어디로 얼마나 갔는지 한 화면에서 본다.
 *
 * 같이 쓰는 가계부가 있으면 제목 아래 가계부 칩이 선다. 처음에는 홈에서 보던 가계부를
 * 보여 주고, 여기서 바꿔도 홈은 그대로다. 가계부가 없는 사람의 화면은 예전과 같다.
 *
 * **달을 넘기다 광고가 뜨지 않는다.** 예전에는 세 번째 이동에 전면 광고 한 편이 섰다.
 * 화살표를 누른 것뿐인 사람에게 아무 예고 없이 화면을 덮는 자리라 뺐다. 본문 사이와
 * 아래의 배너는 그대로다.
 */
export default function ReportPage() {
  // 내 리포트의 이번 달은 내 한 달 시작일로, 공유 가계부는 그 가계부 시작일로 정한 이름 달이다.
  const current = useCurrentPeriod();
  const thisMonth = current.period.key;
  const analytics = useAnalytics();
  // 홈의 결산 카드가 `?month=2026-08&closing=1` 로 데려온다. 그때는 그 달로 열고
  // 결산까지 펼친다. 주소를 손으로 친 경우에도 어긋난 값이면 그냥 이번 달을 연다.
  // 달과 탭은 주소가 들고 있다. 분류 화면이나 자산 화면에 다녀와도 보던 달과 탭으로 돌아온다.
  const [params, setParams] = useSearchParams();
  const asked = params.get(REPORT_MONTH_QUERY);
  const tab = parseReportTab(params.get(REPORT_TAB_QUERY));
  const navigate = useNavigate();
  const toast = useToast();
  const categories = useCategories();
  const [periodOpen, setPeriodOpen] = useState(false);
  // 열어 달라는 부탁은 한 번만 쓴다. 주소를 계속 보고 열면, 달을 옮겨 본문을 다시 그릴 때마다
  // 사용자가 누르지도 않은 전체화면 결산이 다시 뜬다.
  const [openClosing, setOpenClosing] = useState(() => params.get('closing') === '1');
  const consumeClosing = useCallback(() => setOpenClosing(false), []);

  const books = useBooks();
  const { viewingBookId } = useBookView();
  // 홈의 결산 카드는 내 가계부 이야기다. 그 길로 왔으면 내 가계부로 연다.
  const [pickedBookId, setPickedBookId] = useState<string | null>(() =>
    params.get('closing') === '1' ? null : viewingBookId,
  );
  const bookItems = books.data?.items ?? [];
  const hasBooks = bookItems.length > 0;
  // 목록을 다시 읽었더니 빠진 가계부(지워졌거나 내보내졌거나)면 내 가계부로 돌아간다.
  const bookId =
    pickedBookId != null &&
    (books.data == null || bookItems.some((book) => book.id === pickedBookId))
      ? pickedBookId
      : null;
  // 내 리포트와 가계부는 시작일이 달라 같은 「10월」 도 다른 날들일 수 있다.
  // 가계부를 바꾸면 주소의 달을 버리고 그쪽의 이번 달로 연다. 주소는 아래 효과가 비우고,
  // 버린 달 표시는 사람이 달을 옮길 때 지운다.
  const [monthBookId, setMonthBookId] = useState(bookId);
  const [droppedMonth, setDroppedMonth] = useState<string | null>(null);
  if (monthBookId !== bookId) {
    setMonthBookId(bookId);
    setDroppedMonth(asked);
  }
  const pickedBook = bookItems.find((book) => book.id === bookId);
  const bookMonth =
    pickedBook == null ? toLedgerDate(new Date()).slice(0, 7) : bookPeriodNow(pickedBook).key;
  const baseMonth = bookId == null ? thisMonth : bookMonth;
  const picked =
    asked != null && asked !== droppedMonth && MONTH_PATTERN.test(asked) ? asked : null;
  // 고른 달이 없거나 이번 달보다 뒤면 이번 달을 본다. 시작일을 바꿔 이번 달이 당겨질 때도 같다.
  // 내 리포트는 시작일을 받기 전에는 주소의 달을 믿는다. 1 로 세어 자르면 다음 이름 달을 보던
  // 사람이 다시 열 때 한 달 앞이 잠깐 보인다.
  const trustAsked = bookId == null && !current.known;
  const month = picked != null && (trustAsked || picked <= baseMonth) ? picked : baseMonth;
  useEffect(() => {
    if (droppedMonth == null) return;
    setParams(
      (prev) => {
        const query = new URLSearchParams(prev);
        if (query.get(REPORT_MONTH_QUERY) === droppedMonth) query.delete(REPORT_MONTH_QUERY);
        return query;
      },
      { replace: true },
    );
  }, [droppedMonth, setParams]);
  // 달을 옮기면 부탁도 접는다. 로딩 중에는 결산 자리가 아직 없어서 부탁을 못 쓴 채로
  // 달만 바뀔 수 있는데, 그러면 엉뚱한 달의 결산이 저절로 열린다.
  const changeMonth = useCallback(
    (next: string) => {
      // 사람이 옮긴 것만 센다. 홈 결산 카드가 데려온 첫 달은 여기를 안 지난다.
      analytics.log(
        EVENTS.reportMonthChanged,
        {
          step: next < month ? 'back' : 'forward',
          to: next === baseMonth ? 'this' : 'past',
          months_back: monthsBetween(next, baseMonth),
        },
        { kind: 'click' },
      );
      setParams(
        (prev) => {
          const query = new URLSearchParams(prev);
          query.set(REPORT_MONTH_QUERY, next);
          return query;
        },
        { replace: true },
      );
      setDroppedMonth(null);
      setOpenClosing(false);
    },
    [analytics, month, baseMonth, setParams],
  );

  const changeTab = useCallback(
    (next: ReportTab) => {
      setParams(
        (prev) => {
          const query = new URLSearchParams(prev);
          if (next === 'income') query.set(REPORT_TAB_QUERY, next);
          else query.delete(REPORT_TAB_QUERY);
          return query;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const here = reportPath(month, tab);

  // ‹ 나 뒤로로 돌아왔을 때만 쓴다. 탭바로 들어오면(PUSH) 맨 위에서 연다.
  const navigationType = useNavigationType();
  useEffect(() => {
    const saved = readScroll();
    if (saved == null) return;
    if (navigationType === 'PUSH' || saved.at !== here) {
      forgetScroll();
      return;
    }
    // 돌아온 순간에는 본문이 아직 짧다. 그 자리까지 내려갈 만큼 길어지면 옮긴다.
    const until = performance.now() + RESTORE_WAIT_MS;
    let frame = 0;
    const step = () => {
      const room = document.documentElement.scrollHeight - window.innerHeight;
      if (room >= saved.y) {
        window.scrollTo(0, saved.y);
        forgetScroll();
      } else if (performance.now() < until) {
        frame = requestAnimationFrame(step);
      } else {
        forgetScroll();
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [here, navigationType]);

  function openAssets(): void {
    analytics.log(EVENTS.reportItemOpened, { what: 'assets', tab }, { kind: 'click' });
    rememberScroll(here);
    const state: BackState = { backTo: here };
    void navigate(ROUTES.assets, { state });
  }

  function openCategory(key: string, from: 'row' | 'donut'): void {
    analytics.log(EVENTS.reportItemOpened, { what: 'category', tab, from }, { kind: 'click' });
    rememberScroll(here);
    void navigate(reportCategoryPath(month, tab, key));
  }

  // 큰 지출 줄은 id 만 들고 있다. 그 기록을 한 번 받아 쥐고 시트를 연다.
  const fetchTransaction = useFetchTransaction();
  const [editing, setEditing] = useState<TransactionOut | null>(null);

  async function openLarge(id: string): Promise<void> {
    analytics.log(EVENTS.reportItemOpened, { what: 'large', tab }, { kind: 'click' });
    try {
      setEditing(await fetchTransaction(id));
    } catch {
      toast.show({ text: '기록을 불러오지 못했어요' });
    }
  }

  // 다 쓴 부탁은 주소에서도 지운다. 히스토리에는 남기지 않는다. 남기면 뒤로가기로
  // 그 주소에 되돌아왔을 때 또 열린다.
  useEffect(() => {
    if (!params.has('closing')) return;
    const next = new URLSearchParams(params);
    next.delete('closing');
    setParams(next, { replace: true });
  }, [params, setParams]);

  return (
    <div className="page">
      <div className="page__head">
        {/* 칩이 서면 글자 칸이 남은 폭을 다 쓴다. 안 그러면 칩이 제목 폭에 갇혀 이름이 잘린다. */}
        <div className={hasBooks ? 'page__head-text report__head-text' : 'page__head-text'}>
          <h1 className="page__title">리포트</h1>
          {/* 가계부가 있으면 리드 자리에 어느 가계부인지를 둔다. 둘 다 두면 머리가 길어진다. */}
          {hasBooks ? (
            <BookChip
              className="report__book-chip"
              value={bookId}
              books={bookItems}
              onChange={setPickedBookId}
            />
          ) : (
            // 달을 옮겨 다니는 화면이라 리드가 특정 달을 가리키면 지난달에서 거짓이 된다.
            <p className="page__lead">지출이 어디로 갔는지 봐요</p>
          )}
        </div>
        {/*
          같은 달을 날짜별로 보는 길. 리포트는 「어디에 썼나」 고 달력은 「언제 썼나」 라,
          한쪽을 보다 다른 쪽이 궁금해지는 자리가 여기다. **보던 달을 들고 간다.**
          이번 달로 떨어뜨리면 반년 전 리포트를 보던 사람이 화살표를 여섯 번 더 눌러야 한다.
          달력은 내 기록만 그려서 공유 가계부를 보는 동안에는 두지 않는다.
          이름 달을 넘긴다. 기간에서 날이 가장 많이 든 달력 월이라 그 달이 열린다. 다만 시작일이
          1 이 아니면 같은 날들이 아니라서, 이름에 「이 달」 을 쓰지 않는다.
        */}
        {bookId == null ? (
          <Link
            className="page__head-action pk-cal-btn"
            to={`${ROUTES.calendar}?month=${month}`}
            aria-label="달력으로 보기"
          >
            <CalendarGlyph />
          </Link>
        ) : null}
      </div>

      {/* 식별키를 못 받으면 조회가 시작조차 안 해 로딩이 끝나지 않는다. 이 안내가 이유를 말한다. */}
      <IdentityNotice />

      {bookId != null ? (
        <BookReport bookId={bookId} month={month} onMonthChange={changeMonth} />
      ) : (
        <MonthlyReport
          month={month}
          onMonthChange={changeMonth}
          mode={tab}
          onModeChange={changeTab}
          onOpenAssets={openAssets}
          onOpenCategory={openCategory}
          onOpenLarge={(id) => void openLarge(id)}
          autoOpenClosing={openClosing}
          onClosingAutoOpened={consumeClosing}
          adSlot={<AdSlot placement="report" />}
          bottomAdSlot={<AdSlot placement="report_bottom" />}
          onPeriodClick={() => setPeriodOpen(true)}
        />
      )}

      <MonthStartSheet open={periodOpen} onClose={() => setPeriodOpen(false)} where="report" />
      <EditSheet
        transaction={editing}
        categories={categories.data?.items ?? []}
        month={{ year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) }}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
