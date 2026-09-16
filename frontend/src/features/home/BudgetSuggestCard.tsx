import { useMemo, useState } from 'react';

import { EVENTS, useAnalytics } from '../../shared/analytics';
import { ApiError, useSaveBudget } from '../../shared/api';
import { toLedgerDate } from '../../shared/lib/format';
import { AmountField, BottomSheet, Button, CategoryAvatar, SageCard } from '../../shared/ui';
import { useFullScreenAd } from '../ads';
import { BudgetCalcAsk, BudgetCalcSheet } from '../budgets';

import { CardClose } from './CardClose';

/**
 * 첫 기록을 마친 사람에게만 뜨는 예산 제안.
 *
 * 받는 것은 금액 하나다. 기간·카테고리별 예산은 여기서 묻지 않는다.
 *
 * **닫을 수 있다.** 예산을 정할 생각이 없는 사람에게는 이 카드가 예산을 정할 때까지
 * 영영 홈에 남는다. 대신 닫기 전에 어디서 다시 정할 수 있는지 카드 안에 적어 둔다.
 * 그 한 줄이 없으면 닫는 순간 예산 기능 자체가 사라진 것으로 보인다.
 *
 * **얼마로 할지 모르는 사람의 길도 여기 둔다.** 첫 기록을 막 끝낸 사람이 예산 금액을
 * 가장 모르는 사람이다. 그 길이 관리 탭에만 있으면 여기서 빈 칸을 보고 카드를 닫는다.
 */
export function BudgetSuggestCard({ onDismiss }: { onDismiss: () => void }) {
  const [digits, setDigits] = useState('');
  const saveBudget = useSaveBudget();
  const analytics = useAnalytics();
  const fullScreenAd = useFullScreenAd();
  /** 광고를 틀기 전에 한 번 묻는 모달. 카드 위에 따로 띄운다. */
  const [askOpen, setAskOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);

  const amount = Number(digits);
  const canSave = digits !== '' && amount > 0 && !saveBudget.isPending;
  const message = saveBudget.error instanceof ApiError ? saveBudget.error.message : null;

  // 홈에서 정하는 예산은 언제나 이번 달 것이다. 계산기도 같은 달을 받아야 한다.
  const thisMonth = useMemo(() => {
    const [year, month] = toLedgerDate(new Date()).slice(0, 7).split('-').map(Number);
    return { year, month };
  }, []);

  /** 광고가 안 떠도 계산기는 연다. 광고 서버 사정으로 예산을 못 정하게 두지 않는다. */
  async function openCalc(): Promise<void> {
    const outcome = await fullScreenAd.show();
    analytics.log(
      EVENTS.budgetCalcOpened,
      outcome.result === 'watched'
        ? { ad: 'watched', where: 'home' }
        : { ad: 'skipped', reason: outcome.reason, where: 'home' },
      { kind: 'click' },
    );
    setAskOpen(false);
    setCalcOpen(true);
  }

  return (
    <SageCard className="home-card">
      <div className="home-card__head">
        <CategoryAvatar icon="32_piggybank" size={44} />
        <p className="home-card__text">
          예산을 정하면 <strong>남은 돈과 하루에 쓸 수 있는 돈</strong>까지 알려드려요.
        </p>
        <CardClose label="예산 안내 닫기" onClick={onDismiss} />
      </div>

      <AmountField label="이번 달 예산" value={digits} onChange={setDigits} />

      {message ? (
        <p className="home-card__error" role="alert">
          {message}
        </p>
      ) : null}

      <Button
        variant="primarySmall"
        fullWidth
        disabled={!canSave}
        onClick={() => saveBudget.mutate({ amount })}
      >
        예산 정하기
      </Button>

      {/*
        광고 이야기는 누른 뒤 모달에서 한다. 카드에 먼저 적으면 안내가 아니라 광고로 읽힌다.

        테두리 버튼이 아니라 글자 버튼이다. 이 카드의 바탕이 연녹색이라, 흰 테두리 버튼을
        두면 금액을 안 적었을 때 회색으로 죽은 「예산 정하기」 보다 이쪽이 더 도드라진다.
      */}
      <Button
        className="home-card__calc"
        variant="ghost"
        fullWidth
        disabled={saveBudget.isPending || fullScreenAd.busy}
        onClick={() => setAskOpen(true)}
      >
        얼마로 할지 모르겠어요
      </Button>

      {/* 닫기 옆이 아니라 버튼 아래다. 닫으려다 눈이 지나가는 자리가 여기다. */}
      <p className="home-card__aside">하단의 「관리」 탭에서 예산을 다시 설정할 수 있어요</p>

      {/*
        카드 위에 따로 띄운다. 카드 안에서 갈리면 예산 칸과 저장 버튼이 그대로 보여서
        무엇을 물었는지 읽히지 않는다. 「닫기」 를 누르면 이 카드로 그대로 돌아온다.
      */}
      <BottomSheet
        open={askOpen}
        onClose={() => setAskOpen(false)}
        dismissible={!fullScreenAd.busy}
        ariaLabel="예산 대신 잡아 드리기"
        className="budget-sheet"
      >
        <div className="budget-sheet__body">
          <BudgetCalcAsk
            busy={fullScreenAd.busy}
            onClose={() => setAskOpen(false)}
            onConfirm={() => void openCalc()}
          />
        </div>
      </BottomSheet>

      {/* 관리 탭이 쓰는 그 계산기를 그대로 쓴다. 여기서 저장하면 이 카드는 스스로 사라진다. */}
      <BudgetCalcSheet open={calcOpen} month={thisMonth} onClose={() => setCalcOpen(false)} />
    </SageCard>
  );
}
