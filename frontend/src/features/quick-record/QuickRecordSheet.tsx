import { useEffect, useRef, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';

import { ROUTES } from '../../app/router/routes';

import { useBridge, useOverlayBackClose } from '../../app/providers';
import { writeBookLast } from '../../shared/lib/bookLast';
import { bumpRecordCount } from '../../shared/lib/homeAddSeen';
import {
  EVENTS,
  useAnalytics,
  type AssetSideLog,
  type EventParamMap,
  type FlowId,
  type SetupChanged,
} from '../../shared/analytics';
import {
  formatCurrency,
  formatNumber,
  isFutureDay,
  shiftMonth,
  toLedgerDate,
  toLedgerNoonIso,
} from '../../shared/lib/format';
import {
  ApiError,
  queryKeys,
  useBook,
  useBooks,
  useCategories,
  useCreateBookEntry,
  useCreateTransaction,
  useTags,
  type AssetItemOut,
  type BookEntryOut,
  type BookMonthStateOut,
  type BookOut,
  type CategoryOut,
  type FeedbackOut,
  type PaymentMethod,
  type PreferencesOut,
  type TagOut,
  type TransactionOut,
} from '../../shared/api';
import {
  CategoryPicker,
  FutureDayConfirm,
  categoriesOfKind,
  kindOf,
  type LedgerKind,
} from '../../shared/ledger';
import {
  BottomSheet,
  Button,
  CategoryAvatar,
  ErrorState,
  LeaveConfirm,
  LoadingState,
  SheetHeader,
  iconOf,
  type SheetCloseReason,
} from '../../shared/ui';

import {
  AssetDestField,
  AssetDestList,
  NewAssetForm,
  defaultRemaining,
  destBodyOf,
  destFromItem,
  destGroupOf,
  destHoldingOf,
  destKindOf,
  destNameOf,
  quantityValue,
  sellPreviewOf,
  type AssetDest,
  type AssetDestFrom,
  type AssetDestPick,
} from '../asset-dest';
import { unitOf } from '../assets';
import { BookDestinationRow, BookFeedbackPanel, asPickable } from '../books';
import { CategoryEditForm } from '../categories';
import {
  ImageImportTab,
  NaturalLanguageTab,
  PhotoCreditLine,
  usePhotoCredits,
  type ImageImportHandle,
  type ImportSaveTimes,
} from '../imports';

import { FeedbackPanel } from './FeedbackPanel';
import { toAmount } from './digits';
import { AmountDisplay, Keypad } from './Keypad';
import { readLastMethod, writeLastMethod } from './lastRecord';
import { RecordDayStep } from './RecordDayStep';
import { dayWithWeekday, nearDayWord, tagStyle } from './recordLabels';
import { RecordSetup, type RecordKind } from './RecordSetup';
import { RecordTagStep } from './RecordTagStep';
import { AssetDestSource, SaveBoxRow, SaveLotRow, SellPreviewCard } from './SaveFields';
import { SavedAssetPanel, type SavedAssetInfo } from './SavedAssetPanel';
import { quantityShapeOf, sameQuantity } from './saveInvest';
import { DEFAULT_RECORD_TAB, recordMethodOf, type RecordTab } from './recordTab';

export type { RecordTab };

/**
 * 기록 시트를 어디서 열었나.
 *
 * 입구가 셋이라 어느 자리가 실제로 쓰이는지 모르면 덜어낼 곳도 못 고른다.
 * - `home`         홈 가운데 큰 버튼
 * - `home_day`     홈 목록의 빈 날 버튼
 * - `calendar_day` 월간 달력에서 고른 날
 * - `deeplink`     바깥에서 `/record` 로 곧장 들어왔다. 미니앱 상세의 주요 기능 「지출 기록하기」 가 여기로 온다
 * - `asset_item`   자산 화면 항목 시트의 「팔았어요」
 */
export type RecordFrom = 'home' | 'home_day' | 'calendar_day' | 'deeplink' | 'asset_item';

/**
 * 시트 안 단계. 늘 첫 화면(`setup`)으로 연다.
 * 날짜(`day`)는 첫 화면에서, 태그(`tag`)와 「다른 곳」(`dest`)은 금액 화면(`amount`)에서 들어간다.
 * 새 종목이나 통장(`item`)은 「다른 곳」 에서 들어간다.
 */
type RecordStep = 'setup' | 'amount' | 'nl' | 'photo' | 'day' | 'tag' | 'dest' | 'item';

/** 저장 없이 닫힐 때 로그에 싣는 단계. 안쪽 단계는 그 단계를 연 화면으로 센다. */
function closedStepOf(step: RecordStep): 'setup' | 'amount' | 'nl' | 'photo' {
  if (step === 'day') return 'setup';
  if (step === 'tag' || step === 'dest' || step === 'item') return 'amount';
  return step;
}

/** 읽어 온 것을 들고 있을 수 있는 탭. */
type PanelTab = Exclude<RecordTab, 'keypad'>;
const PANEL_TABS: PanelTab[] = ['nl', 'capture', 'receipt'];

/** 저장 없이 닫힌 길. 시트가 알려 주는 넷과 뒤로가기, 카테고리 관리로 나간 것. */
type CloseHow = SheetCloseReason | 'back' | 'manage';

const AMOUNT_TITLES: Record<RecordKind, string> = {
  expense: '얼마 썼어요?',
  income: '얼마 벌었어요?',
  transfer: '얼마 옮겼어요?',
  save: '얼마를 어디에 넣었어요?',
};

interface SavedState {
  transaction: TransactionOut;
  feedback: FeedbackOut;
  /** 저축·투자로 저장했으면 그 항목. 저장 뒤 화면이 이것으로 말한다. */
  asset?: SavedAssetInfo | null;
}

/** 공유 가계부에 적은 한 건. 저장 뒤 화면이 그 가계부 이름과 그 달 돈으로 말한다. */
interface SavedEntryState {
  book: BookOut;
  entry: BookEntryOut;
  month: BookMonthStateOut;
}

/**
 * 전환 뒤 포커스가 갈 자리.
 *
 * 새 분류를 열고 닫는 길은 **누른 버튼이 그 클릭으로 사라진다.** 그냥 두면 포커스가 시트 밖
 * body 로 떨어진다. 그래서 바뀐 화면에서 그 일을 되돌릴 버튼으로 옮긴다.
 * 찾는 범위는 금액 화면 안이다(`keypadRef`). 감춰 둔 검토 화면에도 같은 분류 칩이 있다.
 */
const FOCUS_AFTER = {
  newCategoryChip: '.cat-chips__item--new',
  pickedCategory: '.record__picked',
} as const;

type FocusAfter = keyof typeof FOCUS_AFTER;

/** 얼마나 옛날까지 고를 수 있나. 달력 화면과 같게 3년이다. */
const MONTHS_BACK = 36;

function oldestDay(): string {
  return `${shiftMonth(toLedgerDate(new Date()).slice(0, 7), -MONTHS_BACK)}-01`;
}

/** 많이 쓴 태그부터. 같으면 서버가 준 순서(만든 순)를 지킨다. */
function byTagUsage(tags: TagOut[]): TagOut[] {
  return [...tags].sort((a, b) => b.usage_count - a.usage_count);
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
  bookId = null,
  sell = null,
  onClose,
  onRecorded,
}: {
  open: boolean;
  /** 첫 화면에 골라 둘 방법. 안 주면 직접 입력이다. */
  initialTab?: RecordTab;
  /** 첫 화면에 골라 둘 날. 안 주면 오늘이다. 시트 안에서 바꿀 수 있다. */
  day?: string;
  /** 어느 자리에서 열었나. 로그에만 쓴다. */
  from?: RecordFrom;
  /**
   * 「적을 곳」 의 처음 값. 홈이 보고 있는 공유 가계부다. 안 주면 내 가계부다.
   * 공유 가계부가 하나도 없는 사람에게는 「적을 곳」 줄 자체가 없다.
   */
  bookId?: string | null;
  /**
   * 자산 화면 「팔았어요」 로 열 때 그 종목. 첫 화면을 건너뛰고 그 종목이 골라진 팔기 둘째 화면으로
   * 열고, 둘째 화면의 ‹ 는 시트를 닫는다.
   */
  sell?: AssetItemOut | null;
  onClose: () => void;
  /**
   * 어느 날에 적혔는지. 저장이 실제로 끝난 뒤에 부른다.
   * 부르는 쪽(홈)이 그 날로 옮겨 가라고 있는 값이다.
   */
  onRecorded?: (day: string) => void;
}) {
  // 저장 응답을 기다리는 동안에는 닫히지 않는다. 닫히면 저장 결과 화면이 갈 곳을 잃는다.
  const [saving, setSaving] = useState(false);
  /*
    지금 닫으면 잃을 건수. 읽어 온 것을 눈앞에 두고 손잡이를 잘못 눌러 통째로 날아가는
    일이 실제로 있었다. 닫기를 한 번 되묻는다.
  */
  const [pending, setPending] = useState(0);
  /*
    손으로 적어 둔 것이 있나. **상태가 아니라 물어보는 함수다.** 상태로 올리면 한 박자 늦어,
    적자마자 닫는 손짓에서 아직 거짓인 값을 보고 확인 없이 닫혔다.
  */
  const draftedRef = useRef(() => false);
  /** 지금 분류를 만드는 중인가. 문구가 잃을 범위를 말해야 해서 바깥도 알아야 한다. */
  const composingRef = useRef(false);
  /*
    만드는 중에 닫는 손짓은 만들기만 접는다. 본문을 잡아 내리면 시트의 밀어 닫기가 그대로
    돌아 적어 둔 금액과 고른 날까지 함께 사라졌다.
  */
  const leaveComposeRef = useRef(() => {});
  /** 안쪽 단계에서 Esc 를 받으면 한 단계 뒤로. 받았으면 참. */
  const escBackRef = useRef(() => false);
  /** 지금 흐름과 그 흐름이 한 건이라도 저장했는지. 닫힘 로그가 같은 흐름에 붙는다. */
  const flowRef = useRef<FlowId | null>(null);
  const savedRef = useRef<FlowId | null>(null);
  const stepRef = useRef<RecordStep>('setup');
  const [reviewing, setReviewing] = useState(false);
  const [asking, setAsking] = useState(false);
  /*
    나가고 나서 어디로 갈까. 닫기만 하는 길과 카테고리 관리로 옮겨 가는 길이 같은 확인 창을
    쓴다. 읽어 온 것을 잃는다는 점에서 둘은 같은 일이다.
  */
  const [leaveTo, setLeaveTo] = useState<{ where: 'close' | 'manage'; how: CloseHow }>({
    where: 'close',
    how: 'back',
  });
  const analytics = useAnalytics();
  const navigate = useNavigate();
  const savedDismissRef = useRef<() => void>(() => {});

  function leave(where: 'close' | 'manage', how: CloseHow): void {
    const flowId = flowRef.current;
    if (flowId != null && savedRef.current !== flowId) {
      const step = stepRef.current;
      analytics.log(
        EVENTS.recordClosed,
        {
          step: closedStepOf(step),
          drafted: pending > 0 ? 'parsed' : draftedRef.current() ? 'typed' : 'none',
          how,
        },
        { flowId },
      );
    }
    // 저장 뒤 화면을 확인 없이 닫으면 적금 안내에 답 없이 닫은 것이다.
    savedDismissRef.current();
    onClose();
    if (where === 'manage') void navigate(ROUTES.categories);
  }

  /** 나가려는 모든 길이 여기를 지난다. 손잡이·딤·Esc·시스템 뒤로가기·관리로 가기가 같은 규칙을 탄다. */
  function requestLeave(where: 'close' | 'manage', how: CloseHow): void {
    // 이미 묻는 중이면 또 안 묻는다. 분모가 부풀면 이 물음이 방해였는지 안전장치였는지 못 가린다.
    if (asking) return;
    const drafted = draftedRef.current();
    if (pending > 0 || drafted) {
      analytics.log(
        EVENTS.recordLeaveAsked,
        // 왜 물었는지를 함께 남긴다. 읽어 온 것 때문인지 손으로 적은 것 때문인지 가른다.
        { result: 'asked', pending, reason: pending > 0 ? 'parsed' : 'typed' },
        { kind: 'impression', flowId: flowRef.current ?? undefined },
      );
      setLeaveTo({ where, how });
      setAsking(true);
      return;
    }
    leave(where, how);
  }

  function requestClose(reason?: SheetCloseReason): void {
    // 「그만둘까요?」 를 묻는 중이면 그 창만 접는다. 뒤 화면은 그대로 둔다.
    if (asking) {
      answer('stayed');
      return;
    }
    // 만드는 중이면 만들기만 접고 기록 화면으로 돌아간다. 묻는 일은 그쪽이 한다.
    if (composingRef.current) {
      leaveComposeRef.current();
      return;
    }
    // Esc 는 시트 안 ‹ 와 같은 일을 한다. 첫 화면에서만 시트를 닫으려 든다.
    if (reason === 'esc' && escBackRef.current()) return;
    requestLeave('close', reason ?? 'back');
  }

  function answer(result: 'stayed' | 'left'): void {
    analytics.log(
      EVENTS.recordLeaveAsked,
      { result, pending },
      { kind: 'click', flowId: flowRef.current ?? undefined },
    );
    setAsking(false);
    if (result === 'left') leave(leaveTo.where, leaveTo.how);
  }

  useOverlayBackClose(open, () => requestClose(), saving);
  // 묻는 창이 뜬 뒤에 걸려 단계 뒤로가기보다 먼저 받는다.
  useOverlayBackClose(asking, () => answer('stayed'));

  return (
    <BottomSheet
      open={open}
      onClose={requestClose}
      dismissible={!saving}
      // 검토 화면은 고칠 칸이 많다. 내용만큼 열면 저장 버튼이 접힌 아래로 밀린다.
      size={reviewing ? 'tall' : 'auto'}
      className="record-sheet"
      ariaLabel="10초 기록"
    >
      <RecordBody
        initialTab={initialTab}
        day={day}
        from={from}
        bookId={bookId}
        sell={sell}
        onDone={onClose}
        onRecorded={onRecorded}
        onLeave={() => requestLeave('close', 'back')}
        onManage={() => requestLeave('manage', 'manage')}
        onSavingChange={setSaving}
        onPendingChange={setPending}
        draftedRef={draftedRef}
        composingRef={composingRef}
        leaveComposeRef={leaveComposeRef}
        escBackRef={escBackRef}
        savedDismissRef={savedDismissRef}
        flowRef={flowRef}
        savedRef={savedRef}
        stepRef={stepRef}
        onReviewingChange={setReviewing}
      />
      {asking ? (
        <LeaveConfirm
          // 잃는 범위를 문구가 말한다. 분류를 만들던 중이면 눌러 둔 금액까지 함께 사라진다.
          text={leaveText(pending, composingRef.current)}
          onStay={() => answer('stayed')}
          onLeave={() => answer('left')}
        />
      ) : null}
    </BottomSheet>
  );
}

/**
 * 지금 닫으면 무엇을 잃는지 한 문장으로.
 *
 * 읽어 온 것이 있으면 건수를 먼저 말한다. 손으로 적어 둔 것이 함께 있으면 그것도 붙인다.
 */
function leaveText(pending: number, composing: boolean): string {
  const lost = [
    pending > 0 ? `읽어 온 ${pending}건` : null,
    composing ? '만들던 분류' : null,
  ].filter((part) => part != null);
  if (lost.length === 0) return '적던 내용이 사라져요. 그만둘까요?';
  const joined = lost.join('과 ');
  // 「3건이」 와 「분류가」. 받침이 있는지로 갈린다.
  return `${joined}${hasFinalConsonant(joined) ? '이' : '가'} 사라져요. 그만둘까요?`;
}

/** 마지막 글자에 받침이 있나. 한글이 아니면 없는 것으로 본다. */
function hasFinalConsonant(word: string): boolean {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/**
 * 시트가 열릴 때 새로 마운트된다. 그래서 지난번 금액도, 지난번 단계도 남아 있지 않다.
 * 닫히면 BottomSheet 가 null 을 돌려 이 몸통이 통째로 사라진다.
 */
function RecordBody({
  initialTab,
  day,
  from,
  bookId,
  sell,
  onDone,
  onRecorded,
  onLeave,
  onManage,
  onSavingChange,
  onPendingChange,
  draftedRef,
  composingRef,
  leaveComposeRef,
  escBackRef,
  savedDismissRef,
  flowRef,
  savedRef,
  stepRef,
  onReviewingChange,
}: {
  initialTab?: RecordTab;
  /** 처음에 고를 날. 안 주면 오늘. */
  day?: string;
  from: RecordFrom;
  /** 처음에 골라 둘 공유 가계부. 없으면 내 가계부. */
  bookId: string | null;
  /** 팔기로 곧장 열 종목. */
  sell: AssetItemOut | null;
  onDone: () => void;
  /** 저장이 끝난 날. 부르는 쪽이 그 날로 옮겨 간다. 오늘을 넘지 않는다. */
  onRecorded?: (day: string) => void;
  /** 첫 화면의 ‹. 잃을 것이 있으면 바깥이 먼저 묻는다. */
  onLeave: () => void;
  /** 카테고리 관리로 가겠다고 했을 때. 잃을 것이 있으면 바깥이 먼저 묻는다. */
  onManage: () => void;
  onSavingChange: (saving: boolean) => void;
  /** 어느 탭에서든 읽어 두고 아직 저장 안 한 건수의 합. */
  onPendingChange: (pending: number) => void;
  /** 손으로 적어 둔 것이 있나 묻는 함수를 여기 걸어 둔다. */
  draftedRef: { current: () => boolean };
  /** 지금 분류를 만드는 중인가. */
  composingRef: { current: boolean };
  /** 만들기만 접는 길. 시트를 닫으려는 손짓·딤이 만드는 중에는 이리로 온다. */
  leaveComposeRef: { current: () => void };
  /** Esc 를 한 단계 뒤로 쓰는 길. 받았으면 참을 돌려준다. */
  escBackRef: { current: () => boolean };
  /** 저장 뒤 화면을 확인 없이 닫을 때 부르는 길. */
  savedDismissRef: { current: () => void };
  flowRef: { current: FlowId | null };
  savedRef: { current: FlowId | null };
  stepRef: { current: RecordStep };
  /** 지금 보이는 패널이 검토 중인가. 시트 크기가 이 값을 따라간다. */
  onReviewingChange: (reviewing: boolean) => void;
}) {
  const bridge = useBridge();
  const analytics = useAnalytics();
  const queryClient = useQueryClient();
  const categories = useCategories();
  const tags = useTags();
  const create = useCreateTransaction();
  const createEntry = useCreateBookEntry();
  const navigate = useNavigate();
  const location = useLocation();

  /*
    어디에 적나(「적을 곳」). `null` 이면 내 가계부다.

    처음 값은 홈이 보고 있는 가계부다. 목록이 아직 안 왔으면 그 값을 그대로 믿고, 목록이
    와서 그 가계부가 끝났거나 사라졌으면 내 가계부로 둔다. 사람이 고르면 그 값이 이긴다.
  */
  const books = useBooks();
  const activeBooks = (books.data?.items ?? []).filter((book) => !book.ended);
  const hasShared = activeBooks.length > 0;
  const [chosenDest, setChosenDest] = useState<string | null | undefined>(undefined);
  const defaultDest =
    bookId != null && (books.data == null || activeBooks.some((book) => book.id === bookId))
      ? bookId
      : null;
  const destination = chosenDest !== undefined ? chosenDest : defaultDest;
  // 목록에 이미 있으면 요청 없이 그 값을 쓴다. 방금 만든 가계부처럼 목록이 늦으면 따로 받는다.
  const destQuery = useBook(destination);
  const destBook = activeBooks.find((book) => book.id === destination) ?? destQuery.data ?? null;
  const shared = destination != null;

  const today = toLedgerDate(new Date());
  const openedDay = day ?? today;
  /** 이름에 날이 붙은 버튼(「어제 기록하기」·달력의 그 날)으로 열었나. */
  const openedOnPastDay = openedDay !== today;
  const [recordDay, setRecordDay] = useState(openedDay);
  const isBackfill = recordDay !== today;

  /*
    이 시트가 사는 동안이 기록 흐름 하나다. 단계를 오가고 방법을 바꿔도 같은 흐름이다.
    캡처로 시작해 직접 입력으로 끝낸 사람을 두 흐름으로 세면 방식별 완료율이 거짓이 된다.
  */
  const [flowId] = useState(() => analytics.startFlow());
  flowRef.current = flowId;

  const startTab: RecordTab = initialTab ?? DEFAULT_RECORD_TAB;
  /** 첫 화면에서 고른 방법. */
  const [tab, setTab] = useState<RecordTab>(startTab);
  /** 자산 화면 「팔았어요」 로 열었으면 그 종목. 첫 화면 없이 팔기 둘째 화면으로 연다. */
  const [sellStart] = useState<AssetDest | null>(() => (sell == null ? null : destFromItem(sell)));
  const [step, setStep] = useState<RecordStep>(sellStart != null ? 'amount' : 'setup');
  stepRef.current = step;

  /*
    단계마다 머문 시간. 단계에 들어온 시각을 두고, 나갈 때 그 단계 몫에 더한다.
    날짜는 첫 화면 몫, 태그는 금액 화면 몫이다. 줄글과 사진은 세지 않는다(읽는 시간이 섞인다).
  */
  const [timing] = useState(() => {
    const now = Date.now();
    return { openedAt: now, enteredAt: now, setupMs: 0, amountMs: 0 };
  });
  /** 「다음」 을 몇 번 눌렀나. 두 번째부터는 돌아와서 다시 고른 것이다. */
  const setupDoneRef = useRef(0);

  function settleTime(now: number): void {
    const spent = now - timing.enteredAt;
    if (step === 'setup' || step === 'day') timing.setupMs += spent;
    if (step === 'amount' || step === 'tag' || step === 'dest' || step === 'item') {
      timing.amountMs += spent;
    }
    timing.enteredAt = now;
  }

  function go(next: RecordStep): void {
    settleTime(Date.now());
    setStep(next);
  }

  /*
    남은 사진 장수. **캡처와 영수증이 하나를 나눠 쓴다.** 값이 드는 것은 사진을 읽는 일이지
    어디서 가져왔는지가 아니다.
  */
  const photoCredits = usePhotoCredits(flowId);
  const captureRef = useRef<ImageImportHandle>(null);
  const receiptRef = useRef<ImageImportHandle>(null);

  /** 사진이 막혔을 때 갈 길. 두 사진 패널이 같은 버튼을 쓴다. */
  const keypadFallback = (
    <Button
      variant="ghost"
      onClick={() => {
        analytics.log(
          EVENTS.inputMethodChanged,
          { from: recordMethodOf(tab), to: recordMethodOf('keypad') },
          { flowId, kind: 'click' },
        );
        setTab('keypad');
        go('amount');
      }}
    >
      직접 입력
    </Button>
  );

  /*
    지출, 수입, 이체. 이 값이 고를 수 있는 분류와 저장할 종류를 함께 정한다.
    이체는 집계 어디에도 안 들어가서(ADR-0005) 분류도 태그도 없다.
  */
  const [recordKind, setRecordKind] = useState<RecordKind>(sellStart != null ? 'save' : 'expense');
  const isTransfer = recordKind === 'transfer';
  const isSave = recordKind === 'save';
  const kind: LedgerKind = recordKind === 'income' ? 'income' : 'expense';
  // 무언가 도는 중에는 단계를 옮기지 못한다. 옮기면 응답이 돌아올 자리가 사라진다.
  const [busy, setBusy] = useState(false);
  const [digits, setDigits] = useState('');

  /*
    저축·투자. 「어디에」 와 넣었나 팔았나, 수량. 고른 길과 격자 자리는 로그에만 쓴다.
    종류나 적을 곳을 바꾸면 비운다.
  */
  const [assetDest, setAssetDest] = useState<AssetDest | null>(sellStart);
  const [destFrom, setDestFrom] = useState<{ from: AssetDestFrom; position: number } | null>(null);
  const [assetSide, setAssetSide] = useState<AssetSideLog>(sellStart != null ? 'sell' : 'buy');
  /** 수량 종목의 수량. 소수점이 든 글자 그대로. */
  const [qtyDigits, setQtyDigits] = useState('');
  /** 「전부」 로 넣은 수량인가. 그 뒤에 수량을 고치면 풀린다. */
  const [qtyAll, setQtyAll] = useState(false);
  /*
    금액으로 파는 항목의 「남은 금액」 과 「넣은 돈」. 남은 금액은 null 이거나 비었으면 처음 값
    (지금 금액 − 받은 돈)을 쓴다. 「전부」 는 '0' 이다. 넣은 돈은 그 항목의 넣은 돈을 모를 때만 선다.
  */
  const [restDigits, setRestDigits] = useState<string | null>(null);
  const [costDigits, setCostDigits] = useState('');
  /** 키패드가 무엇을 치나. 수량 종목을 고르면 수량부터 친다. */
  const [keyTarget, setKeyTarget] = useState<'amount' | 'qty' | 'rest' | 'cost'>(
    sellStart != null && destHoldingOf(sellStart) === 'quantity' ? 'qty' : 'amount',
  );

  const [saved, setSaved] = useState<SavedState | null>(null);
  const [savedEntry, setSavedEntry] = useState<SavedEntryState | null>(null);
  /*
    무엇으로 냈나. 지출에만 붙는다. **여기서는 묻지 않는다.** 지난번에 쓴 것으로 조용히 채워
    저장하고, 저장 뒤 화면에서 바꾸거나 지울 수 있다.
  */
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  // 금액보다 먼저 고른 카테고리. 화면에서 카테고리가 위에 있어 손이 먼저 그리로 간다.
  const [pickedId, setPickedId] = useState<string | null>(null);
  // 고르고 나면 목록을 접는다. 분류가 늘수록 목록이 화면을 다 먹는다.
  const [listOpen, setListOpen] = useState(true);
  /*
    분류 목록을 「더 보기」 로 끝까지 펼쳤나. 펼친 동안에는 키패드를 감춘다.
    고르는 중인지 적는 중인지가 흐려진다는 말을 들었다.
  */
  const [listExpanded, setListExpanded] = useState(false);

  /*
    붙일 태그. 지출과 수입에만, 내 가계부에만 있다. 공유 기록에는 태그 칸이 없다.
    종류나 적을 곳을 바꾸면 비운다. 지출 태그가 수입에 남으면 안 된다.
  */
  const [tagId, setTagId] = useState<string | null>(null);
  const [tagComposing, setTagComposing] = useState(false);
  const tagShown = !isTransfer && !isSave && !shared;
  const kindTags =
    tags.data == null ? null : byTagUsage(tags.data.items.filter((tag) => tag.kind === kind));
  const pickedTag = kindTags?.find((tag) => tag.id === tagId) ?? null;
  // 태그가 하나도 없으면 고를 것이 없어 곧장 만들기부터 편다.
  const tagFormOpen = tagComposing || (kindTags != null && kindTags.length === 0);

  /*
    탭마다 읽어 두고 아직 저장 안 한 건수. 패널은 감춰진 채 함께 살아 있어 합으로 센다.
    시트를 크게 열지는 지금 보이는 패널만 보고 정한다.
  */
  const [reviewCounts, setReviewCounts] = useState<Partial<Record<RecordTab, number>>>({});
  const pending = Object.values(reviewCounts).reduce((sum, count) => sum + (count ?? 0), 0);
  /** 패널을 비우고 다시 세울 때 올리는 값. 읽어 온 것을 버리고 첫 화면으로 갈 때 쓴다. */
  const [panelKeys, setPanelKeys] = useState<Record<PanelTab, number>>({
    nl: 0,
    capture: 0,
    receipt: 0,
  });
  /** 읽어 온 것을 든 채 ‹ 를 눌러 묻는 중. 몇 건인지와 어느 길로 눌렀는지. */
  const [panelAsk, setPanelAsk] = useState<{ count: number; how: 'sheet' | 'back' } | null>(null);
  /** 저장까지 마쳐 결과 화면을 든 패널. 이 패널의 ‹ 는 「확인」 과 같다. */
  const importSavedRef = useRef<Partial<Record<RecordTab, boolean>>>({});
  /** 패널마다 검토 묶음을 버리는 길. 검토 화면이 서 있을 때만 걸린다. */
  const nlDiscardRef = useRef<() => void>(() => {});
  const captureDiscardRef = useRef<() => void>(() => {});
  const receiptDiscardRef = useRef<() => void>(() => {});
  const discardRefs: Record<PanelTab, { current: () => void }> = {
    nl: nlDiscardRef,
    capture: captureDiscardRef,
    receipt: receiptDiscardRef,
  };

  /**
   * 저장하려다 앞날이라 물어보는 중. 누르면 그대로 이어서 저장한다.
   * 고른 분류와 금액을 여기 들고 있는다.
   */
  const [futureAsk, setFutureAsk] = useState<{
    category: CategoryOut | null;
    amount: number;
  } | null>(null);

  /**
   * 키패드로 한 건을 저장해 확인 화면이 떠 있나.
   *
   * 이 자리에서 다른 패널을 언마운트하지 않는다. 그러면 사진으로 읽어 둔 검토 목록이 말없이
   * 사라지고, 그것을 세던 값까지 0 으로 덮인다.
   */
  const done = saved != null || savedEntry != null;
  const panelShown = !done && (step === 'nl' || step === 'photo');
  const reviewing = panelShown && (reviewCounts[tab] ?? 0) > 0;

  useEffect(() => {
    onPendingChange(pending);
  }, [onPendingChange, pending]);

  useEffect(() => {
    onReviewingChange(reviewing);
  }, [onReviewingChange, reviewing]);

  /** 적힌 날을 부르는 쪽에 알린다. 읽어 온 것에 앞날이 섞여 있어도 오늘을 넘지 않는다. */
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
    어느 방식으로, 어느 자리에서 시작했나. 지난 날에 적는 것인지(`backfill`)도 함께 남긴다.
  */
  useEffect(() => {
    analytics.log(
      EVENTS.recordStarted,
      {
        method: recordMethodOf(startTab),
        from,
        backfill: openedOnPastDay,
      },
      { flowId },
    );
    // 시트가 사는 동안 한 번이다. 단계를 옮겼다고 다시 시작한 것이 아니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
    분류 만들기 화면이 열렸나. **시트를 하나 더 띄우지 않고 시트 안쪽을 통째로 바꾼다.**
    적던 금액이 살아 있어야 만들고 나서 그대로 이어 적을 수 있다.
  */
  const [creating, setCreating] = useState(false);
  /** 만들던 분류에 적어 둔 것이 있나. */
  const composeDirtyRef = useRef(false);
  /** 만들기를 그만두려는데 적어 둔 것이 있어 묻는 중. 덮는 창과 같은 규칙이다. */
  const [composeAsking, setComposeAsking] = useState(false);
  /** 줄글 패널에 아직 안 읽힌 글이 적혀 있나. 그 패널이 그릴 때마다 여기 적는다. */
  const nlDraftRef = useRef(false);

  /** 만들기를 접고 금액 화면으로 돌아간다. 묻는 일은 부르는 쪽이 이미 끝냈다. */
  function leaveCompose(): void {
    setCreating(false);
    composeDirtyRef.current = false;
    setFocusAfter('newCategoryChip');
  }

  /** 만들기를 그만두려는 모든 길이 여기를 지난다. Esc · 시스템 뒤로가기 · 「이전」 이 같다. */
  function requestLeaveCompose(): void {
    if (composeAsking) return;
    if (composeDirtyRef.current) {
      setComposeAsking(true);
      return;
    }
    leaveCompose();
  }

  /**
   * 한 단계 뒤로. 시트 안 ‹, 토스 위 ‹, 폰 뒤로가기, Esc 가 모두 여기로 온다.
   *
   * 금액, 줄글, 사진은 첫 화면으로, 날짜는 첫 화면으로, 태그는 금액 화면으로 간다.
   * 읽어 온 것이 남은 패널이면 버릴지 먼저 묻는다. 읽는 중에는 움직이지 않는다.
   */
  function back(how: 'sheet' | 'back'): void {
    if (busy || done || step === 'setup') return;
    // 버릴지 묻는 중에 또 뒤로 가면 묻던 창만 접는다. 읽어 온 것은 그대로 둔다.
    if (panelAsk != null) {
      stayPanel();
      return;
    }
    // 앞날인지 묻는 창도 그 창만 접는다. 남겨 두면 날을 고친 뒤 둘째 화면에서 다시 뜬다.
    if (step === 'amount' && futureAsk != null) {
      setFutureAsk(null);
      return;
    }
    // 자산 화면 「팔았어요」 로 열었으면 첫 화면이 없다. 둘째 화면의 ‹ 는 시트를 닫는다.
    if (step === 'amount' && sellStart != null) {
      onLeave();
      return;
    }
    if (step === 'tag' && tagFormOpen && (kindTags?.length ?? 0) > 0) {
      setTagComposing(false);
      return;
    }
    if (step === 'nl' || step === 'photo') {
      // 저장까지 마친 결과 화면이면 「확인」 과 같은 길로 닫는다.
      if (importSavedRef.current[tab]) {
        finish();
        return;
      }
      if ((reviewCounts[tab] ?? 0) > 0) {
        askPanel(how);
        return;
      }
    }
    analytics.log(EVENTS.recordBack, { from: step, how }, { flowId, kind: 'click' });
    if (step === 'tag') {
      setTagComposing(false);
      go('amount');
      return;
    }
    if (step === 'item') {
      go('dest');
      return;
    }
    if (step === 'dest') {
      go('amount');
      return;
    }
    go('setup');
  }

  /** 읽어 온 것을 버릴지 묻는다. 시트를 닫으려 할 때와 같은 로그를 남긴다. */
  function askPanel(how: 'sheet' | 'back'): void {
    const count = reviewCounts[tab] ?? 0;
    analytics.log(
      EVENTS.recordLeaveAsked,
      { result: 'asked', pending: count, reason: 'parsed' },
      { kind: 'impression', flowId },
    );
    setPanelAsk({ count, how });
  }

  function stayPanel(): void {
    if (panelAsk == null) return;
    analytics.log(
      EVENTS.recordLeaveAsked,
      { result: 'stayed', pending: panelAsk.count },
      { kind: 'click', flowId },
    );
    setPanelAsk(null);
  }

  /** 그 패널을 새로 세워 비운다. 읽어 둔 것과 저장 결과 화면이 함께 사라진다. */
  function resetPanel(key: PanelTab): void {
    setPanelKeys((prev) => ({ ...prev, [key]: prev[key] + 1 }));
    setReviewCounts((prev) => ({ ...prev, [key]: 0 }));
    importSavedRef.current[key] = false;
  }

  /** 읽어 온 것을 버리고 첫 화면으로. 서버의 검토 묶음도 「취소」 처럼 지운다. */
  function leavePanel(): void {
    if (panelAsk == null || tab === 'keypad' || step === 'setup') return;
    analytics.log(
      EVENTS.recordLeaveAsked,
      { result: 'left', pending: panelAsk.count },
      { kind: 'click', flowId },
    );
    analytics.log(EVENTS.recordBack, { from: step, how: panelAsk.how }, { flowId, kind: 'click' });
    discardRefs[tab].current();
    resetPanel(tab);
    setPanelAsk(null);
    go('setup');
  }

  // 단계마다 뒤로가기를 한 단계 뒤로 가져간다. 첫 화면에서는 시트의 닫기가 받는다.
  useOverlayBackClose(!done && step !== 'setup', () => back('back'), busy);
  // 나중에 등록한 것이 먼저 받는다. 분류를 만드는 동안에는 만들기만 접는다.
  useOverlayBackClose(creating, requestLeaveCompose, busy);

  /** 저장 뒤 화면의 ‹. Esc 도 같은 길로 보내 적어 둔 상호와 메모를 먼저 보낸다. */
  const savedBackRef = useRef<() => void>(() => {});
  escBackRef.current = () => {
    if (done) {
      savedBackRef.current();
      return true;
    }
    if (step === 'setup') return false;
    back('back');
    return true;
  };

  /*
    만드는 중에 누른 Esc. 여기서 삼키지 않으면 시트가 통째로 닫히려 든다.
    시트도 `document` 에 리스너를 달아 두어서 `stopImmediatePropagation` 이라야 막힌다.
  */
  useEffect(() => {
    if (!creating) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!busy) requestLeaveCompose();
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, composeAsking, creating]);

  /* 전환 뒤에 포커스를 옮길 자리. 옮기고 나면 비운다. */
  const keypadRef = useRef<HTMLDivElement>(null);
  const [focusAfter, setFocusAfter] = useState<FocusAfter | null>(null);

  useEffect(() => {
    if (focusAfter == null) return;
    setFocusAfter(null);
    const spot = keypadRef.current?.querySelector<HTMLElement>(FOCUS_AFTER[focusAfter]);
    // 못 찾아도 body 로는 안 보낸다. 시트 안에 남아 있어야 Tab 이 뒤 화면으로 새지 않는다.
    (spot ?? keypadRef.current)?.focus();
  }, [focusAfter]);

  /*
    단계가 바뀌면 새 화면의 첫 버튼(‹)으로 포커스를 옮긴다. 누른 버튼이 사라져 포커스가
    시트 밖으로 떨어지지 않게.
  */
  const rootRef = useRef<HTMLDivElement>(null);
  const shownStep = done ? null : step;
  const lastShownStep = useRef(shownStep);
  useEffect(() => {
    if (lastShownStep.current === shownStep) return;
    lastShownStep.current = shownStep;
    if (shownStep == null) return;
    rootRef.current
      ?.querySelector<HTMLElement>('[data-record-step]:not([hidden]) button:not(:disabled)')
      ?.focus();
  }, [shownStep]);

  const allCategories = categories.data?.items ?? [];
  // 고른 종류의 분류만 보여준다. 공유 가계부에 적을 때는 그 가계부의 분류다.
  const pickable = shared
    ? asPickable(destBook?.categories ?? [])
    : categoriesOfKind(kind, allCategories);

  /** 껍데기(닫기 막기)와 단계 잠금에 같은 신호를 쓴다. */
  function markBusy(next: boolean): void {
    setBusy(next);
    onSavingChange(next);
  }

  /**
   * 방금 쓴 방식을 설정 캐시에 심는다. 서버도 저장할 때 이 방식을 기억한다.
   * 지금 시트는 늘 직접 입력으로 열지만, 이 값은 계속 맞춰 둔다.
   */
  function rememberMethod(): void {
    queryClient.setQueryData<PreferencesOut>(queryKeys.preferences(), (prev) =>
      prev == null ? prev : { ...prev, last_record_method: recordMethodOf(tab) },
    );
  }

  /** 한 번 적었다고 기기에 센다. 「홈 화면에 추가」 안내를 다시 띄우는 데만 쓴다. */
  function markRecorded(): void {
    void bumpRecordCount(bridge.storage);
    savedRef.current = flowId;
  }

  /**
   * 시트를 닫는다.
   *
   * **다른 패널에 읽어 둔 것이 남아 있으면 닫지 않는다.** 대신 그 건들이 있는 패널로
   * 돌려보낸다. 보고 있는 패널은 세지 않는다. 그 패널에서 저장하거나 취소해 여기까지 왔다.
   */
  function finish(): void {
    // 공유 기록은 서버가 방식을 기억하지 않는다. 캐시만 바꾸면 서버와 어긋난다.
    if (savedEntry == null && !shared) rememberMethod();
    const waiting = PANEL_TABS.find((key) => key !== tab && (reviewCounts[key] ?? 0) > 0);
    if (waiting != null) {
      // 일을 마친 패널은 새로 세운다. 그대로 두면 첫 화면에서 다시 골랐을 때 끝난 화면이 선다.
      if (tab !== 'keypad') resetPanel(tab);
      setSaved(null);
      setSavedEntry(null);
      // 적을 곳은 그대로 둔다. 읽어 둔 것이 있는 동안 적을 곳이 잠겨 있다.
      setTab(waiting);
      go(waiting === 'nl' ? 'nl' : 'photo');
      return;
    }
    // 검토 화면 「취소」 로 저장 없이 닫힌다. leave() 를 지나지 않아 여기서 남긴다.
    if (savedRef.current !== flowId) {
      analytics.log(
        EVENTS.recordClosed,
        {
          step: closedStepOf(step),
          drafted: draftedRef.current() ? 'typed' : 'none',
          how: 'cancel',
        },
        { flowId },
      );
    }
    onDone();
  }

  /** 줄글·사진으로 읽은 것을 저장한 뒤. 공유 가계부에 적었으면 날로 옮겨 가지 않는다. */
  function afterImportSaved(
    key: PanelTab,
    savedDay: string | null,
    savedBook: string | null,
  ): void {
    importSavedRef.current[key] = true;
    markRecorded();
    if (savedBook != null) return;
    rememberMethod();
    if (savedDay != null) tellRecorded(savedDay);
  }

  /** 첫 화면에서 열린 값과 달라진 칸. 화면 순서대로 잇는다. */
  function changedFields(): SetupChanged {
    const fields = [
      recordDay !== openedDay ? 'day' : null,
      chosenDest !== undefined && chosenDest !== defaultDest ? 'book' : null,
      tab !== startTab ? 'way' : null,
      // 종류는 직접 입력에만 있다. 다른 방법이면 골라 둔 값이 남아도 쓰이지 않는다.
      tab === 'keypad' && recordKind !== 'expense' ? 'kind' : null,
    ].filter((field) => field != null);
    return (fields.length === 0 ? 'none' : fields.join('+')) as SetupChanged;
  }

  /** 첫 화면의 아래 버튼. 고른 방법의 다음 단계로 간다. 사진이면 고르기도 곧바로 부른다. */
  function next(): void {
    settleTime(Date.now());
    analytics.log(
      EVENTS.recordSetupDone,
      {
        way: recordMethodOf(tab),
        // 종류 칩은 직접 입력에만 선다. 다른 방법이면 남아 있는 값을 싣지 않는다.
        ...(tab === 'keypad' ? { kind: recordKind } : {}),
        book: shared ? 'shared' : 'mine',
        day: isBackfill ? 'past' : 'today',
        changed: changedFields(),
        setup_ms: timing.setupMs,
        again: setupDoneRef.current > 0,
      },
      { flowId, kind: 'click' },
    );
    setupDoneRef.current += 1;
    if (tab === 'keypad') {
      setStep('amount');
      return;
    }
    if (tab === 'nl') {
      setStep('nl');
      return;
    }
    setStep('photo');
    // 누른 그 손짓 안에서 연다. 미뤄 열면 기기가 사람이 누른 것으로 안 보고 막는다.
    (tab === 'capture' ? captureRef : receiptRef).current?.start();
  }

  function chooseWay(next: RecordTab): void {
    if (next === tab) return;
    // 돌아와서 방법을 바꾼 것만 남긴다. 처음 고르는 것은 record_setup_done.changed 가 센다.
    if (setupDoneRef.current > 0) {
      analytics.log(
        EVENTS.inputMethodChanged,
        { from: recordMethodOf(tab), to: recordMethodOf(next) },
        { flowId, kind: 'click' },
      );
    }
    setTab(next);
  }

  /** 종류를 바꾸면 골라 둔 분류와 태그를 버린다. 지출 분류가 수입에 남으면 안 된다. */
  function chooseKind(next: RecordKind): void {
    if (next === recordKind) return;
    setRecordKind(next);
    setPickedId(null);
    setListOpen(true);
    setListExpanded(false);
    setTagId(null);
    clearAsset();
  }

  /** 「어디에」 와 수량을 비운다. 종류나 적을 곳을 바꿨을 때. */
  function clearAsset(): void {
    setAssetDest(null);
    setDestFrom(null);
    setAssetSide('buy');
    setQtyDigits('');
    setQtyAll(false);
    setRestDigits(null);
    setCostDigits('');
    setKeyTarget('amount');
  }

  /** 「어디에」 를 골랐을 때. 「넣었어요」 로 두고 수량을 비운다. 수량 종목이면 수량 칸부터 친다. */
  function pickDest(pick: AssetDestPick): void {
    setAssetDest(pick.dest);
    setDestFrom({ from: pick.from, position: pick.position });
    setAssetSide('buy');
    setQtyDigits('');
    setQtyAll(false);
    setRestDigits(null);
    setCostDigits('');
    setKeyTarget(destHoldingOf(pick.dest) === 'quantity' ? 'qty' : 'amount');
    create.reset();
    if (step !== 'amount') go('amount');
  }

  /** 「넣었어요 | 팔았어요」. 수량은 비우고, 수량 종목이면 수량 칸부터 친다. */
  function chooseSide(next: AssetSideLog): void {
    if (next === assetSide) return;
    setAssetSide(next);
    setQtyDigits('');
    setQtyAll(false);
    setRestDigits(null);
    setCostDigits('');
    setKeyTarget(assetDest != null && destHoldingOf(assetDest) === 'quantity' ? 'qty' : 'amount');
    create.reset();
  }

  function typeQuantity(next: string): void {
    setQtyDigits(next);
    setQtyAll(false);
  }

  function requestSave(category: CategoryOut | null, amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    // 아직 오지 않은 날이면 한 번 묻는다. 막지는 않는다.
    if (isFutureDay(recordDay)) {
      setFutureAsk({ category, amount });
      return;
    }
    save(category, amount);
  }

  /** 저장을 누른 순간까지의 시간. save_result 에 싣는다. */
  function timesAtSave() {
    const now = Date.now();
    settleTime(now);
    return {
      setup_ms: timing.setupMs,
      amount_ms: timing.amountMs,
      flow_ms: now - timing.openedAt,
      defaults: changedFields() === 'none',
    };
  }

  /** 줄글과 사진의 저장 시간. 둘째 화면을 지나지 않아 amount_ms 는 뺀다. */
  function importTimes(): ImportSaveTimes {
    const { amount_ms: _amountMs, ...rest } = timesAtSave();
    return rest;
  }

  function save(category: CategoryOut | null, amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const times = timesAtSave();
    if (destination != null) {
      saveToBook(destination, category, amount, times);
      return;
    }

    setFutureAsk(null);
    markBusy(true);
    analytics.log(EVENTS.saveRequested, { method: 'keypad', count: 1 }, { flowId, kind: 'click' });
    const startedAt = Date.now();
    const savingTagId = tagShown ? (pickedTag?.id ?? null) : null;
    // 저축·투자. 서버에는 분류 없는 이체로 적히고 「어디에」 와 수량이 장부에 붙는다.
    const savingDest = isSave ? assetDest : null;
    const savingSide: AssetSideLog = sideShown ? assetSide : 'buy';
    const savingQty =
      savingDest != null && destHoldingOf(savingDest) === 'quantity' ? qtyValue : null;
    const assetLog: Pick<
      EventParamMap['save_result'],
      'side' | 'qty' | 'qty_all' | 'dest_from' | 'position'
    > =
      savingDest == null
        ? {}
        : {
            side: savingSide,
            qty: quantityShapeOf(savingQty),
            ...(savingSide === 'sell' && savingQty != null
              ? { qty_all: qtyAll && sameQuantity(savingQty, sellItem?.quantity) }
              : {}),
            ...(destFrom == null ? {} : { dest_from: destFrom.from }),
            ...(destFrom?.from === 'grid' ? { position: destFrom.position - 1 } : {}),
          };
    create.mutate(
      {
        /*
          지난 날이면 그 날 정오에 적는다. 오늘이면 지금 시각 그대로 둔다.
          정오로 두는 것은 시간대가 달라져도 날이 안 넘어가게 하려는 것이다.
        */
        occurred_at: isBackfill ? toLedgerNoonIso(recordDay) : new Date().toISOString(),
        amount,
        type: isSave ? 'transfer' : recordKind,
        // 이체에는 분류가 없다. 집계 어디에도 안 들어가서 골라도 보일 자리가 없다(ADR-0005).
        category_id: isSave ? null : (category?.id ?? null),
        tag_id: savingTagId,
        source: 'keypad',
        // 손으로 직접 누른 값이라 분류를 의심할 이유가 없다.
        confidence: 1,
        excluded_from_budget: false,
        // 수입에는 뜻이 없다. 보내도 서버가 버리지만 여기서도 안 보낸다.
        payment_method: recordKind === 'expense' ? method : null,
        ...(savingDest == null
          ? {}
          : {
              ...destBodyOf(savingDest),
              asset_side: savingSide,
              asset_quantity: savingQty,
              // 금액으로 파는 항목은 남은 금액(0 이면 전부)과, 모르던 넣은 돈을 적었으면 그것.
              ...(savingSide === 'sell' && amountSell && restValue != null
                ? {
                    asset_remaining: restValue,
                    ...(totalCost != null ? { asset_cost_basis: totalCost } : {}),
                  }
                : {}),
            }),
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
              book: 'mine',
              kind: recordKind,
              ...times,
              ...assetLog,
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
              // 오늘이 아닌 날에 적었나. record_started 의 backfill(열 때 지난 날이었나)과 뜻이 다르다.
              day_moved: isBackfill,
              type: recordKind,
              kind: recordKind,
              book: 'mine',
              ...times,
              ...assetLog,
            },
            { flowId },
          );
          // 장부에 붙은 것만 센다. 이름, 금액, 수량 값은 싣지 않는다.
          if (savingDest != null && created.asset != null) {
            const group = destGroupOf(savingDest);
            analytics.log(
              EVENTS.assetChanged,
              {
                action: savingDest.type === 'new' ? 'created' : 'updated',
                group,
                kind: group === 'investment' ? (destKindOf(savingDest) ?? 'none') : 'none',
                from: 'record',
                fields: savingQty == null ? 'amount' : 'amount+qty',
              },
              { flowId, kind: 'click' },
            );
          }
          // 태그는 저장과 함께 붙었다. 서버가 받아 준 것만 센다.
          if (savingTagId != null && created.transaction.tag_id != null) {
            analytics.log(
              EVENTS.tagApplied,
              { where: 'record', kind, result: 'attached' },
              { flowId, kind: 'click' },
            );
          }
          // 저장 뒤 화면을 세우는 이 자리에서 남긴다. 효과에서 남기면 개발 판에서 두 줄이 된다.
          analytics.log(
            EVENTS.feedbackShown,
            {
              feedback_kind: created.feedback.kind,
              has_budget: created.feedback.remaining_budget != null,
              book: 'mine',
            },
            { flowId, kind: 'impression' },
          );
          rememberMethod();
          markRecorded();
          tellRecorded(toLedgerDate(new Date(created.transaction.occurred_at)));
          setSaved({
            transaction: created.transaction,
            feedback: created.feedback,
            asset:
              savingDest == null || created.asset == null
                ? null
                : {
                    result: created.asset,
                    name: destNameOf(savingDest),
                    holding: destHoldingOf(savingDest),
                    unit: unitOf(destKindOf(savingDest)),
                  },
          });
        },
      },
    );
  }

  /**
   * 공유 가계부에 한 건 적는다. 고른 날을 그대로 보낸다. 날짜로 적는 기록이라 시간대에
   * 밀리지 않는다. 결제 수단과 태그는 개인 속성이라 싣지 않는다.
   */
  function saveToBook(
    targetId: string,
    category: CategoryOut | null,
    amount: number,
    times: ReturnType<typeof timesAtSave>,
  ): void {
    const target = destBook;
    if (target == null) return;

    setFutureAsk(null);
    markBusy(true);
    analytics.log(EVENTS.saveRequested, { method: 'keypad', count: 1 }, { flowId, kind: 'click' });
    const startedAt = Date.now();
    createEntry.mutate(
      {
        bookId: targetId,
        body: {
          amount: String(amount),
          category_id: category?.id ?? null,
          occurred_on: recordDay,
        },
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
              book: 'shared',
              kind: 'expense',
              ...times,
            },
            { flowId },
          );
        },
        onSuccess: (created) => {
          analytics.log(
            EVENTS.saveResult,
            {
              method: 'keypad',
              result: 'ok',
              created_count: 1,
              elapsed_ms: Date.now() - startedAt,
              day_moved: isBackfill,
              type: 'expense',
              kind: 'expense',
              book: 'shared',
              ...times,
            },
            { flowId },
          );
          // 공유 가계부에는 내 예산이 없어 그 가계부의 예산 여부를 싣는다.
          analytics.log(
            EVENTS.feedbackShown,
            { has_budget: created.month.budget != null, book: 'shared' },
            { flowId, kind: 'impression' },
          );
          markRecorded();
          // 다음에 내 가계부를 보다가 시트를 열어도 이 가계부가 둘째 칩에 선다.
          void writeBookLast(bridge.storage, targetId);
          setSavedEntry({ book: target, entry: created.entry, month: created.month });
        },
      },
    );
  }

  /*
    손으로 적어 둔 것 셋을 한 값으로 묶는다. 금액, 줄글 초안, 만들던 분류.
    고른 분류·종류 같은 것은 안 센다. 되돌리는 데 한 번 누르면 되는 값이라, 그것까지 물으면
    확인 창이 너무 자주 떠 진짜 물어야 할 때 안 읽힌다.
    저장이 끝났으면 눌러 둔 숫자는 안 센다. 방금 저장한 그 금액이다.
  */
  draftedRef.current = () =>
    (!done && (digits !== '' || qtyDigits !== '')) || nlDraftRef.current || composeDirtyRef.current;
  composingRef.current = creating;
  leaveComposeRef.current = requestLeaveCompose;

  const amount = toAmount(digits);
  const savingNow = create.isPending || createEntry.isPending;

  const destHolding = isSave && assetDest != null ? destHoldingOf(assetDest) : null;
  const lot = destHolding === 'quantity';
  /** 「넣었어요 | 팔았어요」 는 팔 수 있는 종목에만 선다. 저장 전 새 항목은 팔 보유가 없다. */
  const sideShown =
    assetDest?.type === 'item' && (destHolding === 'quantity' || destHolding === 'amount');
  const selling = sideShown && assetSide === 'sell';
  const sellItem = selling && assetDest?.type === 'item' ? assetDest.item : null;
  // 금액으로 파는 항목. 받은 돈 말고 남은 금액으로 판 몫을 정한다.
  const amountSell = sellItem != null && destHolding === 'amount';
  const costUnknown = amountSell && sellItem.cost_basis == null;
  const restAuto = amountSell ? defaultRemaining(sellItem.amount, amount) : 0;
  const restValue = !amountSell
    ? null
    : restDigits != null && restDigits !== ''
      ? toAmount(restDigits)
      : restAuto;
  const totalCost = costUnknown && costDigits !== '' ? toAmount(costDigits) : null;
  const sellCheck =
    sellItem == null
      ? null
      : sellPreviewOf(sellItem, qtyDigits, amount, { remaining: restValue, totalCost });
  const qtyValue = lot ? quantityValue(qtyDigits) : null;
  const typingQty = lot && keyTarget === 'qty';
  const typingRest = amountSell && keyTarget === 'rest';
  const typingCost = costUnknown && keyTarget === 'cost';
  // 수량 종목은 수량이 있어야, 팔 때는 보유를 넘지 않아야 저장이 켜진다.
  const assetReady =
    assetDest != null && (!lot || qtyValue != null) && (!selling || sellCheck?.ok === true);

  /** 팔 때 「전부」. 보유 수량을 그대로 넣고 금액을 치러 간다. */
  function sellAll(): void {
    if (sellItem == null) return;
    setQtyDigits(quantityValue(sellItem.quantity) ?? '');
    setQtyAll(true);
    setKeyTarget('amount');
  }

  /** 금액으로 팔 때 「전부」. 남은 금액을 0 으로 둔다. 다시 누르면 처음 값으로 돌아간다. */
  function sellAllAmount(): void {
    setRestDigits(restDigits === '0' ? null : '0');
    setKeyTarget('amount');
  }

  /** 「남은 금액」 칸을 누르면 새로 친다. 비어 있는 동안은 처음 값을 쓴다. */
  function focusRest(): void {
    if (keyTarget !== 'rest') setRestDigits('');
    setKeyTarget('rest');
  }

  /** 저장 뒤 「자산 보기」. 다른 방법에 읽어 둔 것이 남았으면 그리로 먼저 간다. */
  function openAssets(): void {
    const waiting = PANEL_TABS.some((key) => key !== tab && (reviewCounts[key] ?? 0) > 0);
    finish();
    if (!waiting && location.pathname !== ROUTES.assets) void navigate(ROUTES.assets);
  }
  const failedSave = shared ? createEntry.error : create.error;
  const saveError = failedSave instanceof ApiError ? failedSave : null;

  const picked = pickable.find((category) => category.id === pickedId) ?? null;

  /**
   * 적을 곳을 바꾼다. **금액은 그대로 둔다.** 분류와 태그는 가계부마다 달라 버린다.
   * 공유 가계부는 지출만 받는다. 수입·이체를 골라 둔 채 옮기면 지출로 되돌린다.
   */
  function chooseDestination(next: string | null): void {
    // 읽어 둔 것은 읽을 때 고른 가계부에 묶여 있다. 검토를 끝내거나 버려야 바꾼다.
    if (next === destination || pending > 0) return;
    setChosenDest(next);
    setPickedId(null);
    setListOpen(true);
    setListExpanded(false);
    setFutureAsk(null);
    setTagId(null);
    clearAsset();
    if (next != null) setRecordKind('expense');
    create.reset();
    createEntry.reset();
  }

  /**
   * 카테고리를 눌렀을 때. 금액이 이미 있으면 누르는 것이 곧 저장이다(가장 짧은 길).
   * 금액이 아직 없으면 고르기만 하고 목록을 접는다.
   */
  function pickCategory(category: CategoryOut): void {
    if (amount > 0) {
      requestSave(category, amount);
      return;
    }
    setPickedId(category.id);
    setListOpen(false);
  }

  // 저장 버튼은 카테고리를 골라 목록을 접었을 때만 나온다. 목록을 펴면 칩이 곧 저장이다.
  // 이체는 고를 분류가 없어 금액만 있으면 바로 저장한다.
  const saveTarget = listOpen ? null : picked;
  const canSave = isTransfer || isSave || saveTarget != null;

  const photoNote = <PhotoCreditLine credits={photoCredits} />;

  return (
    <div className="record" ref={rootRef}>
      {!done && step === 'setup' ? (
        <RecordSetup
          dayWord={nearDayWord(recordDay, today)}
          dayLabel={dayWithWeekday(recordDay)}
          way={tab}
          kind={recordKind}
          expenseOnly={shared}
          destination={
            // 공유 가계부가 없으면 아예 안 선다. 그 사람의 첫 화면은 방법과 종류뿐이다.
            hasShared ? (
              <BookDestinationRow
                className="record-setup__dest"
                books={activeBooks}
                value={destination}
                preferredId={bookId}
                disabled={busy || pending > 0}
                onChange={chooseDestination}
              />
            ) : null
          }
          photoNote={photoNote}
          onBack={onLeave}
          onOpenDay={() => go('day')}
          onWayChange={chooseWay}
          onKindChange={chooseKind}
          onNext={next}
        />
      ) : null}

      {!done && step === 'day' ? (
        <RecordDayStep
          value={recordDay}
          today={today}
          oldest={oldestDay()}
          onBack={() => back('sheet')}
          onPick={(chosen) => {
            setRecordDay(chosen);
            go('setup');
          }}
        />
      ) : null}

      {!done && step === 'tag' ? (
        <RecordTagStep
          kind={kind}
          tags={kindTags}
          failed={tags.isError && kindTags == null}
          onRetry={() => void tags.refetch()}
          selectedId={tagId}
          composing={tagFormOpen}
          onBack={() => back('sheet')}
          onCompose={() => setTagComposing(true)}
          onPick={(next) => {
            setTagId(next);
            setTagComposing(false);
            go('amount');
          }}
          onCreated={(created) => {
            // 만든 태그가 골라진 채 금액 화면으로 돌아간다.
            if (created != null) setTagId(created.id);
            setTagComposing(false);
            go('amount');
          }}
        />
      ) : null}

      {/* 「다른 곳」. 고르면 둘째 화면으로 돌아가 그 항목이 골라져 있다. */}
      {!done && step === 'dest' ? (
        <AssetDestSource>
          {({ destinations }) => (
            <AssetDestList
              destinations={destinations}
              value={assetDest}
              onPick={pickDest}
              onNew={() => go('item')}
              onBack={() => back('sheet')}
            />
          )}
        </AssetDestSource>
      ) : null}

      {/* 새 종목이나 통장. 서버에는 저장할 때 함께 만든다. */}
      {!done && step === 'item' ? (
        <AssetDestSource>
          {({ destinations }) => (
            <NewAssetForm
              destinations={destinations}
              onDone={pickDest}
              onBack={() => back('sheet')}
            />
          )}
        </AssetDestSource>
      ) : null}

      {/*
        패널은 감추기만 하고 남겨 둔다. 언마운트하면 적어 둔 줄글과 검토 목록이 사라진다.
        버리고 나갈 때만 key 를 올려 새로 세운다.
      */}
      <div className="record__panel" data-record-step="" hidden={!panelShown || tab !== 'nl'}>
        <SheetHeader onBack={() => back('sheet')} title="글로 쓰기" backDisabled={busy} />
        <NaturalLanguageTab
          key={panelKeys.nl}
          flowId={flowId}
          baseDay={isBackfill ? recordDay : null}
          bookId={destination}
          onBusyChange={markBusy}
          onReviewChange={trackReview('nl')}
          draftRef={nlDraftRef}
          discardRef={nlDiscardRef}
          saveTimes={importTimes}
          onDone={finish}
          onSaved={(savedDay, savedBook) => afterImportSaved('nl', savedDay, savedBook)}
        />
      </div>

      <div className="record__panel" data-record-step="" hidden={!panelShown || tab !== 'capture'}>
        <SheetHeader onBack={() => back('sheet')} title="캡처로 정리" backDisabled={busy} />
        <ImageImportTab
          key={panelKeys.capture}
          ref={captureRef}
          kind="capture"
          flowId={flowId}
          baseDay={isBackfill ? recordDay : null}
          bookId={destination}
          onBusyChange={markBusy}
          onReviewChange={trackReview('capture')}
          discardRef={captureDiscardRef}
          saveTimes={importTimes}
          onDone={finish}
          onSaved={(savedDay, savedBook) => afterImportSaved('capture', savedDay, savedBook)}
          // 권한이 꺼져 있거나 못 쓰는 자리에서 빠져나갈 데가 없으면 그 사람은 기록을 포기한다.
          fallbackAction={keypadFallback}
          credits={photoCredits}
        />
      </div>

      <div className="record__panel" data-record-step="" hidden={!panelShown || tab !== 'receipt'}>
        <SheetHeader onBack={() => back('sheet')} title="영수증 찍기" backDisabled={busy} />
        <ImageImportTab
          key={panelKeys.receipt}
          ref={receiptRef}
          kind="receipt"
          flowId={flowId}
          baseDay={isBackfill ? recordDay : null}
          bookId={destination}
          onBusyChange={markBusy}
          onReviewChange={trackReview('receipt')}
          discardRef={receiptDiscardRef}
          saveTimes={importTimes}
          onDone={finish}
          onSaved={(savedDay, savedBook) => afterImportSaved('receipt', savedDay, savedBook)}
          fallbackAction={keypadFallback}
          credits={photoCredits}
        />
      </div>

      {/*
        저장 뒤 확인 화면. 다른 패널과 나란히 서서, 여기 떠 있는 동안에도 그쪽이 들고 있는
        것을 잃지 않는다. 「확인」 을 누르면 finish() 가 남은 검토 목록으로 데려간다.
      */}
      {saved?.asset != null ? (
        <div className="record__panel">
          <SavedAssetPanel
            flowId={flowId}
            transaction={saved.transaction}
            asset={saved.asset}
            onUpdated={(updated) =>
              setSaved((prev) =>
                prev?.asset == null
                  ? prev
                  : {
                      transaction: updated.transaction,
                      feedback: updated.feedback,
                      asset: { ...prev.asset, result: updated.asset ?? prev.asset.result },
                    },
              )
            }
            onConfirm={finish}
            onAssets={openAssets}
            backRef={savedBackRef}
          />
        </div>
      ) : saved != null ? (
        <div className="record__panel">
          <FeedbackPanel
            flowId={flowId}
            // 공유 가계부가 있는 사람에게는 어디에 적혔는지를 먼저 말한다.
            label={hasShared ? '내 가계부에 적었어요' : undefined}
            transaction={saved.transaction}
            feedback={saved.feedback}
            categories={categoriesOfKind(kindOf(saved.transaction.type), allCategories)}
            onUpdated={(updated) => {
              setSaved({ transaction: updated.transaction, feedback: updated.feedback });
            }}
            // 적금 안내로 저축·투자로 바꾸면 저축·투자 저장 뒤 화면으로 갈아 끼운다.
            onSavingConverted={(updated, dest) => {
              setSaved({
                transaction: updated.transaction,
                feedback: updated.feedback,
                asset:
                  updated.asset == null
                    ? null
                    : {
                        result: updated.asset,
                        name: destNameOf(dest),
                        holding: destHoldingOf(dest),
                        unit: unitOf(destKindOf(dest)),
                      },
              });
            }}
            // 여기서 고른 것이 다음 기록에 조용히 채워질 값이다.
            onMethodPicked={(next) => void writeLastMethod(bridge.storage, next)}
            onConfirm={finish}
            backRef={savedBackRef}
            dismissRef={savedDismissRef}
          />
        </div>
      ) : null}

      {savedEntry != null ? (
        <div className="record__panel">
          <BookFeedbackPanel
            flowId={flowId}
            book={activeBooks.find((book) => book.id === savedEntry.book.id) ?? savedEntry.book}
            entry={savedEntry.entry}
            month={savedEntry.month}
            onEntryChange={(entry) =>
              setSavedEntry((prev) => (prev == null ? prev : { ...prev, entry }))
            }
            onConfirm={finish}
            backRef={savedBackRef}
          />
        </div>
      ) : null}

      {/*
        금액 화면. 저장이 끝나면 접는다. 적은 숫자는 이미 저장됐고, 남겨 두면 확인 화면이
        여는 금액 칸과 testid 가 겹친다. tabIndex 는 포커스를 되받을 자리다(-1).
      */}
      {done ? null : (
        <div
          className="record__panel record__amount"
          data-record-step=""
          hidden={creating || step !== 'amount'}
          ref={keypadRef}
          tabIndex={-1}
        >
          <SheetHeader
            onBack={() => back('sheet')}
            title={selling ? '얼마 받았어요?' : AMOUNT_TITLES[recordKind]}
            right={
              tagShown ? (
                <button
                  type="button"
                  className={
                    pickedTag == null ? 'record-tag-chip' : 'record-tag-chip record-tag-chip--on'
                  }
                  style={pickedTag == null ? undefined : tagStyle(pickedTag)}
                  disabled={savingNow}
                  onClick={() => {
                    setTagComposing(false);
                    go('tag');
                  }}
                >
                  ＃ {pickedTag?.name ?? '태그'}
                </button>
              ) : undefined
            }
          />

          <AmountDisplay
            digits={digits}
            // 수량 칸이 있으면 금액 숫자를 눌러 다시 금액을 친다.
            onPress={lot || amountSell ? () => setKeyTarget('amount') : undefined}
            dimmed={typingQty || typingRest || typingCost}
          />

          {saveError ? (
            <p className="record__notice" role="alert">
              {saveError.message}
            </p>
          ) : null}

          {(shared ? destBook == null : categories.isPending) ? (
            <LoadingState size="inline" />
          ) : null}
          {!shared && categories.isError ? (
            <ErrorState
              size="inline"
              title="카테고리를 불러오지 못했어요"
              onRetry={() => void categories.refetch()}
            />
          ) : null}

          {isSave ? (
            <>
              <AssetDestSource>
                {({ destinations, loading }) => (
                  <AssetDestField
                    destinations={destinations}
                    value={assetDest}
                    onPick={pickDest}
                    onOther={() => go('dest')}
                    loading={loading}
                  />
                )}
              </AssetDestSource>
              <SaveLotRow
                showSide={sideShown}
                side={assetSide}
                onSide={chooseSide}
                quantity={
                  lot && assetDest != null
                    ? {
                        label: '수량',
                        text: qtyDigits,
                        unit: unitOf(destKindOf(assetDest)),
                        focused: typingQty,
                        onFocus: () => setKeyTarget('qty'),
                      }
                    : null
                }
                onAll={
                  lot && sellItem != null && quantityValue(sellItem.quantity) != null
                    ? sellAll
                    : amountSell
                      ? sellAllAmount
                      : undefined
                }
                allOn={amountSell && restDigits === '0'}
              />
              {/* 「전부」 가 아니면 남은 금액으로 판 몫을 정한다. */}
              {amountSell && restDigits !== '0' ? (
                <SaveBoxRow
                  box={{
                    label: '남은 금액',
                    text:
                      restDigits == null || restDigits === ''
                        ? ''
                        : formatNumber(toAmount(restDigits)),
                    unit: '원',
                    placeholder: formatCurrency(restAuto),
                    focused: typingRest,
                    onFocus: focusRest,
                  }}
                />
              ) : null}
              {costUnknown ? (
                <SaveBoxRow
                  box={{
                    label: '넣은 돈',
                    text: costDigits === '' ? '' : formatNumber(toAmount(costDigits)),
                    unit: '원',
                    placeholder: '모르면 비워 둬요',
                    focused: typingCost,
                    onFocus: () => setKeyTarget('cost'),
                  }}
                />
              ) : null}
              {sellItem != null && sellCheck?.ok === true ? (
                <SellPreviewCard
                  item={sellItem}
                  preview={sellCheck.preview}
                  soldQuantity={lot ? qtyValue : null}
                />
              ) : null}
            </>
          ) : isTransfer ? null : listOpen || picked == null ? (
            <CategoryPicker
              // 적을 곳마다 새로 세운다. 펼친 상태가 다른 가계부로 따라가지 않게.
              key={destination ?? 'mine'}
              categories={pickable}
              disabled={savingNow}
              onPick={pickCategory}
              // 공유 분류는 관리 화면이 없다. 만들기만 있고, 만든 것은 멤버 모두에게 보인다.
              onManage={shared ? undefined : onManage}
              manageNote={!shared}
              selectedId={pickedId}
              onCreate={() => setCreating(true)}
              onOpenChange={setListExpanded}
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
              disabled={savingNow}
              onClick={() => setListOpen(true)}
            >
              <CategoryAvatar {...iconOf(picked)} size={40} />
              <span className="record__picked-name">{picked.name}</span>
              <span className="record__picked-more">다시 고르기</span>
            </button>
          )}

          {canSave ? (
            <Button
              className="record__save"
              disabled={amount <= 0 || savingNow || (isSave && !assetReady)}
              aria-busy={savingNow}
              onClick={() => requestSave(isTransfer || isSave ? null : saveTarget, amount)}
            >
              {/* 저장 중인지는 이 버튼이 말한다. 칩으로 저장할 때는 칩이 모두 잠긴다. */}
              {savingNow ? '저장하는 중' : '저장'}
            </Button>
          ) : null}

          {/* 목록을 끝까지 펼친 동안에는 접는다. 고를 것이 화면을 채운 자리에 숫자판까지 서면 혼선만 는다. */}
          {listExpanded ? null : typingQty ? (
            <Keypad digits={qtyDigits} onChange={typeQuantity} decimal />
          ) : typingRest ? (
            <Keypad digits={restDigits ?? ''} onChange={setRestDigits} />
          ) : typingCost ? (
            <Keypad digits={costDigits} onChange={setCostDigits} />
          ) : (
            <Keypad digits={digits} onChange={setDigits} />
          )}

          {/* 앞날에 적으려 할 때만 선다. 막는 것이 아니라 한 번 확인하는 자리다. */}
          {futureAsk != null ? (
            <FutureDayConfirm
              day={recordDay}
              // 날짜 칸은 첫 화면에만 있어 「언제예요?」 로 곧장 보낸다.
              onFix={() => {
                setFutureAsk(null);
                go('day');
              }}
              onSave={() => save(futureAsk.category, futureAsk.amount)}
            />
          ) : null}
        </div>
      )}

      {/*
        새 분류 만들기. **시트 안쪽을 통째로 쓴다.** 「이전·저장」 이 맨 위에 붙어 아이콘 격자를
        내려도 늘 보인다.
      */}
      {creating ? (
        <div className="record__compose">
          <CategoryEditForm
            layout="page"
            // 종류는 첫 화면에서 이미 골랐다. 여기서 다시 묻지 않는다.
            fixedKind={kind}
            // 공유 가계부에 적는 중이면 그 가계부 분류를 만든다.
            bookId={destination}
            // 저장하는 동안에는 시트가 안 닫힌다. 닫히면 적어 둔 이름과 고른 그림이 함께 사라진다.
            onBusyChange={markBusy}
            dirtyRef={composeDirtyRef}
            onBack={requestLeaveCompose}
            // 만들기가 끝나 닫히는 길. 돌아오면 방금 만든 분류가 골라져 있다.
            onClose={() => {
              setCreating(false);
              composeDirtyRef.current = false;
              setFocusAfter('pickedCategory');
            }}
            // 만든 것을 골라 두기만 하고 저장까지 하지는 않는다. 저장은 그 사람이 누른다.
            onCreated={(created) => {
              setPickedId(created.id);
              setListOpen(false);
            }}
          />
          {composeAsking ? (
            <LeaveConfirm
              text="만들던 분류가 사라져요. 그만둘까요?"
              onStay={() => setComposeAsking(false)}
              onLeave={() => {
                setComposeAsking(false);
                leaveCompose();
              }}
            />
          ) : null}
        </div>
      ) : null}

      {panelAsk != null ? (
        <LeaveConfirm
          text={`읽어 온 ${panelAsk.count}건이 사라져요`}
          leaveLabel="나가기"
          ariaLabel="나갈까요"
          onStay={stayPanel}
          onLeave={leavePanel}
        />
      ) : null}
    </div>
  );
}
