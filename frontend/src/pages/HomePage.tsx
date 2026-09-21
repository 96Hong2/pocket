import { useState } from 'react';

import { IdentityNotice } from '../app/IdentityNotice';
import { useBridge, useIdentity } from '../app/providers';
import { AdSlot } from '../features/ads';
import { AddToHomeCard } from '../features/home-add';
import { RemindCard } from '../features/notifications';
import { RecurringDueCard } from '../features/recurring';
import {
  BudgetSuggestCard,
  ClosingEntryCard,
  GoalDoneCard,
  GoalStatusCard,
  HomeHero,
  RecordDayAsk,
  RecoveryCard,
  ReviewAskCard,
  ShareAppCard,
  StreakCelebration,
  TodayList,
  resolveHeroLayout,
  resolveHomeView,
  toHomeViewInput,
  useCardDismiss,
} from '../features/home';
import { QuickRecordSheet, type RecordTab } from '../features/quick-record';
import { EditSheet } from '../features/transactions';
// 방식 → 탭 환산은 시트 옆에 있다. 배럴에는 시트만 나와 있어 파일을 곧장 가리킨다.
import { DEFAULT_RECORD_TAB, resolveRecordTab } from '../features/quick-record/recordTab';
import {
  useBudget,
  useCategories,
  useGoal,
  usePreferences,
  useRecurringDue,
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
  onRecord: (tab: RecordTab, day?: string) => void;
  /** 기록 시트가 떠 있나. 7일 축하가 그 위로 겹쳐 뜨지 않게 기다리는 데 쓴다. */
  recording: boolean;
}) {
  const { state } = useIdentity();
  // 별점 창을 못 띄우는 토스 버전에서는 권유 카드를 아예 안 그린다.
  const bridge = useBridge();
  // 홈에서 바로 고친다. 여기서 못 고치면 달력까지 들어가야 해서 아무도 안 고친다.
  const [editing, setEditing] = useState<TransactionOut | null>(null);
  const today = toLedgerDate(new Date());
  /** 지난 날을 보는 중에 큰 버튼을 눌렀나. 어느 날에 적을지 묻는 자리가 펴진다. */
  const [asking, setAsking] = useState(false);
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
    홈 화면 추가와 저녁 알림은 **두 번 묻는다.** 첫 기록 직후와 다섯 번째 기록 때다.
    첫 기록 때는 이 앱을 계속 쓸지조차 모르는 상태라 그때 닫은 것은 대답이 아니다.
    표(mark)로 가르지 않고 키를 둘로 나눈 이유는 `shared/lib/cardDismiss.ts` 에 적어 뒀다.
  */
  const homeAdd = useCardDismiss('home-add', '');
  const homeAddAgain = useCardDismiss('home-add-again', '');
  const remind = useCardDismiss('remind', '');
  const remindAgain = useCardDismiss('remind-again', '');

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
    **스스로 서는 카드는 한 번에 둘까지다.** 셋이 쌓이면 기록 버튼 아래가 권유 전시장이 되고,
    정작 급한 것이 안 읽힌다. 카드가 셋 쌓인 화면을 직접 찍어 보고 정한 규칙이다.

    순서는 이렇다: 곧 나갈 돈 → 홈 화면 추가 → 저녁 알림 → 예산 제안 → 공유.

    - 「곧 나갈 돈」이 맨 위다. 권유가 아니라 오늘 실제로 돈이 빠져나간다는 **사실**이다.
    - 홈 화면 추가와 저녁 알림은 **한 쌍**이다. 첫 기록을 마친 그 순간이 둘 다 물을 유일한
      때이고, 둘 다 **한 번뿐인 안내**다. 그래서 둘을 갈라 놓지 않는다.
    - 예산 제안은 비켜 준다. **안 사라지고 기다리기 때문**이다. 예산을 정할 때까지 계속
      뜨고, 카드 자체도 관리 탭에서 언제든 정할 수 있다고 적는다. 반대로 한 번뿐인 안내는
      그 자리를 내주면 영영 안 뜬다(실기기에서 그렇게 안 떴다).
    - 별점과 공유가 맨 뒤에서 한 자리를 나눠 쓰고, **별점이 앞이다.** 공유는 다섯 번째
      기록부터 이미 서 있던 카드라, 스무 번을 적을 때까지 안 누른 사람에게는 답이 나온
      셈이다. 별점은 한 번뿐이라 닫고 나면 다음 회차부터 공유가 다시 선다.
      못 뜨는 토스 버전에서는 별점 카드 자체를 그리지 않는다(`supports('review')`).
  */
  const dueSoon = (recurringDue.data?.length ?? 0) > 0;
  // 두 번째 기회면 두 번째 표를 본다. 그래야 첫 번째에 닫은 사람에게 한 번 더 뜬다.
  const homeAddCard = view?.secondChance === true ? homeAddAgain : homeAdd;
  const remindCard = view?.secondChance === true ? remindAgain : remind;
  const showHomeAdd = view?.showHomeAdd === true && !homeAddCard.hidden && !dueSoon;
  const showRemind = view?.showRemind === true && !remindCard.hidden && !dueSoon;
  const showBudgetSuggestion =
    view?.showBudgetSuggestion === true && !budgetSuggest.hidden && !showHomeAdd && !showRemind;
  /*
    **별점이 공유보다 앞이다.** 둘 다 「한 번 뜨고 닫으면 끝」 인데, 공유는 다섯 번째
    기록부터 이미 서 있었다. 스무 번을 적을 때까지 안 누르고 안 닫은 사람에게 그 카드는
    이미 답이 나온 것이라, 그 자리를 별점에 한 번 내준다. 별점은 한 번뿐이라 다음
    회차부터 공유가 다시 선다.
  */
  const showRatingAsk =
    view?.showRatingAsk === true &&
    !ratingAsk.hidden &&
    bridge.supports('review') &&
    !dueSoon &&
    !showBudgetSuggestion &&
    !showHomeAdd &&
    !showRemind;
  const showShareInvite =
    view?.showShareInvite === true &&
    !shareInvite.hidden &&
    !dueSoon &&
    !showRatingAsk &&
    !showBudgetSuggestion &&
    !showHomeAdd &&
    !showRemind;

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

      {/* 며칠치를 한 건씩 손으로 적는 것은 애초에 안 될 제안이라 캡처 탭으로 연다. */}
      {view?.mode === 'recovery' && budget.data != null && !recovery.hidden ? (
        <RecoveryCard
          progress={budget.data.recovery}
          onCatchUp={() => onRecord('capture')}
          onDismiss={recovery.dismiss}
        />
      ) : null}

      {/*
        마지막에 쓴 방식으로 연다. 설정이 아직 안 왔으면 기다리지 않고 키패드로 연다.
        시트가 늦게 열리면 10초 안에 적는다는 약속부터 깨진다.

        **지난 날을 보고 있으면 먼저 묻는다.** 이 버튼은 늘 오늘에 적는데, 며칠 전을
        훑다가 누른 사람은 보고 있던 날에 적힐 것이라고 여긴다. 적고 나서야 알면
        지우고 다시 적는 수밖에 없다.
      */}
      <RecordButton
        onClick={() => {
          const tab = resolveRecordTab(preferences.data?.last_record_method);
          if (day === today) {
            onRecord(tab);
            return;
          }
          setAsking(true);
        }}
      />

      {asking ? (
        <RecordDayAsk
          day={day}
          today={today}
          onCancel={() => setAsking(false)}
          onPick={(picked) => {
            setAsking(false);
            const tab = resolveRecordTab(preferences.data?.last_record_method);
            // 오늘을 골랐으면 날을 안 넘긴다. 넘기면 「이름에 날이 붙은 버튼」 으로 취급돼
            // 방식 알약이 사라진다.
            onRecord(tab, picked === today ? undefined : picked);
          }}
        />
      ) : null}

      {/*
        곧 나갈 돈. 스스로 나타나는 카드 중에서도 **이것이 맨 위**다.

        오늘이나 내일 실제로 돈이 빠져나가는 일이라, 권유가 아니라 사실을 알리는 자리다.
        그 사람이 걸어 둔 것에만 뜨므로 대부분의 화면에는 아무것도 안 그린다.
      */}
      <RecurringDueCard />

      {/*
        기록 버튼 바로 아래. 순서는 위 주석에 적어 뒀다.

        홈 화면 추가와 저녁 알림은 **나란히 선다.** 하나는 앱을 찾기 쉽게 하는 일이고
        하나는 우리가 부르는 일이라, 하나만 하고 싶은 사람이 나머지를 같이 닫게 두지 않는다.
        닫는 ✕ 도 각자 갖는다.
      */}
      {showHomeAdd ? <AddToHomeCard onDismiss={homeAddCard.dismiss} /> : null}
      {showRemind ? <RemindCard onDismiss={remindCard.dismiss} /> : null}
      {showRatingAsk ? <ReviewAskCard onDismiss={ratingAsk.dismiss} /> : null}
      {showShareInvite ? <ShareAppCard onDismiss={shareInvite.dismiss} /> : null}

      {/*
        지난달 결산 안내. 달이 바뀐 뒤 며칠 동안, 지난달에 기록이 있고 아직 안 봤을 때만
        스스로 나타난다. 기록 버튼 아래에 두어 오늘 할 일을 가리지 않는다.
      */}
      <ClosingEntryCard />

      {showBudgetSuggestion ? <BudgetSuggestCard onDismiss={budgetSuggest.dismiss} /> : null}

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
        // 날을 옮기면 묻던 것도 접는다. 답이 다른 날에 붙으면 안 된다.
        onDayChange={(next) => {
          setAsking(false);
          onDayChange(next);
        }}
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
          빈 날 카드의 「N 기록하기」 만 날을 들고 간다. 버튼에 날 이름이 적혀 있어서다.
          위의 큰 「기록하기」 는 날 이름이 없으니 늘 오늘이다. 이름과 동작을 맞춘다.
        */
        /*
          **날 이름이 붙은 버튼은 키패드로 연다.** 마지막에 쓴 방식으로 열면, 줄글을
          마지막에 쓴 사람이 「9월 5일 기록하기」 를 눌러도 줄글 탭이 열리고 고른 날이
          말없이 버려졌다. 큰 「기록하기」 는 지금처럼 마지막에 쓴 방식으로 연다.
        */
        onRecord={(pickedDay) => onRecord('keypad', pickedDay)}
      />

      {/*
        7일을 이어서 적었으면 맨 앞에 축하를 한 장 띄운다. 결산과 같은 모양이다.
        시트·묻는 창이 떠 있는 동안은 기다린다. 방금 적은 것의 결과를 덮지 않는다.
      */}
      <StreakCelebration
        streak={budget.data?.streak}
        blocked={recording || editing != null || asking}
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
  const [sheet, setSheet] = useState<{ open: boolean; tab: RecordTab; day?: string }>({
    open: false,
    tab: DEFAULT_RECORD_TAB,
  });
  // 아래 목록이 보고 있는 날. 오늘로 열고 화살표로 옮긴다.
  const [day, setDay] = useState(() => toLedgerDate(new Date()));
  return (
    <div className="page home">
      <IdentityNotice />
      <HomeContent
        day={day}
        onDayChange={setDay}
        onRecord={(tab, pickedDay) => setSheet({ open: true, tab, day: pickedDay })}
        recording={sheet.open}
      />
      <div className="home__tail" />
      <QuickRecordSheet
        open={sheet.open}
        initialTab={sheet.tab}
        day={sheet.day}
        from={sheet.day == null ? 'home' : 'home_day'}
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
