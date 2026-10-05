import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useBridge, useToast } from '../../app/providers';
import {
  ApiError,
  useUpdateTransaction,
  type TransactionOut,
  type TransactionUpdated,
} from '../../shared/api';
import { EVENTS, useAnalytics, type FlowId, type SavingHintAnswer } from '../../shared/analytics';
import { markCardDismissed, readCardDismissed } from '../../shared/lib/cardDismiss';
import { josa } from '../../shared/lib/josa';
import { TEST_IDS } from '../../shared/testIds';
import { Button, iconUrl } from '../../shared/ui';
import {
  AssetDestField,
  AssetDestFlow,
  destBodyOf,
  destGroupOf,
  destKindOf,
  useAssetDestinations,
  type AssetDest,
  type AssetDestPick,
  type AssetDestStage,
} from '../asset-dest';

import { isSavingCategoryName, savingHintDestinations } from './savingHintRules';

interface SavingHintInput {
  flowId: FlowId;
  transaction: TransactionOut;
  /** 저장된 지출 분류 이름. */
  categoryName: string | undefined;
  onUpdated: (updated: TransactionUpdated) => void;
  /** 바꾼 뒤. 주면 onUpdated 대신 이것을 불러 저축·투자 저장 뒤 화면으로 갈아 끼울 수 있다. */
  onConverted?: (updated: TransactionUpdated, dest: AssetDest) => void;
}

export interface SavingHint {
  /** 저장 뒤 화면 안에 끼울 안내 카드. 안 설 때는 null. */
  card: ReactNode;
  /** 「다른 곳」 목록이나 새 항목 폼. 열려 있으면 저장 뒤 화면 대신 이것을 그린다. */
  takeover: ReactNode;
  /** 열린 단계를 한 칸 물린다. 물릴 것이 없으면 false. */
  back: () => boolean;
  /** 답 없이 저장 뒤 화면을 닫을 때 부른다. */
  dismiss: () => void;
}

const CARD = 'saving-hint' as const;

/**
 * 저축 이름 분류로 적은 지출에 한 번(기기마다) 「저축·투자로 바꾸기」 를 권한다.
 * 바꾸면 이번 기록이 이체로 바뀌어 지출에서 빠진다.
 */
export function useSavingHint({
  flowId,
  transaction,
  categoryName,
  onUpdated,
  onConverted,
}: SavingHintInput): SavingHint {
  const analytics = useAnalytics();
  const bridge = useBridge();
  const toast = useToast();
  const update = useUpdateTransaction();
  const { destinations, loading } = useAssetDestinations();
  const choices = savingHintDestinations(destinations);

  // 기기에 남긴 표시. 아직 모르면 null 이라 서지 않는다(늦게 서는 쪽이 깜빡이는 쪽보다 낫다).
  const [seen, setSeen] = useState<boolean | null>(null);
  const [answer, setAnswer] = useState<SavingHintAnswer | null>(null);
  const [picking, setPicking] = useState(false);
  const [stage, setStage] = useState<AssetDestStage | null>(null);
  const logged = useRef(false);

  const eligible = transaction.type === 'expense' && isSavingCategoryName(categoryName);
  const visible = eligible && seen === false && answer == null;

  useEffect(() => {
    let alive = true;
    void readCardDismissed(bridge.storage, CARD, '').then((value) => {
      if (alive) setSeen(value);
    });
    return () => {
      alive = false;
    };
  }, [bridge]);

  // 한 번 섰으면 그 기기에서는 다시 세우지 않는다. 지금 화면에서는 그대로 둔다.
  useEffect(() => {
    if (visible) void markCardDismissed(bridge.storage, CARD, '');
  }, [visible, bridge]);

  function settle(next: SavingHintAnswer): void {
    setAnswer(next);
    if (logged.current) return;
    logged.current = true;
    analytics.log(EVENTS.savingHintResult, { answer: next }, { flowId, kind: 'click' });
  }

  function keep(): void {
    setPicking(false);
    settle('kept');
  }

  function convert({ dest }: AssetDestPick): void {
    setStage(null);
    if (update.isPending) return;
    update.mutate(
      {
        id: transaction.id,
        body: { type: 'transfer', ...destBodyOf(dest), asset_side: 'buy' },
      },
      {
        onSuccess: (updated) => {
          settle('converted');
          if (dest.type === 'new') {
            const group = destGroupOf(dest);
            analytics.log(
              EVENTS.assetChanged,
              {
                action: 'created',
                group,
                kind: group === 'investment' ? (destKindOf(dest) ?? 'none') : 'none',
                from: 'record',
                fields: 'amount',
              },
              { flowId, kind: 'click' },
            );
          }
          if (onConverted != null) onConverted(updated, dest);
          else onUpdated(updated);
          toast.show({ text: '저축·투자로 바꿨어요. 이번 달 지출에서 빠졌어요' });
        },
      },
    );
  }

  const error = update.error instanceof ApiError ? update.error : null;
  const name = categoryName ?? '';

  const card = visible ? (
    <section
      className="saving-hint"
      aria-label="저축·투자로 바꾸기 안내"
      data-testid={TEST_IDS.savingHint}
    >
      <img className="saving-hint__icon" src={iconUrl('32_piggybank')} alt="" />
      <div className="saving-hint__body">
        <p className="saving-hint__title">
          「{name}」 {josa(name, '은/는')} 쓴 돈이 아니라 모은 돈이에요
        </p>
        {picking ? (
          <AssetDestField
            destinations={choices}
            value={null}
            loading={loading}
            onPick={convert}
            onOther={() => setStage('list')}
          />
        ) : (
          <div className="saving-hint__actions">
            <Button variant="primarySmall" onClick={() => setPicking(true)}>
              저축·투자로 바꾸기
            </Button>
            <Button variant="ghost" onClick={keep}>
              그냥 둘게요
            </Button>
          </div>
        )}
        {error != null ? (
          <p className="feedback__notice" role="alert">
            {error.message}
          </p>
        ) : null}
      </div>
    </section>
  ) : null;

  const takeover =
    visible && stage != null ? (
      <AssetDestFlow
        destinations={choices}
        value={null}
        stage={stage}
        onStageChange={setStage}
        onPick={convert}
        onBack={() => setStage(null)}
      />
    ) : null;

  return {
    card,
    takeover,
    back: () => {
      if (!visible || stage == null) return false;
      setStage(stage === 'new' ? 'list' : null);
      return true;
    },
    dismiss: () => {
      // 바꾸는 요청이 도는 중이면 그 결과가 답이다.
      if (visible && !update.isPending) settle('dismissed');
    },
  };
}
