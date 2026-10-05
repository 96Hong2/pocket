import type { AssetItemOut, InvestKind } from '../../shared/api';
import { holdingOf, INVEST_KINDS } from '../assets';

/** 이 말이 이름에 든 지출 분류는 쓴 돈이 아니라 모은 돈일 가능성이 크다. */
const SAVING_WORDS = /적금|저축|투자|연금|청약|irp/i;

/** 저장 뒤 적금 안내를 세울 분류 이름인가. */
export function isSavingCategoryName(name: string | null | undefined): boolean {
  return name != null && SAVING_WORDS.test(name);
}

/**
 * 적금 안내에서 고를 수 있는 곳. 수량 종목은 수량 없이 바꿀 수 없어(서버 422) 뺀다.
 */
export function savingHintDestinations(destinations: readonly AssetItemOut[]): AssetItemOut[] {
  return destinations.filter((item) => holdingOf(item.group, item.kind) !== 'quantity');
}

/** 적금 안내의 새 항목 폼에서 고를 수 있는 투자 종류. 수량 종목(주식, ETF, 코인)은 같은 까닭으로 뺀다. */
export const SAVING_HINT_KINDS: readonly InvestKind[] = INVEST_KINDS.filter(
  (kind) => holdingOf('investment', kind) !== 'quantity',
);
