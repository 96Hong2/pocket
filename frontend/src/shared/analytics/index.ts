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
  type EditField,
  type EventName,
  type LogMethod,
  type ParseOutcome,
  type PickOutcome,
} from './events';
