import { useEffect, useId, useRef, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { ROUTES } from '../../app/router/routes';

import { useBridge, useOverlayBackClose } from '../../app/providers';
import { bumpRecordCount } from '../../shared/lib/homeAddSeen';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  formatDayLabel,
  isFutureDay,
  shiftMonth,
  toLedgerDate,
  toLedgerNoonIso,
} from '../../shared/lib/format';
import { DAY_MAX } from '../../shared/lib/limits';
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
  FutureDayConfirm,
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
  LeaveConfirm,
  LoadingState,
  SegmentedControl,
  iconOf,
  type SegmentedOption,
} from '../../shared/ui';

import { CategoryEditForm } from '../categories';
import { ImageImportTab, NaturalLanguageTab, usePhotoCredits } from '../imports';

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
 * - `deeplink`     바깥에서 `/record` 로 곧장 들어왔다. 미니앱 상세의 주요 기능 「지출 기록하기」 가 여기로 온다
 */
export type RecordFrom = 'home' | 'home_day' | 'calendar_day' | 'deeplink';

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

/**
 * 전환 뒤 포커스가 갈 자리.
 *
 * 이체를 켜고 끄는 줄과 새 분류를 열고 닫는 길은 **누른 버튼이 그 클릭으로 사라진다.**
 * 그냥 두면 포커스가 시트 밖 body 로 떨어져, 읽는 프로그램에는 무엇이 바뀌었는지 한마디도
 * 안 닿고 다음 Tab 이 시트 뒤 화면부터 다시 돈다. 그래서 바뀐 화면에서 **그 일을 되돌릴
 * 버튼**으로 옮긴다. 되돌릴 자리가 곧 「여기가 지금 어디인가」 를 읽어 주는 자리다.
 *
 * 찾는 범위는 키패드 탭 안으로 못 박는다(`keypadRef`). 감춰 둔 줄글·검토 탭에도 같은
 * 분류 칩이 서 있어서, 시트 전체에서 찾으면 안 보이는 쪽이 먼저 잡힌다.
 */
const FOCUS_AFTER = {
  transferOff: '.record__transfer-off',
  transferOpen: '.record__transfer-open',
  newCategoryChip: '.cat-chips__item--new',
  pickedCategory: '.record__picked',
} as const;

type FocusAfter = keyof typeof FOCUS_AFTER;

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
  /*
    읽어 온 것 말고 **손으로 적어 둔 것**이 있나.

    예전에는 읽어 온 건수만 봤다. 금액을 눌러 두고, 줄글을 적어 두고, 새 분류 이름을
    적어 둔 사람은 손잡이를 스치는 순간 아무 말 없이 다 잃었다(2026-09-25 신고).

    **상태가 아니라 물어보는 함수다.** 안쪽에서 상태로 올리면 한 박자 늦는다. 적자마자
    닫는 손짓에서 아직 거짓인 값을 보고 확인 없이 닫혔다. 나갈 때 그 자리에서 센다.
  */
  const draftedRef = useRef(() => false);
  /** 지금 분류를 만드는 중인가. 문구가 잃을 범위를 말해야 해서 바깥도 알아야 한다. */
  const composingRef = useRef(false);
  /*
    🔴 **만드는 중에 닫는 손짓은 한 겹만 접는다**(2026-09-25 밤 신고).

    이 화면은 덮는 창이 아니라 **시트 안쪽을 통째로 바꾸는 방식**이라, 본문을 잡아 내리면
    시트의 밀어 닫기가 그대로 돌아 기록 시트째 사라졌다. 적어 둔 금액과 고른 날까지 함께
    갔다. 딤을 누르는 길도 같았다. 뒤로가기와 Esc 는 이미 이렇게 접고 있었는데 손짓만
    빠져 있었다. 같은 화면에서 닫는 길마다 잃는 것이 다르면 안 된다.
  */
  const leaveComposeRef = useRef(() => {});
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
    // 이미 묻는 중이면 또 안 묻는다. 분모가 부풀면 이 물음이 방해였는지 안전장치였는지 못 가린다.
    if (asking) return;
    const drafted = draftedRef.current();
    if (pending > 0 || drafted) {
      analytics.log(
        EVENTS.recordLeaveAsked,
        /*
          **왜 물었는지를 함께 남긴다.** 읽어 온 것 때문인지 손으로 적은 것 때문인지
          안 가르면, 이번에 늘린 자리가 사람을 구했는지 방해했는지를 잴 수 없다.
        */
        { result: 'asked', pending, reason: pending > 0 ? 'parsed' : 'typed' },
        { kind: 'impression' },
      );
      setLeaveTo(where);
      setAsking(true);
      return;
    }
    leave(where);
  }

  function requestClose(): void {
    // 만드는 중이면 만들기만 접고 기록 화면으로 돌아간다. 묻는 일은 그쪽이 한다.
    if (composingRef.current) {
      leaveComposeRef.current();
      return;
    }
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
      /*
        검토 화면은 고칠 칸이 많다. 내용만큼 열면 저장 버튼이 접힌 아래로 밀린다.

        **새 분류 만들기는 내용만큼 연다.** 거기서는 「이전·저장」 이 맨 위에 붙어 있어 높이를
        못 박을 이유가 없고, 못 박으면 이름 칸 하나만 물은 화면이 화면 높이의 태반을 빈 채로 먹는다.
        아이콘 격자를 펴면 그때 시트가 알아서 자란다.
      */
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
        draftedRef={draftedRef}
        composingRef={composingRef}
        leaveComposeRef={leaveComposeRef}
        onReviewingChange={setReviewing}
      />
      {asking ? (
        <LeaveConfirm
          /*
            **잃는 범위를 문구가 말한다.** 분류를 만들던 중에 시트를 닫으면 만들던 분류만
            사라지는 것이 아니라 눌러 둔 금액까지 함께 사라진다. 바로 앞에서 「이전」 을
            눌렀을 때는 금액이 남았으므로, 같은 문구면 같은 결과일 것으로 읽는다.
          */
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
 * 읽어 온 것이 있으면 건수를 먼저 말한다. 그쪽이 더 크고, 몇 건인지가 판단을 바꾼다.
 * 손으로 적어 둔 것이 함께 있으면 그것도 붙인다. 한쪽만 말하면 남은 쪽은 말없이 사라진다.
 */
function leaveText(pending: number, composing: boolean): string {
  const lost = [
    pending > 0 ? `읽어 온 ${pending}건` : null,
    composing ? '만들던 분류' : null,
  ].filter((part) => part != null);
  if (lost.length === 0) return '적던 내용이 사라져요. 그만둘까요?';
  const joined = lost.join('과 ');
  // 「3건이」 와 「분류가」. 받침이 있는지로 갈린다. 한쪽으로 못 박으면 한 경우가 어색해진다.
  return `${joined}${hasFinalConsonant(joined) ? '이' : '가'} 사라져요. 그만둘까요?`;
}

/** 마지막 글자에 받침이 있나. 한글이 아니면 없는 것으로 본다. */
function hasFinalConsonant(word: string): boolean {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
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
  draftedRef,
  composingRef,
  leaveComposeRef,
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
  /** 손으로 적어 둔 것이 있나 묻는 함수를 여기 걸어 둔다. 금액·줄글 초안·만들던 분류를 묶는다. */
  draftedRef: { current: () => boolean };
  /** 지금 분류를 만드는 중인가. 바깥의 확인 문구가 잃을 범위를 말하는 데 쓴다. */
  composingRef: { current: boolean };
  /** 만들기만 접는 길. 시트를 닫으려는 손짓·딤이 만드는 중에는 이리로 온다. */
  leaveComposeRef: { current: () => void };
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
    지난 날에도 네 방식을 다 쓴다.

    예전에는 키패드만 열어 뒀다. 고른 날이 키패드에만 붙어서, 줄글 탭이 열린 채
    「9월 5일 기록하기」 를 누르면 고른 날이 말없이 버려지고 오늘에 저장됐기 때문이다.
    잠그는 것은 그 증상을 가린 것이지 원인을 고친 것이 아니었다.

    지금은 고른 날을 세 탭에 함께 내려보낸다(`baseDay`). 적힌 날짜가 있으면 그쪽이 이기고,
    못 찾은 줄만 고른 날로 간다. 그래서 잠글 이유가 없어졌다.
  */
  const [tab, setTab] = useState<RecordTab>(
    openedOnPastDay ? 'keypad' : (initialTab ?? DEFAULT_RECORD_TAB),
  );
  /*
    남은 사진 장수. **캡처와 영수증이 하나를 나눠 쓴다.**

    값이 드는 것은 사진을 읽는 일이지 어디서 가져왔는지가 아니다. 탭마다 따로 세면 두 탭이
    동시에 떠 있어서(`hidden` 으로 감출 뿐이다) 한쪽에서 쓴 것이 다른 쪽에 안 비쳤다.
  */
  const photoCredits = usePhotoCredits(flowId);
  /** 사진이 막혔을 때 갈 길. 두 탭이 같은 버튼을 쓴다. */
  const keypadFallback = (
    <Button variant="ghost" onClick={() => setTab('keypad')}>
      키패드로 입력
    </Button>
  );
  // 지출인가 수입인가. 이 값이 고를 수 있는 분류와 저장할 종류를 함께 정한다.
  const [kind, setKind] = useState<LedgerKind>('expense');
  /*
    **이체는 알약에 안 태운다.** 알약 하나가 84px 이고 오른쪽에 날짜 칩이 서 있어,
    셋을 나란히 두면 좁은 화면에서 날짜가 아래로 밀린다. 지출·수입에만 쓰는 사람이
    읽을 것이 느는 것도 값이다(ADR-0015 가 같은 이유로 세 알약을 버렸다).

    대신 아래 조용한 줄 하나로 켠다. 이체는 집계 어디에도 안 들어가서(ADR-0005)
    분류를 고를 자리가 없고, 켜는 순간 분류 목록이 사라지고 저장 버튼이 바로 선다.
  */
  const [isTransfer, setIsTransfer] = useState(false);
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
    분류 목록을 「더 보기」 로 끝까지 펼쳤나.

    다 펼치면 칩이 화면을 채워 키패드가 접힌 아래로 밀리는데, 거기서도 숫자가 눌린다.
    지금 고르는 중인지 적는 중인지가 흐려진다는 말을 들었다. **펼친 동안에는 키패드를 감춘다.**
    금액은 위에 그대로 적혀 있고, 하나를 고르거나 접으면 바로 돌아온다.
  */
  const [listExpanded, setListExpanded] = useState(false);
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
    분류 만들기 화면이 열렸나.

    **시트를 하나 더 띄우지 않는다.** 적던 금액이 살아 있어야 만들고 나서 그대로 이어
    적을 수 있다. 시트가 둘이면 닫을 때 어디로 돌아가는지도 흔들린다.
    대신 **시트 안쪽을 통째로 바꾼다.** 탭도 금액도 키패드도 감춘다. 만드는 중에 숫자를
    누를 수 있으면 지금 무엇을 하는 화면인지가 흐려진다.
    감추기만 하고 트리에서 빼지 않는다. 빼면 다른 탭이 읽어 둔 것이 함께 사라진다.
  */
  const [creating, setCreating] = useState(false);
  /** 만들던 분류에 적어 둔 것이 있나. 시트를 닫을 때 물을지를 이 값도 함께 정한다. */
  const composeDirtyRef = useRef(false);
  /*
    만들기를 그만두려는데 적어 둔 것이 있나.

    **덮는 창(`CategoryComposeOverlay`)과 같은 규칙이다.** 키패드에서는 시트 안쪽을
    통째로 바꾸는 방식이라 창을 안 쓰는데, 그 차이가 사용자에게 보이면 안 된다.
    한쪽만 묻고 다른 쪽은 그냥 닫으면 어디서 열었는지에 따라 잃는 것이 달라진다.
  */
  const [composeAsking, setComposeAsking] = useState(false);
  /** 줄글 탭에 아직 안 읽힌 글이 적혀 있나. 그 탭이 그릴 때마다 여기 적는다. */
  const nlDraftRef = useRef(false);

  /*
    만드는 중에 누른 시스템 뒤로가기.

    **시트를 닫지 않고 만들기만 닫는다.** 이 화면은 시트 안쪽을 통째로 먹고 맨 위에
    「이전」 이 붙어 있어, 뒤로가기도 그 「이전」 과 같은 일을 할 것으로 읽힌다. 시트째
    닫히면 적던 이름과 고른 그림은 물론 금액과 고른 날까지 확인 한 번 없이 사라진다
    (읽어 둔 것이 없으면 확인 창도 안 뜬다).

    나중에 등록한 것이 스택 맨 위라, 만드는 동안에는 시트의 닫기보다 이쪽이 먼저 받는다.
  */
  /** 만들기를 접고 기록 화면으로 돌아간다. 묻는 일은 부르는 쪽이 이미 끝냈다. */
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

  useOverlayBackClose(creating, requestLeaveCompose, busy);

  /*
    만드는 중에 누른 Esc.

    **여기서 삼키지 않으면 시트가 통째로 닫히려 든다.** 덮는 창(`CategoryComposeOverlay`)
    쪽은 이미 삼키고 있는데, 키패드에서는 시트 안쪽을 바꾸는 방식이라 그 창을 안 쓴다.
    같은 화면에서 같은 키가 다른 일을 하면 안 된다. 시스템 뒤로가기는 만들기만 접는데
    Esc 는 금액까지 버리는 어긋남이 실제로 있었다.

    시트도 `document` 에 리스너를 달아 두어서 전파를 끊는 것으로는 부족하다.
    같은 노드의 다른 리스너까지 막으려면 `stopImmediatePropagation` 이라야 한다.
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

  /*
    전환 뒤에 포커스를 옮길 자리. 옮기고 나면 비운다.

    `FOCUS_AFTER` 주석에 왜 옮기는지 적어 뒀다. 키패드 탭 안에서만 찾는다.
  */
  const keypadRef = useRef<HTMLDivElement>(null);
  const [focusAfter, setFocusAfter] = useState<FocusAfter | null>(null);

  useEffect(() => {
    if (focusAfter == null) return;
    setFocusAfter(null);
    const spot = keypadRef.current?.querySelector<HTMLElement>(FOCUS_AFTER[focusAfter]);
    // 못 찾아도 body 로는 안 보낸다. 시트 안에 남아 있어야 Tab 이 뒤 화면으로 새지 않는다.
    (spot ?? keypadRef.current)?.focus();
  }, [focusAfter]);

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

  /**
   * 저장하려다 앞날이라 물어보는 중. 누르면 그대로 이어서 저장한다.
   *
   * 고른 분류와 금액을 여기 들고 있는다. 물어보는 사이에 화면이 바뀌어도 저장할 것이
   * 흔들리지 않게 한다.
   */
  const [futureAsk, setFutureAsk] = useState<{
    category: CategoryOut | null;
    amount: number;
  } | null>(null);

  function requestSave(category: CategoryOut | null, amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    // 아직 오지 않은 날이면 한 번 묻는다. 막지는 않는다.
    if (isFutureDay(recordDay)) {
      setFutureAsk({ category, amount });
      return;
    }
    save(category, amount);
  }

  function save(category: CategoryOut | null, amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;

    setFutureAsk(null);
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
        type: isTransfer ? 'transfer' : kind,
        // 이체에는 분류가 없다. 집계 어디에도 안 들어가서 골라도 보일 자리가 없다(ADR-0005).
        category_id: category?.id ?? null,
        source: 'keypad',
        // 손으로 직접 누른 값이라 분류를 의심할 이유가 없다.
        confidence: 1,
        excluded_from_budget: false,
        // 수입에는 뜻이 없다. 보내도 서버가 버리지만 여기서도 안 보낸다.
        payment_method: !isTransfer && kind === 'expense' ? method : null,
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

  /*
    손으로 적어 둔 것 셋을 한 값으로 묶는다.

    금액을 눌렀거나, 줄글을 적어 뒀거나, 분류를 만들던 중이면 시트가 닫힐 때 잃는다.
    고른 분류·켜 둔 이체 같은 것은 안 센다. 되돌리는 데 한 번 누르면 되는 값이라,
    그것까지 물으면 확인 창이 너무 자주 떠 진짜 물어야 할 때 안 읽힌다.

    **저장이 끝났으면 키패드에 눌러 둔 숫자는 안 센다.** 그것은 방금 저장한 그 금액이라
    버리는 것이 없다. 다른 탭의 줄글 초안과 만들던 분류는 저장과 무관하게 그대로 잃으므로
    계속 센다. 예전에는 저장 한 번이 셋을 다 덮어, 열 줄 적어 둔 줄글이 말없이 사라졌다.
  */
  draftedRef.current = () =>
    (!done && digits !== '') || nlDraftRef.current || composeDirtyRef.current;
  composingRef.current = creating;
  leaveComposeRef.current = requestLeaveCompose;

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
      requestSave(category, amount);
      return;
    }
    setPickedId(category.id);
    setListOpen(false);
  }

  // 저장 버튼은 카테고리를 골라 목록을 접었을 때만 나온다. 목록을 다시 펴면 칩을 누르는
  // 것이 곧 저장이라 버튼이 없다. 힌트가 같은 값을 봐야 없는 버튼을 가리키지 않는다.
  // 이체는 고를 분류가 없어 금액만 있으면 바로 저장한다.
  const saveTarget = listOpen ? null : picked;
  const canSave = isTransfer || saveTarget != null;

  let hint = '금액을 누르고 카테고리를 고르면 바로 저장돼요';
  if (create.isPending) hint = '저장하는 중이에요';
  else if (isTransfer) hint = amount > 0 ? '저장을 누르면 기록돼요' : '금액을 누르면 저장돼요';
  else if (saveTarget != null && amount > 0) hint = '저장을 누르면 기록돼요';
  else if (amount > 0) hint = '카테고리를 고르면 저장돼요';
  else if (picked) hint = '금액을 누르면 저장할 수 있어요';

  return (
    <div className="record">
      {done || creating ? null : (
        <>
          <SegmentedControl
            className="record__tabs"
            options={TABS.map((option) =>
              option.value === tab ? option : { ...option, disabled: option.disabled || busy },
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
            어느 날에 떨어지는지 미리 말해 둔다. 적힌 날짜가 있으면 그쪽으로 가므로
            「무조건 이 날」 이라고 적으면 거짓말이 된다. 읽는 프로그램에도 이 줄이
            바뀌는 순간 한 번 읽히게 한다.
          */}
          {isBackfill && tab !== 'keypad' ? (
            <p className="record__hint" role="status">
              날짜가 없는 건 {dayChipLabel}로 적어요
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
        <div className="record__panel" hidden={done || creating || tab !== 'nl'}>
          <NaturalLanguageTab
            flowId={flowId}
            baseDay={isBackfill ? recordDay : null}
            onBusyChange={markBusy}
            onReviewChange={trackReview('nl')}
            draftRef={nlDraftRef}
            onDone={finish}
            onSaved={(savedDay) => {
              rememberMethod();
              markRecorded();
              if (savedDay != null) tellRecorded(savedDay);
            }}
          />
        </div>

        <div className="record__panel" hidden={done || creating || tab !== 'capture'}>
          <ImageImportTab
            kind="capture"
            flowId={flowId}
            baseDay={isBackfill ? recordDay : null}
            onBusyChange={markBusy}
            onReviewChange={trackReview('capture')}
            onDone={finish}
            onSaved={(savedDay) => {
              rememberMethod();
              markRecorded();
              if (savedDay != null) tellRecorded(savedDay);
            }}
            // 캡처에도 같은 길을 둔다. 권한이 꺼져 있거나 오늘 몫을 다 쓴 자리에서
            // 빠져나갈 데가 없으면 그 사람은 기록 자체를 포기한다.
            fallbackAction={keypadFallback}
            credits={photoCredits}
          />
        </div>

        <div className="record__panel" hidden={done || creating || tab !== 'receipt'}>
          <ImageImportTab
            kind="receipt"
            flowId={flowId}
            baseDay={isBackfill ? recordDay : null}
            onBusyChange={markBusy}
            onReviewChange={trackReview('receipt')}
            onDone={finish}
            onSaved={(savedDay) => {
              rememberMethod();
              markRecorded();
              if (savedDay != null) tellRecorded(savedDay);
            }}
            // 사진으로 안 되면 손으로 찍는 길이 바로 옆에 있어야 한다. 여기서 막히면 기록을 포기한다.
            fallbackAction={keypadFallback}
            credits={photoCredits}
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
        /* tabIndex 는 포커스를 되받을 자리다. Tab 순서에는 안 들어간다(-1). */
        <div
          className="record__panel"
          hidden={creating || tab !== 'keypad'}
          ref={keypadRef}
          tabIndex={-1}
        >
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

              **이체를 켜 두면 잠근다.** 저장은 `isTransfer` 를 먼저 보므로 여기서 고른
              지출·수입은 버려진다. 누를 수 있게 두면 「수입」 을 눌러 놓고 이체로 저장되어,
              이번 달 번 돈이 안 오르는 것을 한참 뒤에 발견한다(이체는 집계 밖이다, ADR-0005).
              왜 잠겼는지는 아래 이체 줄이 이미 말하고 있고, 거기서 한 번 눌러 되돌아온다.
            */}
            <KindToggle
              className="record__kind"
              value={kind}
              disabled={create.isPending || isTransfer}
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
                /*
                  **앞날을 막지 않는다.** 미리 나갈 돈을 적어 두는 사람이 있다. 대신 저장할
                  때 한 번 묻는다(`FutureDayConfirm`). 칸에서 잠그면 그 사람은 아예 못 적는다.
                */
                max={DAY_MAX}
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

          {isTransfer ? (
            /*
              분류 자리를 이 줄이 대신한다. 감추기만 하면 무엇이 달라졌는지 안 보여서,
              이체인 줄 모르고 저장하는 사람이 생긴다.
            */
            <div className="record__transfer" role="status">
              <span className="record__transfer-title">계좌 사이 옮긴 돈</span>
              <span className="record__transfer-note">이번 달 지출과 수입에는 안 들어가요</span>
              <button
                type="button"
                className="record__transfer-off"
                disabled={create.isPending}
                onClick={() => {
                  setIsTransfer(false);
                  setFocusAfter('transferOpen');
                }}
              >
                지출이나 수입으로 적기
              </button>
            </div>
          ) : listOpen || picked == null ? (
            <CategoryPicker
              categories={pickable}
              disabled={create.isPending}
              onPick={pickCategory}
              onManage={onManage}
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
              disabled={create.isPending}
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
              disabled={amount <= 0 || create.isPending}
              onClick={() => requestSave(isTransfer ? null : saveTarget, amount)}
            >
              저장
            </Button>
          ) : null}

          {/*
            이체로 들어가는 입구. **분류 목록 아래, 저장 버튼 아래에 둔다.** 이체는 드물게
            쓰는 것이라 위에 두면 지출을 적으러 온 사람이 매번 읽고 지나쳐야 한다.
          */}
          {isTransfer ? null : (
            <button
              type="button"
              className="record__transfer-open"
              disabled={create.isPending}
              onClick={() => {
                setIsTransfer(true);
                setFocusAfter('transferOff');
              }}
            >
              계좌 사이 옮긴 돈이에요
            </button>
          )}

          {/* 목록을 끝까지 펼친 동안에는 접는다. 고를 것이 화면을 채운 자리에 숫자판까지 서면 혼선만 는다. */}
          {listExpanded ? null : <Keypad digits={digits} onChange={setDigits} />}

          {/* 앞날에 적으려 할 때만 선다. 막는 것이 아니라 한 번 확인하는 자리다. */}
          {futureAsk != null ? (
            <FutureDayConfirm
              day={recordDay}
              onFix={() => setFutureAsk(null)}
              onSave={() => save(futureAsk.category, futureAsk.amount)}
            />
          ) : null}
        </div>
      )}

      {/*
        새 분류 만들기. **시트 안쪽을 통째로 쓴다.**

        회색 상자 안에 넣지 않는다. 상자 안에 버튼을 두면 시트 바닥에 붙는 규칙이 상자 밖에
        가서 선다(categories.css 의 `cat-sheet__foot` 주석). 여기서는 화면 자체가 이 폼이고,
        「이전·저장」 이 맨 위에 붙어 아이콘 격자를 내려도 늘 보인다.
      */}
      {creating ? (
        <div className="record__compose">
          <CategoryEditForm
            layout="page"
            // 종류는 위에서 이미 골랐다. 여기서 다시 묻지 않는다.
            fixedKind={kind}
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
            /*
              만든 것을 골라 두기만 하고 **저장까지 하지는 않는다.** 적던 금액과 고른 날이
              그대로 있는 기록 화면으로 돌아와, 저장은 그 사람이 누른다. 만들자마자 저장되면
              이어서 적으려던 사람이 확인 화면 앞에 서 있게 된다.
            */
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
