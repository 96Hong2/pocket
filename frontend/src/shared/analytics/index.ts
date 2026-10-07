/**
 * 행동 로그.
 *
 * 이 앱은 빨리 적고 닫아도 성공이다. 그래서 "얼마나 오래 머물렀나" 가 아니라
 * **"어디서 얼마나 고생했나"** 를 남긴다. 무엇을 남기고 무엇을 안 남기는지는
 * `events.ts` 의 머리말이 정본이다.
 */

export { Analytics, type FlowId, type LogOptions } from './analytics';
export { AnalyticsContext, useAnalytics } from './context';
export {
  EVENTS,
  type AssetAnalysisAd,
  type AssetAnalysisAnswer,
  type AssetAnalysisScopeLog,
  type AssetAnalysisSkipReason,
  type AssetAnalysisState,
  type AssetCaptureAd,
  type AssetCaptureFrom,
  type AssetCaptureInput,
  type AssetCaptureStep,
  type AssetChangeField,
  type AssetChangeFrom,
  type AssetCheckinAnswer,
  type SavingHintAnswer,
  type AssetDestFromLog,
  type AssetKindLog,
  type AssetSideLog,
  type BookChangeAction,
  type BookInviteWhere,
  type BookJoinOutcome,
  type BookSide,
  type EditField,
  type EventName,
  type EventParamMap,
  type EventParams,
  type ForbiddenParamKey,
  type ItemAction,
  type LogMethod,
  type MembersBucket,
  type ParseOutcome,
  type PickOutcome,
  type QuantityShape,
  type RecordBackFrom,
  type RecordCloseHow,
  type RecordDrafted,
  type RecordKind,
  type RecordStep,
  type RecordWay,
  type RecurringAction,
  type SetupChanged,
} from './events';
