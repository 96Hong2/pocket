import { useEffect, useId, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { ROUTES } from '../../app/router/routes';

import { useBridge, useOverlayBackClose } from '../../app/providers';
import { bumpRecordCount } from '../../shared/lib/homeAddSeen';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  formatDayLabel,
  shiftMonth,
  toLedgerDate,
  toLedgerNoonIso,
} from '../../shared/lib/format';
import {
  ApiError,
  queryKeys,
  useCategories,
  useCreateTransaction,
  type CategoryOut,
  type FeedbackOut,
  type PaymentMethod,
  type PreferencesOut,
  type TransactionOut,
} from '../../shared/api';
import {
  CategoryPicker,
  KindToggle,
  categoriesOfKind,
  kindOf,
  type LedgerKind,
} from '../../shared/ledger';
import {
  BottomSheet,
  Button,
  CalendarGlyph,
  CategoryAvatar,
  ErrorState,
  LoadingState,
  SegmentedControl,
  iconOf,
  type SegmentedOption,
} from '../../shared/ui';

import { CategoryEditForm } from '../categories';
import { ImageImportTab, NaturalLanguageTab } from '../imports';

import { FeedbackPanel } from './FeedbackPanel';
import { toAmount } from './digits';
import { AmountDisplay, Keypad } from './Keypad';
import { readLastMethod, writeLastMethod } from './lastRecord';
import { DEFAULT_RECORD_TAB, recordMethodOf, type RecordTab } from './recordTab';

export type { RecordTab };

/**
 * 기록 시트를 어디서 열었나.
 *
 * 입구가 셋이라 어느 자리가 실제로 쓰이는지 모르면 덜어낼 곳도 못 고른다.
 * - `home`         홈 가운데 큰 버튼. 언제나 오늘에 적는다
 * - `home_day`     홈 목록의 빈 날 버튼
 * - `calendar_day` 월간 달력에서 고른 날
 */
export type RecordFrom = 'home' | 'home_day' | 'calendar_day';

const TABS: SegmentedOption<RecordTab>[] = [
  { value: 'keypad', label: '키패드' },
  { value: 'nl', label: '줄글' },
  { value: 'capture', label: '캡처' },
  { value: 'receipt', label: '영수증' },
];

interface SavedState {
  transaction: TransactionOut;
  feedback: FeedbackOut;
}

/** 얼마나 옛날까지 고를 수 있나. 달력 화면과 같게 3년이다. */
const MONTHS_BACK = 36;

function oldestDay(): string {
  return `${shiftMonth(toLedgerDate(new Date()).slice(0, 7), -MONTHS_BACK)}-01`;
}

/**
 * 기록 시트.
 *
 * 저장해도 시트를 닫지 않고 안쪽 내용만 입력 → 피드백으로 바꾼다.
 * 시트를 두 개 겹치면 포커스가 어디로 돌아갈지 흔들리고, 화면에 dialog 가 둘이 된다.
 */
export function QuickRecordSheet({
  open,
  initialTab,
  day,
  from = 'home',
  onClose,
  onRecorded,
}: {
  open: boolean;
  /** 열 때 켜 둘 탭. 안 주면 키패드로 연다. */
  initialTab?: RecordTab;
  /**
   * 처음에 고를 날. 안 주면 오늘이다.
   *
   * 「어제 기록하기」 처럼 **버튼에 날 이름이 붙은 자리**에서 넘어온다. 시트 안에서도
   * 바꿀 수 있으므로 이것은 시작값일 뿐이다.
   */
  day?: string;
  /** 어느 자리에서 열었나. 로그에만 쓴다. */
  from?: RecordFrom;
  onClose: () => void;
  /**
   * 어느 날에 적혔는지. 저장이 실제로 끝난 뒤에 부른다.
   *
   * 부르는 쪽(홈)이 그 날로 옮겨 가라고 있는 값이다. 지난 달 영수증을 읽어 넣었는데
   * 화면이 오늘에 머물러 「오늘은 안 썼어요」 라고 적혀 있으면, 들어갔는지 아닌지를
   * 그 날짜를 찾아가 봐야 안다.
   */
  onRecorded?: (day: string) => void;
}) {
  // 저장 응답을 기다리는 동안에는 닫히지 않는다.
  // 닫히면 컴포넌트가 사라져 응답이 갈 곳이 없어지고, 저장 결과 화면이 영구히 사라진다.
  // 저장 자체는 서버에 남으므로 사용자는 되돌릴 방법 없이 기록만 남게 된다.
  const [saving, setSaving] = useState(false);
  /*
    지금 닫으면 잃을 건수와, 보고 있는 탭이 검토 중인가.

    읽어 온 것을 눈앞에 두고 손잡이를 잘못 눌러 통째로 날아가는 일이 실제로 있었다.
    한두 번만 겪어도 이 앱을 안 쓰게 되는 자리라, **닫기를 한 번 되묻는다.**
  */
  const [pending, setPending] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [asking, setAsking] = useState(false);
  /*
    나가고 나서 어디로 갈까.

    닫기만 하는 길과 카테고리 관리로 옮겨 가는 길이 **같은 확인 창을 쓴다.** 읽어 온 것을
    잃는다는 점에서 둘은 같은 일이라, 한쪽만 묻고 다른 쪽은 그냥 보내면 그 창이 무의미해진다.
  */
  const [leaveTo, setLeaveTo] = useState<'close' | 'manage'>('close');
  const analytics = useAnalytics();
  const navigate = useNavigate();

  function leave(where: 'close' | 'manage'): void {
    onClose();
    if (where === 'manage') void navigate(ROUTES.categories);
  }

  /** 나가려는 모든 길이 여기를 지난다. 손잡이·딤·Esc·시스템 뒤로가기·관리로 가기가 같은 규칙을 탄다. */
  function requestLeave(where: 'close' | 'manage'): void {
    if (pending > 0) {
      analytics.log(EVENTS.recordLeaveAsked, { result: 'asked', pending }, { kind: 'impression' });
      setLeaveTo(where);
      setAsking(true);
      return;
    }
    leave(where);
  }

  function requestClose(): void {
    requestLeave('close');
  }

  function answer(result: 'stayed' | 'left'): void {
    analytics.log(EVENTS.recordLeaveAsked, { result, pending }, { kind: 'click' });
    setAsking(false);
    if (result === 'left') leave(leaveTo);
  }

  useOverlayBackClose(open, requestClose, saving);

  return (
    <BottomSheet
      open={open}
      onClose={requestClose}
      dismissible={!saving}
      // 검토 화면은 고칠 칸이 많다. 내용만큼 열면 저장 버튼이 접힌 아래로 밀린다.
      size={reviewing ? 'tall' : 'auto'}
      ariaLabel="10초 기록"
    >
      <RecordBody
        initialTab={initialTab}
        day={day}
        from={from}
        onDone={onClose}
        onRecorded={onRecorded}
        onManage={() => requestLeave('manage')}
        onSavingChange={setSaving}
        onPendingChange={setPending}
        onReviewingChange={setReviewing}
      />
      {asking ? (
        <LeaveConfirm
          pending={pending}
          onStay={() => answer('stayed')}
          onLeave={() => answer('left')}
        />
      ) : null}
    </BottomSheet>
  );
}

/**
 * 읽어 온 것을 두고 나가려 할 때 한 번 묻는다.
 *
 * 시트를 하나 더 띄우지 않고 이 시트 위에 겹친다. 시트가 둘이면 닫을 때 어디로 돌아가는지
 * 흔들리고, 화면에 dialog 가 둘이 된다.
 *
 * **머무는 쪽이 기본이다.** 실수로 누른 사람이 한 번 더 실수해도 잃지 않게, 남는 버튼을
 * 크고 오른쪽에 둔다.
 */
function LeaveConfirm({
  pending,
  onStay,
  onLeave,
}: {
  pending: number;
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="record-leave" role="alertdialog" aria-label="그만둘까요">
      <div className="record-leave__box">
        <p className="record-leave__text">읽어 온 {pending}건이 사라져요. 그만둘까요?</p>
        <div className="record-leave__actions">
          <Button variant="outline" onClick={onLeave}>
            그만두기
          </Button>
          <Button className="record-leave__stay" onClick={onStay}>
            계속 고치기
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * 시트가 열릴 때 새로 마운트된다. 그래서 지난번 금액도, 지난번 탭도 남아 있지 않다.
 * 닫히면 BottomSheet 가 null 을 돌려 이 몸통이 통째로 사라진다.
 */
function RecordBody({
  initialTab,
  day,
  from,
  onDone,
  onRecorded,
  onManage,
  onSavingChange,
  onPendingChange,
  onReviewingChange,
}: {
  initialTab?: RecordTab;
  /** 처음에 고를 날. 안 주면 오늘. */
  day?: string;
  from: RecordFrom;
  onDone: () => void;
  /** 저장이 끝난 날. 부르는 쪽이 그 날로 옮겨 간다. 오늘을 넘지 않는다. */
  onRecorded?: (day: string) => void;
  /** 카테고리 관리로 가겠다고 했을 때. 잃을 것이 있으면 바깥이 먼저 묻는다. */
  onManage: () => void;
  onSavingChange: (saving: boolean) => void;
  /** 어느 탭에서든 읽어 두고 아직 저장 안 한 건수의 합. */
  onPendingChange: (pending: number) => void;
  /** 지금 보고 있는 탭이 검토 중인가. 시트 크기가 이 값을 따라간다. */
  onReviewingChange: (reviewing: boolean) => void;
}) {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const queryClient = useQueryClient();
  const categories = useCategories();
  const create = useCreateTransaction();
  const dayId = useId();

  const today = toLedgerDate(new Date());
  /** 이름에 날이 붙은 버튼(「어제 기록하기」·달력의 그 날)으로 열었나. 처음 켜 둘 탭만 정한다. */
  const openedOnPastDay = day != null && day !== today;

  /*
    지금 적기로 한 날.

    **시트 안에서 바꿀 수 있다.** 예전에는 지난 날에 적으려면 홈이나 달력에서 그 날을
    먼저 찾아간 다음 기록하기를 눌러야 했다. 영수증을 몰아서 적는 사람에게는 그 왕복이
    적는 일보다 길었다.
  */
  const [recordDay, setRecordDay] = useState(day ?? today);
  const isBackfill = recordDay !== today;
  /** 알약에 적는 글자. 오늘이든 아니든 **날짜를 그대로 적는다.** */
  const dayChipLabel = formatDayLabel(recordDay);

  /*
    이 시트가 사는 동안이 기록 흐름 하나다.

    시트는 열 때 새로 마운트되고 닫으면 통째로 사라지므로, 여기서 만든 값 하나가
    기록 시작부터 저장까지의 모든 로그를 잇는다. 탭을 옮겨도 같은 흐름이다.
    캡처로 시작해 키패드로 끝낸 사람을 두 흐름으로 세면 방식별 완료율이 거짓이 된다.
  */
  const [flowId] = useState(() => analytics.startFlow());

  /*
    지난 날에 적는 중이면 **키패드로만 적는다.**

    고른 날은 키패드에만 붙는다. 줄글·캡처·영수증은 읽은 내용에서 날짜가 나오기 때문이다.
    시트가 마지막에 쓴 방식으로 열려서, 줄글을 마지막에 썼으면 「9월 5일 기록하기」 를
    눌러도 줄글 탭이 열리고 고른 날이 말없이 버려졌다. 사용자가 신고한 그 버그다.

    **없애지 않고 잠근다.** 규칙을 하나로 둔다: 지난 날이면 잠기고 오늘로 되돌리면 풀린다.
    없애 버리면 들어온 길에 따라 같은 상태가 「자리 없음」 과 「잠김」 으로 갈리고,
    줄글에 적어 두던 것도 통째로 사라져 날짜를 되돌려도 안 돌아온다.
  */
  const [tab, setTab] = useState<RecordTab>(
    openedOnPastDay ? 'keypad' : (initialTab ?? DEFAULT_RECORD_TAB),
  );
  // 지출인가 수입인가. 이 값이 고를 수 있는 분류와 저장할 종류를 함께 정한다.
  const [kind, setKind] = useState<LedgerKind>('expense');
  // 무언가 도는 중에는 탭을 옮기지 못한다. 옮기면 응답이 돌아올 자리가 사라진다.
  const [busy, setBusy] = useState(false);
  const [digits, setDigits] = useState('');
  const [saved, setSaved] = useState<SavedState | null>(null);
  /*
    무엇으로 냈나. 지출에만 붙는다.

    **여기서는 묻지 않는다.** 적는 화면에 칸이 하나 더 서면 10초 약속이 깨진다.
    지난번에 쓴 것으로 조용히 채워 저장하고, 저장 뒤 화면에서 무엇으로 적혔는지 보여 준다.
    거기서 바꾸거나 지울 수 있다. 대부분 한 장의 카드를 쓰므로 이 기본값이 거의 맞고,
    매번 고르게 하면 아무도 안 골라 통계가 통째로 빈다.
  */
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  // 금액보다 먼저 고른 카테고리. 화면에서 카테고리가 위에 있어 손이 먼저 그리로 간다.
  const [pickedId, setPickedId] = useState<string | null>(null);
  // 고르고 나면 목록을 접는다. 분류가 늘수록 목록이 화면을 다 먹는다.
  const [listOpen, setListOpen] = useState(true);
  /*
    탭마다 읽어 두고 아직 저장 안 한 건수.

    탭 넷은 감춰진 채 함께 살아 있어, 캡처에서 읽어 두고 줄글 탭으로 옮겨도 그 결과는
    그대로 있다. 닫으면 다 날아가므로 **합으로** 세고, 시트를 크게 열지는 지금 보이는
    탭만 보고 정한다.
  */
  const [reviewCounts, setReviewCounts] = useState<Partial<Record<RecordTab, number>>>({});
  const pending = Object.values(reviewCounts).reduce((sum, count) => sum + (count ?? 0), 0);
  const reviewing = (reviewCounts[tab] ?? 0) > 0;

  useEffect(() => {
    onPendingChange(pending);
  }, [onPendingChange, pending]);

  useEffect(() => {
    onReviewingChange(reviewing);
  }, [onReviewingChange, reviewing]);

  /**
   * 적힌 날을 부르는 쪽에 알린다.
   *
   * **오늘을 넘지 않는다.** 읽어 온 것에 앞날이 섞여 있을 수 있는데(화면이 확인만 시키고
   * 막지는 않는다), 그 날로 옮겨 가면 목록이 아직 오지 않은 날에 서고 거기서 더 앞으로
   * 걸어갈 수 있다.
   */
  function tellRecorded(savedDay: string): void {
    onRecorded?.(savedDay > today ? today : savedDay);
  }

  /** 그 탭이 지금 몇 건을 들고 있는지 적어 둔다. 같은 값이면 그대로 두어 다시 그리지 않는다. */
  function trackReview(key: RecordTab) {
    return (count: number) =>
      setReviewCounts((prev) => (prev[key] === count ? prev : { ...prev, [key]: count }));
  }

  useEffect(() => {
    let alive = true;
    void readLastMethod(bridge.storage).then((last) => {
      if (alive) setMethod(last);
    });
    return () => {
      alive = false;
    };
  }, [bridge]);

  /*
    어느 방식으로, **어느 자리에서** 시작했나.

    마지막에 쓴 방식으로 열리므로 시작 방식과 끝낸 방식이 다를 수 있다.
    자리를 안 남기면 달력에서 적는 길을 새로 냈는데 쓰는 사람이 있는지조차 모른다.
    지난 날에 적는 것인지(`backfill`)도 함께 남긴다. 그 길에서만 나는 실수가 있다.
  */
  useEffect(() => {
    analytics.log(
      EVENTS.recordStarted,
      {
        method: recordMethodOf(openedOnPastDay ? 'keypad' : (initialTab ?? DEFAULT_RECORD_TAB)),
        from,
        backfill: openedOnPastDay,
      },
      { flowId },
    );
    // 시트가 사는 동안 한 번이다. 탭을 옮겼다고 다시 시작한 것이 아니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
    분류 만들기 자리가 열렸나.

    **시트를 하나 더 띄우지 않는다.** 적던 금액이 살아 있어야 만들고 나서 그대로 이어
    적을 수 있다. 시트가 둘이면 닫을 때 어디로 돌아가는지도 흔들린다.
  */
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);

  const allCategories = categories.data?.items ?? [];
  // 고른 종류의 분류만 보여준다. 섞어 두면 수입에 '식비' 가 붙어, 목록과 리포트가 다른 말을 한다.
  const pickable = categoriesOfKind(kind, allCategories);

  /** 껍데기(닫기 막기)와 탭 잠금에 같은 신호를 쓴다. */
  function markBusy(next: boolean): void {
    setBusy(next);
    onSavingChange(next);
  }

  /**
   * 방금 쓴 방식을 설정 캐시에 심는다.
   *
   * 서버는 저장할 때 이 방식을 기억해 뒀다. 설정은 오래 들고 있어서 여기서 캐시를 맞춰 두지
   * 않으면, 시트를 다시 열 때 앱을 켤 당시의 옛 값으로 열린다. 다시 불러오는 대신 값을
   * 직접 넣는 이유는, 응답을 기다리는 사이에 시트가 다시 열리면 여전히 지난 탭이기 때문이다.
   *
   * 부르는 자리는 닫기가 아니라 저장 성공이다. 닫기에만 두면 피드백에서 확인을 안 누르고
   * X·딤·Esc·뒤로가기로 닫았을 때 서버 값과 캐시가 어긋나 다음에 옛 탭으로 열린다.
   *
   * 그 기록을 지운 뒤에도 남긴다. 지우는 것은 거래지 방금 무엇으로 적었나가 아니다.
   */
  function rememberMethod(): void {
    queryClient.setQueryData<PreferencesOut>(queryKeys.preferences(), (prev) =>
      prev == null ? prev : { ...prev, last_record_method: recordMethodOf(tab) },
    );
  }

  /**
   * 한 번 적었다고 기기에 센다.
   *
   * 「홈 화면에 추가」 안내를 몇 번 써 본 뒤 한 번 더 띄우는 데만 쓴다. 저장이 실제로
   * 끝난 자리에서만 부른다. 탭만 옮기고 닫는 길(`finish`)에서는 세지 않는다.
   */
  function markRecorded(): void {
    void bumpRecordCount(bridge.storage);
  }

  /**
   * 시트를 닫는다.
   *
   * 방식은 저장 성공 때 이미 심었지만 여기서도 부른다. 아무것도 저장하지 않고 탭만 옮긴 뒤
   * 확인으로 닫는 길이 남아 있다. 두 번 불려도 같은 값이라 문제없다.
   *
   * **다른 탭에 읽어 둔 것이 남아 있으면 닫지 않는다.** 캡처로 여섯 건을 읽어 두고 한 건만
   * 따로 적은 사람이, 저장 뒤 「확인」 을 누르면 그 여섯이 말없이 사라졌다. 손잡이로 닫을
   * 때는 한 번 묻는데 이 길만 안 물었다. 대신 그 건들이 있는 자리로 돌려보낸다.
   * 아무 일도 안 일어난 것처럼 보이면 안 되므로 탭까지 옮겨 준다.
   *
   * **보고 있는 탭은 세지 않는다.** 그 탭에서 저장하거나 취소해 여기까지 온 것이라,
   * 자기 줄을 세면 취소를 눌러도 시트가 안 닫힌다(실제로 그렇게 막혔다).
   */
  function finish(): void {
    rememberMethod();
    const waiting = TABS.map((option) => option.value).find(
      (key) => key !== tab && (reviewCounts[key] ?? 0) > 0,
    );
    if (waiting != null) {
      setSaved(null);
      setTab(waiting);
      return;
    }
    onDone();
  }

  function save(category: CategoryOut, amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;

    markBusy(true);
    analytics.log(EVENTS.saveRequested, { method: 'keypad', count: 1 }, { flowId, kind: 'click' });
    const startedAt = Date.now();
    create.mutate(
      {
        /*
          「어제 기록하기」 로 열었으면 그 날 정오에 적는다. 오늘이면 지금 시각 그대로 둔다.
          정오로 두는 것은 시간대가 달라져도 날이 안 넘어가게 하려는 것이다(달력 수정과 같은 규칙).
        */
        occurred_at: isBackfill ? toLedgerNoonIso(recordDay) : new Date().toISOString(),
        amount,
        type: kind,
        category_id: category.id,
        source: 'keypad',
        // 손으로 직접 누른 값이라 분류를 의심할 이유가 없다.
        confidence: 1,
        excluded_from_budget: false,
        // 수입에는 뜻이 없다. 보내도 서버가 버리지만 여기서도 안 보낸다.
        payment_method: kind === 'expense' ? method : null,
      },
      {
        onSettled: () => markBusy(false),
        onError: (error) => {
          analytics.log(
            EVENTS.saveResult,
            {
              method: 'keypad',
              result: 'failed',
              elapsed_ms: Date.now() - startedAt,
              error_code: error instanceof ApiError ? error.code : 'unknown',
            },
            { flowId },
          );
        },
        onSuccess: (created) => {
          // 서버가 거래를 돌려준 뒤에만 성공이다. 버튼을 누른 것은 성공이 아니다.
          analytics.log(
            EVENTS.saveResult,
            {
              method: 'keypad',
              result: 'ok',
              created_count: 1,
              elapsed_ms: Date.now() - startedAt,
              // 오늘이 아닌 날에 적었나. `record_started` 의 `backfill`(열 때 지난 날이었나)과
              // 뜻이 달라 이름을 가른다. 둘을 견주면 「날짜」 칸이 실제로 쓰이는지 갈린다.
              day_moved: isBackfill,
            },
            { flowId },
          );
          rememberMethod();
          markRecorded();
          tellRecorded(toLedgerDate(new Date(created.transaction.occurred_at)));
          setSaved({ transaction: created.transaction, feedback: created.feedback });
        },
      },
    );
  }

  /**
   * 키패드로 한 건을 저장해 확인 화면이 떠 있나.
   *
   * **이 자리에서 다른 탭을 언마운트하지 않는다.** 예전에는 저장되자마자 확인 화면만
   * 돌려주고 나머지를 트리에서 뺐다. 그러면 사진으로 읽어 둔 검토 목록이 말없이 사라지고,
   * 그것을 세던 값까지 0 으로 덮여 「아직 검토할 것이 있다」 는 판단도 같이 죽었다.
   */
  const done = saved != null;

  const amount = toAmount(digits);
  const saveError = create.error instanceof ApiError ? create.error : null;

  const picked = pickable.find((category) => category.id === pickedId) ?? null;

  /**
   * 카테고리를 눌렀을 때.
   *
   * 금액이 이미 있으면 누르는 것이 곧 저장이다(가장 짧은 길이라 그대로 둔다).
   * 금액이 아직 없으면 고르기만 하고 목록을 접는다. 금액을 다 누른 뒤 저장을 누른다.
   */
  function pickCategory(category: CategoryOut): void {
    if (amount > 0) {
      save(category, amount);
      return;
    }
    setPickedId(category.id);
    setListOpen(false);
  }

  // 저장 버튼은 카테고리를 골라 목록을 접었을 때만 나온다. 목록을 다시 펴면 칩을 누르는
  // 것이 곧 저장이라 버튼이 없다. 힌트가 같은 값을 봐야 없는 버튼을 가리키지 않는다.
  const saveTarget = listOpen ? null : picked;

  let hint = '금액을 누르고 카테고리를 고르면 바로 저장돼요';
  if (create.isPending) hint = '저장하는 중이에요';
  else if (saveTarget != null && amount > 0) hint = '저장을 누르면 기록돼요';
  else if (amount > 0) hint = '카테고리를 고르면 저장돼요';
  else if (picked) hint = '금액을 누르면 저장할 수 있어요';

  return (
    <div className="record">
      {done ? null : (
        <>
          <SegmentedControl
            className="record__tabs"
            options={TABS.map((option) =>
              option.value === tab
                ? option
                : { ...option, disabled: option.disabled || busy || isBackfill },
            )}
            value={tab}
            onChange={(next) => {
              analytics.log(
                EVENTS.inputMethodChanged,
                { from: recordMethodOf(tab), to: recordMethodOf(next) },
                { flowId, kind: 'click' },
              );
              setTab(next);
            }}
            ariaLabel="기록 방법"
          />
          {/*
            잠긴 이유는 **잠긴 것 바로 아래**에 적는다. 멀리 두면 눌리지 않는 자리를
            말없이 둔 것과 같다. 눌러도 초점이 안 가는 자리라 읽는 프로그램에는 이 줄이
            유일한 통로다. 잠기는 순간 한 번 읽히게 알린다.
          */}
          {isBackfill ? (
            <p className="record__hint" role="status">
              오늘이 아닌 날은 키패드로만 적어요
            </p>
          ) : null}
        </>
      )}

      {/*
        감추기만 하고 남겨 둔다. 언마운트하면 적어 둔 줄글과 검토 목록이 사라진다.
        지난 날에 적는 중이라 알약이 잠겨 있어도 마찬가지다. 날짜를 오늘로 되돌리면
        적어 두던 것이 그대로 있어야 한다.
      */}
      <>
        <div className="record__panel" hidden={done || tab !== 'nl'}>
          <NaturalLanguageTab
            flowId={flowId}
            onBusyChange={markBusy}
            onReviewChange={trackReview('nl')}
            onDone={finish}
            onSaved={(savedDay) => {
              rememberMethod();
              markRecorded();
              if (savedDay != null) tellRecorded(savedDay);
            }}
          />
        </div>

        <div className="record__panel" hidden={done || tab !== 'capture'}>
          <ImageImportTab
            kind="capture"
            flowId={flowId}
            onBusyChange={markBusy}
            onReviewChange={trackReview('capture')}
            onDone={finish}
            onSaved={(savedDay) => {
              rememberMethod();
              markRecorded();
              if (savedDay != null) tellRecorded(savedDay);
            }}
          />
        </div>

        <div className="record__panel" hidden={done || tab !== 'receipt'}>
          <ImageImportTab
            kind="receipt"
            flowId={flowId}
            onBusyChange={markBusy}
            onReviewChange={trackReview('receipt')}
            onDone={finish}
            onSaved={(savedDay) => {
              rememberMethod();
              markRecorded();
              if (savedDay != null) tellRecorded(savedDay);
            }}
            // 사진으로 안 되면 손으로 찍는 길이 바로 옆에 있어야 한다. 여기서 막히면 기록을 포기한다.
            fallbackAction={
              <Button variant="ghost" onClick={() => setTab('keypad')}>
                키패드로 입력
              </Button>
            }
          />
        </div>
      </>

      {/*
        저장 뒤 확인 화면. 다른 탭과 나란히 서서, 여기 떠 있는 동안에도 그쪽이 들고 있는
        것을 잃지 않는다. 「확인」 을 누르면 finish() 가 남은 검토 목록으로 데려간다.
      */}
      {saved != null ? (
        <div className="record__panel">
          <FeedbackPanel
            flowId={flowId}
            transaction={saved.transaction}
            feedback={saved.feedback}
            categories={categoriesOfKind(kindOf(saved.transaction.type), allCategories)}
            onUpdated={(updated) => {
              setSaved({ transaction: updated.transaction, feedback: updated.feedback });
            }}
            // 여기서 고른 것이 다음 기록에 조용히 채워질 값이다.
            onMethodPicked={(next) => void writeLastMethod(bridge.storage, next)}
            onConfirm={finish}
          />
        </div>
      ) : null}

      {/*
        키패드는 저장이 끝나면 접는다. 다른 탭과 달리 잃을 것이 없고(적은 숫자는 이미
        저장됐다), 남겨 두면 확인 화면이 여는 금액 칸과 testid 가 겹친다.
      */}
      {done ? null : (
        <div className="record__panel" hidden={tab !== 'keypad'}>
          {/*
            **한 줄에 둘이 선다.** 왼쪽은 무엇을 적을지(지출·수입), 오른쪽은 언제 적을지다.
            둘 다 금액보다 먼저 정하는 값이라 같은 층에 두고, 서로 다른 일이라 **모양을
            가른다.** 왼쪽은 테두리 있는 알약 둘, 오른쪽은 테두리 없는 조용한 버튼 하나다.
            같은 모양으로 나란히 두면 세 칸짜리 한 묶음으로 읽혀, 날짜가 종류의 하나처럼 보인다.
          */}
          <div className="record__top">
            {/*
              금액보다 먼저 정해야 하는 값이다. 아래 분류 칩과 저장할 종류가 이 하나를 따라간다.
              바꾸면 골라 둔 분류를 버리고 목록을 다시 편다. 지출 분류가 수입에 남으면 안 된다.
            */}
            <KindToggle
              className="record__kind"
              value={kind}
              disabled={create.isPending}
              ariaLabel="지출인지 수입인지"
              onChange={(next) => {
                if (next === kind) return;
                setKind(next);
                setPickedId(null);
                setListOpen(true);
              }}
            />

            {/*
              **어느 날에 적을지를 여기서 정한다.** 지난 날 것을 적으려고 홈이나 달력에서
              그 날을 먼저 찾아가는 왕복이 적는 일보다 길었다. 오늘이 기본이고, 아직 오지
              않은 날에는 적을 것이 없어 오늘까지만 고를 수 있다.

              **날짜를 그대로 적는다**(「9월 20일」). 「오늘」 이라고만 적으면 그게 며칠인지
              모르는 채로 저장하게 되고, 지난 날에서 돌아왔을 때 제대로 돌아왔는지도 안 보인다.

              글자는 우리가 쓰고, 실제로 누르는 것은 그 위에 투명하게 겹쳐 둔 날짜 칸이다.
              기기가 그리는 달력을 그대로 쓰면서 칸의 숫자 형식(`09/20/2026`)은 안 보이게
              하는 유일한 방법이다.
            */}
            <span className="record__day-pick" data-past={isBackfill ? '' : undefined}>
              {/*
                칸이 글자보다 앞에 온다. 눈에 보이는 것은 글자이지만, 초점이 가거나 잠겼다는
                것을 거기에 옮겨 그리려면 CSS 가 칸 뒤의 형제를 짚을 수 있어야 한다.
                자리는 겹쳐 두므로 순서가 배치를 바꾸지는 않는다.
              */}
              <input
                id={dayId}
                className="record__day-input"
                type="date"
                aria-label="날짜"
                value={recordDay}
                min={oldestDay()}
                max={today}
                disabled={create.isPending}
                // 달력을 열었다 비운 채로 닫는 기기가 있다. 비면 오늘로 되돌린다.
                onChange={(event) =>
                  setRecordDay(event.target.value === '' ? today : event.target.value)
                }
              />
              <span className="record__day-chip" aria-hidden="true">
                <CalendarGlyph />
                {dayChipLabel}
                <ChevronGlyph />
              </span>
            </span>
          </div>

          <AmountDisplay digits={digits} hint={hint} />

          {saveError ? (
            <p className="record__notice" role="alert">
              {saveError.message}
            </p>
          ) : null}

          {categories.isPending ? <LoadingState size="inline" /> : null}
          {categories.isError ? (
            <ErrorState
              size="inline"
              title="카테고리를 불러오지 못했어요"
              onRetry={() => void categories.refetch()}
            />
          ) : null}

          {creating ? (
            <div className="record__new-cat">
              <div className="record__new-cat-head">
                <span className="record__new-cat-title">새 분류 만들기</span>
                <button
                  type="button"
                  className="record__new-cat-back"
                  disabled={creatingBusy}
                  onClick={() => setCreating(false)}
                >
                  기록으로 돌아가기
                </button>
              </div>
              <CategoryEditForm
                // 종류는 위에서 이미 골랐다. 여기서 다시 묻지 않는다.
                fixedKind={kind}
                onBusyChange={setCreatingBusy}
                onClose={() => setCreating(false)}
                // 만들자마자 고른 것으로 둔다. 다시 찾아 누르게 하면 만든 보람이 없다.
                onCreated={(created) => pickCategory(created)}
              />
            </div>
          ) : listOpen || picked == null ? (
            <CategoryPicker
              categories={pickable}
              disabled={create.isPending}
              onPick={pickCategory}
              onManage={onManage}
              selectedId={pickedId}
              onCreate={() => setCreating(true)}
              onExpand={() =>
                analytics.log(
                  EVENTS.categoryMoreOpened,
                  { where: 'record', shown: pickable.length },
                  { flowId, kind: 'click' },
                )
              }
            />
          ) : (
            <button
              type="button"
              className="record__picked"
              disabled={create.isPending}
              onClick={() => setListOpen(true)}
            >
              <CategoryAvatar {...iconOf(picked)} size={40} />
              <span className="record__picked-name">{picked.name}</span>
              <span className="record__picked-more">다시 고르기</span>
            </button>
          )}

          {saveTarget != null ? (
            <Button
              className="record__save"
              disabled={amount <= 0 || create.isPending}
              onClick={() => save(saveTarget, amount)}
            >
              저장
            </Button>
          ) : null}

          <Keypad digits={digits} onChange={setDigits} />
        </div>
      )}
    </div>
  );
}

/** 날짜 옆의 작은 꺾쇠. 테두리가 없는 자리라 이것이 「눌러서 바꾼다」 는 유일한 표시다. */
function ChevronGlyph() {
  return (
    <svg
      className="record__day-caret"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2 4l3 3 3-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
