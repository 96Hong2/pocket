import type { AssetAnalysisScope } from '../../app/router/routes';
import type { IconName } from '../../shared/ui';

export interface AnalysisKind {
  /** 입구 버튼과 화면 제목 */
  label: string;
  /** 잠김 카드의 굵은 줄 */
  hint: string;
  icon: IconName;
}

/**
 * 범위별 화면 문구. 코인 리포트는 없다.
 *
 * 종류별도 「리포트」 다. 내 자산 리포트 화면 아래 「종류별로 더 보기」 에 함께 놓여, 한 화면에서
 * 「리포트」 와 「분석」 이 섞이지 않게 한다.
 */
export const ANALYSIS_KINDS: Record<AssetAnalysisScope, AnalysisKind> = {
  all: {
    label: '내 자산 리포트',
    hint: '어디에 얼마가 있는지, 수익률, 지난달과 달라진 것',
    icon: '79_donut_chart',
  },
  stock: { label: '주식 리포트', hint: '주식, ETF, 펀드, 채권', icon: '03_growth_chart' },
  cash: { label: '예/적금 리포트', hint: '통장, 예금, 적금', icon: '28_cash' },
};
