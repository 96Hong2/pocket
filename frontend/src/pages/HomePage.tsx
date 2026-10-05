import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

import { IdentityNotice } from '../app/IdentityNotice';
import { useBookView, useBridge, useIdentity, useOnboardingShowing } from '../app/providers';
import { RECORD_QUERY } from '../app/router/routes';
import { AdSlot } from '../features/ads';
import { BookChip, BookHome } from '../features/books';
import { AddToHomeCard } from '../features/home-add';
import { RemindCard, useRemindNudge } from '../features/notifications';
import { RecurringDueCard } from '../features/recurring';
import {
  BooksIntroCard,
  BudgetSuggestCard,
  ClosingEntryCard,
  GoalDoneCard,
  GoalStatusCard,
  HomeHero,
  RecoveryCard,
  ReviewAskCard,
  ShareAppCard,
  StreakCelebration,
  TodayList,
  pickHomeNotice,
  resolveHeroLayout,
  resolveHomeView,
  toHomeViewInput,
  useCardDismiss,
  useClosingEntry,
  useNudgeQuiet,
} from '../features/home';
import { QuickRecordSheet, type RecordFrom, type RecordTab } from '../features/quick-record';
import { EditSheet } from '../features/transactions';
// 방식 → 탭 환산은 시트 옆에 있다. 배럴에는 시트만 나와 있어 파일을 곧장 가리킨다.
import { DEFAULT_RECORD_TAB } from '../features/quick-record/recordTab';
import {
  useBooks,
  useBudget,
  useCategories,
  useGoal,
  useMe,
  useNotificationSettings,
  usePreferences,
  useRecurringDue,
  useSharedBooksEnabled,
  useTransactions,
  type TransactionOut,
} from '../shared/api';
import { shiftDay, toLedgerDate } from '../shared/lib/format';
import { Button, ErrorState, LoadingState, iconUrl } from '../shared/ui';

/**
 * 홈에서 가장 큰 버튼.
 *
 * 예전 이름은 「10초 기록」 이었다. 앱 이름을 그대로 버튼에 얹은 것인데, 처음 열어 본
 * 사람이 이게 기록하는 자리인지 걸린 시간을 말하는 건지 몰라 헤맸다.
 * **버튼에는 브랜드가 아니라 할 일을 적는다.**
 */
function RecordButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      className="home-cta"
      fullWidth
      onClick={onClick}
      leadingIcon={
        <img className="home-cta__icon" src={iconUrl('01_coins')} alt="" aria-hidden="true" />
      }
    >
      기록하기
    </Button>
  );
}

function HomeContent({
  day,
  onDayChange,
  onRecord,
  recording,
}: {
  /** 아래 목록이 보고 있는 날. 기록 시트가 저장한 날로 옮길 수 있어야 해서 밖에서 들고 있다. */
  day: string;
  onDayChange: (day: string) => void;
  onRecord: (tab: RecordTab, day?: string, from?: RecordFrom) => void;
  /** 기록 시트가 떠 있나. 7일 축하가 그 위로 겹쳐 뜨지 않게 기다리는 데 쓴다. */
  recording: boolean;
}) {
  const { state } = useIdentity();
  // 별점 창을 못 띄우는 토스 버전에서는 권유 카드를 아예 안 그린다.
  const bridge = useBridge();
  // 홈에서 바로 고친다. 여기서 못 고치면 달력까지 들어가야 해서 아무도 안 고친다.
  const [editing, setEditing] = useState<TransactionOut | null>(null);
  const today = toLedgerDate(new Date());
  const budget = useBudget();
  const categories = useCategories();
  /*
    오늘·내일 빠져나갈 돈. 카드 자체는 `RecurringDueCard` 가 그리지만, **떴는지를 여기서도
    알아야** 아래 권유 카드들이 비켜 줄 수 있다. 캐시를 함께 읽으므로 요청이 늘지 않는다.
  */
  const recurringDue = useRecurringDue();
  // 하루치만 받는다. 달을 통째로 받아 화면에서 거르면 지난달로 넘어갈 때 목록이 빈다.
  // 저장·수정은 `transactions` 아래를 통째로 무효화하므로 어느 날을 보고 있어도 함께 새로 온다.
  const transactions = useTransactions({ day });
  const preferences = usePreferences();
  const goal = useGoal();

  /*
    닫아 둔 카드.

    복귀 카드의 표는 **마지막으로 적은 날**이다. 닫은 뒤 하루가 더 지나도 같은 상황이라
    다시 뜨지 않고, 다시 적고 또 며칠 비면 표가 달라져 새로 뜬다.
    예산 카드는 가를 상황이 없다. 한 번 닫으면 예산을 정할 때까지 안 뜬다.
  */
  const away = budget.data?.days_since_last_transaction ?? null;
  const recovery = useCardDismiss(
    'recovery',
    away == null ? '' : shiftDay(toLedgerDate(new Date()), -away),
  );
  const budgetSuggest = useCardDismiss('budget-suggest', '');
  // 공유 권유는 한 번 닫으면 끝이다. 다시 뜰 「달라진 상황」이 없다.
  const shareInvite = useCardDismiss('share-app', '');
  /*
    별점 권유도 한 번뿐이다. 눌렀든 닫았든 다시 안 뜬다.
    별점을 실제로 남겼는지 토스가 알려 주지 않아, 다시 물을 근거가 우리에게 없다.
  */
  const ratingAsk = useCardDismiss('rating-ask', '');
  /*
    홈 화면 추가는 **두 번 묻는다.** 첫 기록 직후와 다섯 번째 기록 때다.
    첫 기록 때는 이 앱을 계속 쓸지조차 모르는 상태라 그때 닫은 것은 대답이 아니다.
    표(mark)로 가르지 않고 키를 둘로 나눈 이유는 `shared/lib/cardDismiss.ts` 에 적어 뒀다.
  */
  const homeAdd = useCardDismiss('home-add', '');
  const homeAddAgain = useCardDismiss('home-add-again', '');
  /*
    저녁 알림은 켤 때까지 **계속 묻되 닫을수록 뜸해진다.** 닫은 뒤 3일, 7일, 14일, 그 뒤로는
    30일마다, 그 사이 세 번은 새로 적었을 때만 다시 선다(`features/notifications/remindCadence.ts`).
  */
  const remindNudge = useRemindNudge(budget.data?.transaction_count ?? null);
  const notificationSettings = useNotificationSettings();
  // 방금 켠 카드는 「알려 드릴게요」 를 말하는 동안 제자리에 있어야 한다. 켜진 설정이 먼저 와도 걷지 않는다.
  const [remindJustOn, setRemindJustOn] = useState(false);
  // 토스 동의를 거절했다. 왜 못 켰는지 적힌 줄을 읽을 수 있게 이번 방문 동안은 제자리에 둔다.
  const [remindDeclined, setRemindDeclined] = useState(false);
  // 한 번뿐인 새 기능 안내. 만들거나 들어간 가계부가 있으면 처음부터 안 뜬다.
  /*
    처음 안내에서 같이 쓰는 가계부 장을 본 사람은 안내가 이 표를 적는다. 홈은 안내 뒤에 이미
    떠 있으므로 안내가 걷힐 때 다시 읽는다.
  */
  const onboardingShowing = useOnboardingShowing();
  const booksIntro = useCardDismiss('books-intro', '', onboardingShowing);
  const booksEnabled = useSharedBooksEnabled();
  const books = useBooks();
  const closingEntry = useClosingEntry();
  const closingMonth = closingEntry.month;
  const me = useMe();
  // 오늘 권유를 하나 닫았으면 다른 권유는 내일로 미룬다.
  const nudgeQuiet = useNudgeQuiet();

  // 식별키가 없으면 조회가 시작되지 않아 pending 이 끝나지 않는다.
  // 아직 오는 중일 때만 기다리게 하고, 실패·미지원은 위 안내가 이유를 말한다.
  if (state.status !== 'ready') {
    return state.status === 'loading' ? (
      <LoadingState label="지금 상태를 불러오는 중이에요" />
    ) : null;
  }

  /*
    **예산 조회를 기다리는 동안에도 기록 버튼은 선다.**

    예전에는 여기서 통째로 return 해서, 조회가 끝날 때까지 화면에 스피너 하나만 있었다.
    서버에 안 닿는 자리에서는 그 스피너가 13초를 갔고, 검수가 「최초 접속 시간 20초 초과」 로
    막은 화면이 그것이다. 실패했을 때 버튼을 남기는 규칙(바로 아래)이 기다리는 동안에는
    안 걸려 있었다. 이 앱의 목적은 기록이라 조회가 어떻든 기록은 되어야 한다(ADR-0026).
  */

  // 예산 조회가 실패하면 히어로 자리만 대신한다.
  // 그 자리에서 통째로 return 하면 '10초 기록' 버튼까지 사라져, 읽기 실패가 쓰기 진입점을 막는다.
  const view = budget.data != null ? resolveHomeView(toHomeViewInput(budget.data)) : null;
  /*
    **스스로 서는 안내는 한 번에 하나다.** 홈 어디에 서든 센다(사용자 지시, 2026-09-30).

    둘까지 허용하던 규칙을 하나로 좁혔었다. 출시판을 쓴 사람이 보낸 화면에 「밀린 내역 정리」·
    「홈 화면에 추가」·「저녁 알림」 이 한꺼번에 서 있었다. 초록 버튼이 기록하기까지 넷이라
    무엇을 눌러야 하는 화면인지 읽히지 않는다. 그때 「곧 나갈 돈」 과 지난달 결산 안내는
    셈 밖에 있었는데, 이제 둘도 센다. 사실을 알리는 것도 알림이고, 둘이 함께 서면 같은 문제다.

    순서: 곧 나갈 돈 → 밀린 내역 → 지난달 결산 → 같이 쓰는 가계부 → 홈 화면 추가 → 저녁 알림
    → 예산 제안 → 별점 → 공유.

    - **곧 나갈 돈이 맨 앞이다.** 오늘이나 내일 실제로 돈이 빠져나가는 일이고, 그 사람이
      걸어 둔 것에만 이틀 뜬다. 그 이틀은 다른 안내가 비켜 준다.
    - **밀린 내역이 그다음이다.** 며칠 비운 사람이 지금 이 화면에 온 이유가 그것이다.
      나머지는 다음에 물어도 되지만 이 사람은 지금 이어 붙이지 않으면 다시 안 온다.
    - **지난달 결산은 달 초 이레만 선다.** 기다리는 카드들보다 앞이다. 열어 보거나 ✕ 로 닫으면
      그 달은 끝이다. 닫을 길이 없으면 이레 동안 다른 안내를 모두 막는다.
    - 같이 쓰는 가계부 안내는 한 번뿐인 새 기능 소식이다. 이미 한 번씩 본 권유보다 앞에 선다.
    - 홈 화면 추가와 저녁 알림은 한 번에 하나씩 묻는다. 홈 화면 추가는 두 번(`secondChance`),
      저녁 알림은 켤 때까지 닫을수록 뜸하게 묻는다.
    - 예산 제안은 비켜 준다. **안 사라지고 기다리기 때문**이다.
    - 별점과 공유가 맨 뒤이고 **별점이 앞이다.** 공유는 다섯 번째 기록부터 이미 서 있던
      카드라, 스무 번을 적을 때까지 안 누른 사람에게는 답이 나온 셈이다.
      못 뜨는 토스 버전에서는 별점 카드 자체를 그리지 않는다(`supports('review')`).

    **하나를 닫으면 그날은 다음 권유를 세우지 않는다**(`useNudgeQuiet`). 닫자마자 다음 카드가
    올라오면 닫은 손을 「다음 것」 으로 읽은 셈이다. 곧 나갈 돈은 사실이라 이 규칙 밖이다.
  */
  const dueSoon = (recurringDue.data?.length ?? 0) > 0;
  // 두 번째 기회면 두 번째 표를 본다. 그래야 첫 번째에 닫은 사람에게 한 번 더 뜬다.
  const homeAddCard = view?.secondChance === true ? homeAddAgain : homeAdd;
  const quiet = nudgeQuiet.quiet;

  /*
    그 카드가 실제로 그려지는 사람인지까지 여기서 가린다. 카드 안에서 조용히 null 을 돌려주면
    이 셈은 「섰다」 로 보고 뒤의 카드를 모두 막는다. 알림을 이미 켠 사람에게 별점과 공유가
    영영 안 뜨던 것이 그것이었다.

    아직 모르는 것(가계부 목록, 알림 설정, 닫은 기록)이 있으면 그 뒤 카드는 기다린다.
    뒤의 카드가 먼저 섰다가 앞의 카드로 바뀌면 누르려던 자리가 바뀐다.
  */
  const hasRecords = budget.data?.has_any_transaction === true;
  // 기능 스위치(내 계정 응답)를 모르는 동안도 기다린다. 모를 때는 꺼진 것으로 읽힌다.
  const booksIntroUnknown = hasRecords && (me.isPending || (booksEnabled && books.isPending));
  const booksIntroEligible =
    booksEnabled && books.data != null && books.data.items.length === 0 && hasRecords;
  const remindSupported = bridge.supports('notification');
  const remindUnknown =
    remindSupported && hasRecords && (notificationSettings.isPending || remindNudge.due == null);
  const remindEligible =
    remindSupported &&
    hasRecords &&
    notificationSettings.data != null &&
    !notificationSettings.data.is_enabled &&
    remindNudge.due === true;

  /*
    앞의 것이 서면 뒤의 것은 다음 회차로 미룬다. 자리마다 「여기는 괜찮다」 고 더하면
    총량을 아무도 안 세게 되고, 그 결과가 사용자가 보낸 그 화면이다.
  */
  const slot = (show: boolean, wait = false): 'show' | 'wait' | 'skip' =>
    quiet ? 'skip' : show ? 'show' : wait ? 'wait' : 'skip';
  const notice = dueSoon
    ? null
    : pickHomeNotice([
        {
          key: 'recovery',
          state: slot(view?.mode === 'recovery' && budget.data != null && !recovery.hidden),
        },
        { key: 'closing', state: slot(closingMonth != null, closingEntry.unknown) },
        {
          key: 'booksIntro',
          state: slot(
            booksIntroEligible && !booksIntro.hidden,
            booksIntroUnknown && !booksIntro.hidden,
          ),
        },
        { key: 'homeAdd', state: slot(view?.showHomeAdd === true && !homeAddCard.hidden) },
        // 방금 켰거나 거절했으면 그 답을 읽는 동안은 제자리에 둔다.
        {
          key: 'remind',
          state: remindJustOn || remindDeclined ? 'show' : slot(remindEligible, remindUnknown),
        },
        {
          key: 'budget',
          state: slot(view?.showBudgetSuggestion === true && !budgetSuggest.hidden),
        },
        {
          key: 'rating',
          state: slot(view?.showRatingAsk === true && !ratingAsk.hidden && bridge.supports('review')),
        },
        { key: 'share', state: slot(view?.showShareInvite === true && !shareInvite.hidden) },
      ]);
  const showRecovery = notice === 'recovery';
  const showClosing = notice === 'closing';
  const showBooksIntro = notice === 'booksIntro';
  const showHomeAdd = notice === 'homeAdd';
  const showRemind = notice === 'remind';
  const showBudgetSuggestion = notice === 'budget';
  const showRatingAsk = notice === 'rating';
  const showShareInvite = notice === 'share';

  /** 권유 카드를 닫았다. 그 카드를 감추고, 오늘은 다음 권유를 세우지 않는다. */
  const closeNudge = (dismiss: () => void) => () => {
    dismiss();
    nudgeQuiet.hush();
  };

  return (
    <>
      {budget.isPending ? (
        <LoadingState label="지금 상태를 불러오는 중이에요" />
      ) : view != null && budget.data != null ? (
        <HomeHero
          view={view}
          budget={budget.data}
          // 설정을 기다리느라 히어로를 비워 두지 않는다. 첫 진입이 한 박자 늦어 보이는 쪽이
          // 더 나쁘다. 대신 아직 못 받은 동안은 서버 기본값과 같은 화면이고, 실패로 굳으면
          // 히어로가 그 사실을 한 줄로 밝힌다.
          layout={resolveHeroLayout(preferences.data?.home_hero, view.hasBudget)}
          preferencesFailed={preferences.isError}
          onRetryPreferences={() => void preferences.refetch()}
        />
      ) : (
        <ErrorState onRetry={() => void budget.refetch()} />
      )}

      {/* 며칠치를 한 건씩 손으로 적는 것은 안 될 제안이라 「캡처로 정리」 가 골라진 첫 화면으로 연다. */}
      {showRecovery && budget.data != null ? (
        <RecoveryCard
          progress={budget.data.recovery}
          onCatchUp={() => onRecord('capture')}
          onDismiss={closeNudge(recovery.dismiss)}
        />
      ) : null}

      {/*
        늘 직접 입력이 골라진 첫 화면으로 연다. 지난 날을 보고 있었으면 그 날이 골라져 있다.
        며칠 전을 훑다가 누른 사람은 보고 있던 날에 적힐 것이라고 여긴다.
      */}
      <RecordButton
        onClick={() => onRecord('keypad', day === today ? undefined : day, 'home')}
      />

      {/*
        곧 나갈 돈. 스스로 나타나는 카드 중에서도 **이것이 맨 위**다.

        오늘이나 내일 실제로 돈이 빠져나가는 일이라, 권유가 아니라 사실을 알리는 자리다.
        그 사람이 걸어 둔 것에만 뜨므로 대부분의 화면에는 아무것도 안 그린다.
      */}
      <RecurringDueCard />

      {/* 기록 버튼 바로 아래. 여기 서는 것은 **하나뿐**이다. 순서는 위 주석에 적어 뒀다. */}
      {showBooksIntro ? (
        <BooksIntroCard onDismiss={closeNudge(booksIntro.dismiss)} onOpen={booksIntro.dismiss} />
      ) : null}
      {showHomeAdd ? <AddToHomeCard onDismiss={closeNudge(homeAddCard.dismiss)} /> : null}
      {showRemind ? (
        <RemindCard
          onDismiss={() => {
            /*
              켜고 나서 「알려 드릴게요」 를 닫은 것은 닫은 횟수로 세지 않는다.
              거절한 뒤 닫은 것은 거절할 때 이미 한 번 셌다(`useRemindNudge` 가 두 번 세지 않는다).
            */
            if (!remindJustOn) remindNudge.close();
            setRemindJustOn(false);
            setRemindDeclined(false);
            nudgeQuiet.hush();
          }}
          onDecline={() => {
            // 거절도 대답이다. ✕ 로 닫은 것과 같이 그날은 다른 권유를 쉰다.
            remindNudge.decline();
            setRemindDeclined(true);
            nudgeQuiet.hush();
          }}
          onTurnedOn={() => setRemindJustOn(true)}
        />
      ) : null}
      {showRatingAsk ? <ReviewAskCard onDismiss={closeNudge(ratingAsk.dismiss)} /> : null}
      {showShareInvite ? <ShareAppCard onDismiss={closeNudge(shareInvite.dismiss)} /> : null}

      {/*
        지난달 결산 안내. 달이 바뀐 뒤 며칠 동안, 지난달에 기록이 있고 아직 안 봤을 때만
        스스로 나타난다. 기록 버튼 아래에 두어 오늘 할 일을 가리지 않는다.
      */}
      {showClosing && closingMonth != null ? (
        <ClosingEntryCard month={closingMonth} onDismiss={closeNudge(closingEntry.dismiss)} />
      ) : null}

      {showBudgetSuggestion ? (
        <BudgetSuggestCard onDismiss={closeNudge(budgetSuggest.dismiss)} />
      ) : null}

      {/*
        목표가 있을 때만 그린다. 조회가 실패하면 이 자리를 비우고 오류 자리를 만들지 않는다.
        홈에서 할 일은 기록이고, 목표는 곁들여 보는 값이다.

        **다 모았으면 진행 줄 대신 축하가 선다.** 꽉 찬 게이지는 「끝났다」로 안 읽혀서,
        다 모으고도 마치지 않은 목표가 홈에 영영 남는다.
      */}
      {goal.data?.goal == null ? null : goal.data.goal.is_achieved ? (
        <GoalDoneCard goal={goal.data.goal} />
      ) : (
        <GoalStatusCard goal={goal.data.goal} />
      )}

      {/*
        배너는 목표 카드 아래, 오늘 목록 위다. 조건부 형제들 사이에 늘 같은 자리로 서 있어
        홈이 모드를 바꿔도 다시 마운트되지 않는다. 그것이 사실상 광고를 새로고침하는 것이 된다.
        이 아래로 조건부 return 을 넣지 않는다. 넣으면 그 순간 슬롯이 사라졌다 다시 붙는다.
      */}
      <AdSlot placement="home" />

      <TodayList
        day={day}
        onDayChange={onDayChange}
        transactions={transactions.data?.items ?? []}
        categories={categories.data?.items ?? []}
        loading={transactions.isPending || categories.isPending}
        loadFailed={transactions.isError || categories.isError}
        onRetry={() => {
          if (transactions.isError) void transactions.refetch();
          if (categories.isError) void categories.refetch();
        }}
        onPick={setEditing}
        /*
          빈 날 카드의 「N 기록하기」 는 그 날이 골라진 첫 화면으로 연다.
        */
        onRecord={(pickedDay) => onRecord('keypad', pickedDay)}
      />

      {/*
        7일을 이어서 적었으면 맨 앞에 축하를 한 장 띄운다. 결산과 같은 모양이다.
        시트·묻는 창이 떠 있는 동안은 기다린다. 방금 적은 것의 결과를 덮지 않는다.
      */}
      <StreakCelebration
        streak={budget.data?.streak}
        blocked={recording || editing != null}
      />

      {/*
        달력과 같은 시트를 쓴다. 고치는 자리가 둘이 되면 규칙도 둘이 된다.
        달은 넘기지 않는다. 홈의 조회도 달 없이 부르니, 수정 응답이 캐시에 쓰는 키를
        홈이 읽는 키와 맞춰야 히어로 숫자가 왕복 없이 바뀐다.
      */}
      <EditSheet
        transaction={editing}
        categories={categories.data?.items ?? []}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

export default function HomePage() {
  /*
    `/record` 로 들어오면 기록 시트를 연다. 부탁은 한 번만 쓰고 주소에서 지운다.
    남겨 두면 탭을 오가다 홈에 돌아올 때마다 누르지도 않은 시트가 다시 뜬다.

    **처음 안내가 걷힌 뒤에 연다.** 처음 온 사람은 안내가 시트보다 위에 떠서, 시트를 먼저
    열면 안내를 넘기는 동안 그 아래에 이미 열려 있다가 안내가 닫히는 순간 튀어나온다.
    모르는 동안(`null`)도 막힌 것으로 본다.
  */
  const onboarding = useOnboardingShowing();
  const [params, setParams] = useSearchParams();
  const [recordAsked, setRecordAsked] = useState(() => params.get(RECORD_QUERY) === '1');
  const [sheet, setSheet] = useState<{
    open: boolean;
    tab: RecordTab;
    day?: string;
    from?: RecordFrom;
  }>({ open: false, tab: DEFAULT_RECORD_TAB });
  useEffect(() => {
    if (params.get(RECORD_QUERY) == null) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(RECORD_QUERY);
        return next;
      },
      { replace: true },
    );
  }, [params, setParams]);
  // 안내가 걷히는 그 렌더에서 바로 연다. 효과로 미루면 한 프레임 홈만 보였다가 시트가 뜬다.
  if (recordAsked && onboarding === false) {
    setRecordAsked(false);
    setSheet({ open: true, tab: DEFAULT_RECORD_TAB, from: 'deeplink' });
  }
  // 아래 목록이 보고 있는 날. 오늘로 열고 화살표로 옮긴다.
  const [day, setDay] = useState(() => toLedgerDate(new Date()));
  /*
    어느 가계부를 보나. 앱을 열면 보통 내 가계부에서 시작한다. 내 가계부에 적은 것이 없고
    공유 가계부를 보다 나간 사람만 그 가계부에서 시작한다(`BookViewProvider`).
    그걸 정하는 동안은 내 가계부를 그리지 않는다. 빈 내 가계부가 한 번 비쳤다가 바뀌지 않게.

    **가계부가 하나도 없는 사람의 홈은 지금과 똑같다.** 맨 위 칩도 없다. 완료한 가계부만
    남은 사람에게는 칩이 선다. 거기서 지난 기록을 다시 볼 수 있어야 한다.
  */
  const { viewingBookId, setViewingBookId, restoring } = useBookView();
  const books = useBooks();
  const bookItems = books.data?.items ?? [];
  return (
    <div className="page home">
      <IdentityNotice />
      {restoring ? (
        <LoadingState label="지금 상태를 불러오는 중이에요" />
      ) : viewingBookId != null ? (
        <BookHome
          bookId={viewingBookId}
          books={bookItems}
          onChangeBook={setViewingBookId}
          // 공유 기록은 키패드로만 적는다. 이 가계부가 「적을 곳」 에 골라져 열린다.
          onRecord={() => setSheet({ open: true, tab: 'keypad' })}
        />
      ) : (
        <>
          {bookItems.length > 0 ? (
            <div className="book-home__top">
              <BookChip value={null} books={bookItems} onChange={setViewingBookId} />
            </div>
          ) : null}
          <HomeContent
            day={day}
            onDayChange={setDay}
            onRecord={(tab, pickedDay, from) => setSheet({ open: true, tab, day: pickedDay, from })}
            recording={sheet.open}
          />
        </>
      )}
      <div className="home__tail" />
      <QuickRecordSheet
        open={sheet.open}
        initialTab={sheet.tab}
        day={sheet.day}
        from={sheet.from ?? (sheet.day == null ? 'home' : 'home_day')}
        bookId={viewingBookId}
        onClose={() => setSheet((prev) => ({ ...prev, open: false }))}
        /*
          적힌 날로 목록을 옮긴다. 지난 달 영수증을 읽어 넣고 시트를 닫았는데 화면이
          오늘에 머물러 「오늘은 안 썼어요」 라고 적혀 있으면, 들어갔는지 아닌지를
          그 날짜를 찾아가 봐야 안다.
        */
        onRecorded={setDay}
      />
    </div>
  );
}
