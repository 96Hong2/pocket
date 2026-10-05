/**
 * 생성 타입의 짧은 이름.
 *
 * `components['schemas']['TransactionCreated']` 를 화면마다 적으면 길어서, 결국 누군가
 * 타입을 손으로 다시 적게 된다. 여기서 한 번만 풀어 재수출한다.
 *
 * 이름은 서버 스키마 이름 그대로 둔다(`...Out` 접미사 포함). 그래야 `docs/API_CONTRACT.md`
 * 와 `docs/openapi.json` 을 그대로 grep 해서 대조할 수 있다.
 */

import type { components } from './schema.gen';

type Schemas = components['schemas'];

// ── 값 목록 ────────────────────────────────────
export type TransactionType = Schemas['TransactionType'];
export type TransactionSource = Schemas['TransactionSource'];
export type CategoryKind = Schemas['CategoryKind'];
/** 무엇으로 냈나. 지출에만 붙고, 안 고르면 null 이다. */
export type PaymentMethod = Schemas['PaymentMethod'];
export type FeedbackKind = Schemas['FeedbackKind'];
/** 서버 계약 표에 적힌 오류 code. 화면이 분기할 때는 열린 `ApiErrorCode` 를 쓴다. */
export type ErrorCode = Schemas['ErrorCode'];

// ── 거래 ──────────────────────────────────────
export type TransactionOut = Schemas['TransactionOut'];
export type TransactionCreate = Schemas['TransactionCreate'];
export type TransactionCreated = Schemas['TransactionCreated'];
export type TransactionUpdate = Schemas['TransactionUpdate'];
export type TransactionUpdated = Schemas['TransactionUpdated'];
export type TransactionListOut = Schemas['TransactionListOut'];
export type PeriodSummaryOut = Schemas['PeriodSummaryOut'];
export type MonthlyReportOut = Schemas['MonthlyReportOut'];
export type BreakdownRowOut = Schemas['BreakdownRowOut'];
/** 리포트 분류 줄 하나를 펼친 것. 합계는 그 줄 금액과 같은 셈이다. */
export type CategoryReportOut = Schemas['CategoryReportOut'];
export type MethodRowOut = Schemas['MethodRowOut'];
/** 태그 조각 하나. 이름과 색은 화면이 태그 목록에서 찾아 붙인다. */
export type TagRowOut = Schemas['TagRowOut'];
/** 태그별 순위표. 안 단 돈은 조각이 아니라 숫자로만 온다. */
export type TagBreakdownOut = Schemas['TagBreakdownOut'];
export type TrendPointOut = Schemas['TrendPointOut'];
export type PeriodComparisonOut = Schemas['PeriodComparisonOut'];
/** 월간 결산. 카드 넉 장이 그리는 것이 한 응답에 들어 있다. */
export type ClosingOut = Schemas['ClosingOut'];
/** 잘한 것 하나. 문장이 아니라 종류와 숫자만 온다. 문장 조립은 화면이 한다. */
export type HighlightOut = Schemas['HighlightOut'];
export type HighlightKind = Schemas['HighlightKind'];
/** 그 달 돈 흐름. 남은 예산·순자산과 다른 이야기다. */
export type ClosingFlowOut = Schemas['ClosingFlowOut'];
/** 결산 순자산 장. 그 달 스냅샷과 앞 달 월말 점이 있을 때만 온다. */
export type ClosingNetWorthOut = Schemas['ClosingNetWorthOut'];
/** 지난달보다 가장 많이 늘어난 분류. 견줄 것이 없으면 null 이다. */
export type ChangeOut = Schemas['ChangeOut'];
/** 다음 달에 해 볼 것 하나. 여기에 적용 버튼은 없다. */
export type NextOut = Schemas['NextOut'];
export type NextStepKind = Schemas['NextStepKind'];
/** 달력 한 칸. 기록이 있는 날만 온다. `expense` 는 환불을 뺀 값이라 음수일 수 있다. */
export type CalendarDayOut = Schemas['CalendarDayOut'];
export type CalendarMonthOut = Schemas['CalendarMonthOut'];

// ── 예산·피드백 ────────────────────────────────
/** 남은 예산·하루 가용액·게이지 비율이 든 한 덩어리. 저장·수정·요약·조회가 모두 같은 모양으로 준다. */
export type BudgetStateOut = Schemas['BudgetStateOut'];
export type BudgetOut = Schemas['BudgetOut'];
export type BudgetUpsert = Schemas['BudgetUpsert'];
/** 카테고리 한 줄. 한도와 그 카테고리 사용액이 함께 온다. 예산 조회 응답에만 실린다. */
export type CategoryBudgetOut = Schemas['CategoryBudgetOut'];
/** 목표에서 거꾸로 낸 생활비 제안. 조회만으로는 아무것도 저장되지 않는다. */
export type BudgetSuggestionOut = Schemas['BudgetSuggestionOut'];
/** 제안식의 한 칸. 지난달에서 어림한 값인지 사용자가 고쳐 준 값인지 함께 온다. */
export type SuggestionAmountOut = Schemas['SuggestionAmountOut'];
export type SuggestionSource = Schemas['SuggestionSource'];
/** 제안을 낼 수 없는 이유. 이 값이 오면 화면은 카드를 아예 그리지 않는다. */
export type SuggestionBlocker = Schemas['SuggestionBlocker'];
/** 최근 며칠 중 며칠 기록했나. 빠진 날 수는 오지 않는다. 예산 조회 응답에 늘 실린다. */
export type RecoveryProgressOut = Schemas['RecoveryProgressOut'];
/** 문장이 아니라 종류와 숫자만 온다. 문장 조립은 화면이 한다. */
export type FeedbackOut = Schemas['FeedbackOut'];

// ── 줄글·캡처 입력 ─────────────────────────────
/** 검토 단위. 아직 거래가 아니라 후보 묶음이다. */
export type ImportBatchOut = Schemas['ImportBatchOut'];
/** 후보 한 줄. `is_low_confidence` 면 화면이 점선으로 표시하고 기본 선택에서 뺀다. */
export type ImportCandidateOut = Schemas['ImportCandidateOut'];
export type ImportCandidatePatch = Schemas['ImportCandidatePatch'];
export type ImportTextIn = Schemas['ImportTextIn'];
/** 캡처 한 장. `data:image/png;base64,...` 형태의 문자열 한 필드다. */
export type ImportImageIn = Schemas['ImportImageIn'];
/** 저장하면서 함께 보내는 선택 사항. 기억하지 않을 줄의 id. 비어 있으면 안 보낸다. */
export type ImportCommitIn = Schemas['ImportCommitIn'];
export type ImportCommitOut = Schemas['ImportCommitOut'];
/** 기억한 분류 규칙. 지울 수 있다. */
export type MerchantRuleOut = Schemas['MerchantRuleOut'];
export type MerchantRuleListOut = Schemas['MerchantRuleListOut'];
/** 손으로 걸어 두는 규칙. 같은 상호가 이미 있으면 분류만 바뀐다. */
export type MerchantRuleCreate = Schemas['MerchantRuleCreate'];

// ── 카테고리 ───────────────────────────────────
export type CategoryOut = Schemas['CategoryOut'];
export type CategoryListOut = Schemas['CategoryListOut'];
/** 내가 만드는 카테고리. 종류는 서버가 지출로 고정하므로 보내지 않는다. */
export type CategoryCreate = Schemas['CategoryCreate'];
export type CategoryUpdate = Schemas['CategoryUpdate'];

// ── 태그 ──────────────────────────────────────
/** 카테고리와 다른 축의 묶음. 한 기록에 하나만 붙는다. */
export type TagOut = Schemas['TagOut'];
export type TagListOut = Schemas['TagListOut'];
export type TagCreate = Schemas['TagCreate'];
export type TagUpdate = Schemas['TagUpdate'];
export type TagColor = Schemas['TagColor'];
export type TagKind = Schemas['TagKind'];

// ── 반복 지출 ──────────────────────────────────
/** 매달 같은 날 나가는 돈. 예고일 뿐이라 거래를 스스로 만들지 않는다. */
export type RecurringOut = Schemas['RecurringOut'];
export type RecurringListOut = Schemas['RecurringListOut'];
export type RecurringCreate = Schemas['RecurringCreate'];
export type RecurringUpdate = Schemas['RecurringUpdate'];
/** 오늘 물어볼 것 한 줄. 홈 카드가 이 목록으로 그린다. */
export type RecurringDueOut = Schemas['RecurringDueOut'];

// ── 자산 ──────────────────────────────────────
/** 자산 화면이 그리는 것 전부. 한 번도 안 적었으면 `snapshot` 이 null 이고 `items` 가 빈 배열이다. */
export type AssetsOut = Schemas['AssetsOut'];
/** 자산 항목 한 줄. 부채도 양수로 오고 뺄지는 `group` 이 정한다. */
export type AssetItemOut = Schemas['AssetItemOut'];
/** 저장할 항목 한 줄. 목록을 통째로 보내는 PUT 의 원소다. */
export type AssetItemIn = Schemas['AssetItemIn'];
export type AssetSnapshotPut = Schemas['AssetSnapshotPut'];
/** 언제 적은 것인지. 화면이 기준일을 이 날짜로 적는다. */
export type AssetSnapshotOut = Schemas['AssetSnapshotOut'];
/** 자산 합·부채 합·순자산. 남은 예산·이번 달 차액과 다른 개념이다. */
export type AssetSummaryOut = Schemas['AssetSummaryOut'];
/** 그룹 소계. 항목이 없는 그룹도 0 으로 오고, 오는 순서가 화면 구획 순서다. */
export type AssetGroupTotalOut = Schemas['AssetGroupTotalOut'];
export type AssetGroup = Schemas['AssetGroup'];
/** 투자 종류. 주식·ETF·코인은 수량 종목이다. */
export type InvestKind = Schemas['InvestKind'];
/** 수익률이 평가(`valuation`)인지 판 기록(`realized`)인지. */
export type RateKind = Schemas['RateKind'];
/** PUT 의 출처. 캡처로 채운 목록이면 `screenshot` 이다. */
export type AssetSource = Schemas['AssetSource'];
/** 월말 순자산 점들. 오래된 달부터 온다. */
export type AssetHistoryOut = Schemas['AssetHistoryOut'];
export type AssetHistoryPointOut = Schemas['AssetHistoryPointOut'];
/** 「내 자산 분석」. `fingerprint` 로 광고 잠금을 견준다. */
export type AssetAnalysisOut = Schemas['AssetAnalysisOut'];
export type AnalysisScope = Schemas['AnalysisScope'];
export type AnalysisSummaryOut = Schemas['AnalysisSummaryOut'];
export type AnalysisGroupSliceOut = Schemas['AnalysisGroupSliceOut'];
export type AnalysisItemSliceOut = Schemas['AnalysisItemSliceOut'];
export type AnalysisReturnsOut = Schemas['AnalysisReturnsOut'];
export type AnalysisReturnRowOut = Schemas['AnalysisReturnRowOut'];
export type AnalysisMonthChangeOut = Schemas['AnalysisMonthChangeOut'];
export type AnalysisGroupChangeOut = Schemas['AnalysisGroupChangeOut'];
export type AnalysisSavingOut = Schemas['AnalysisSavingOut'];
export type AnalysisGoalOut = Schemas['AnalysisGoalOut'];
export type AnalysisBundleOut = Schemas['AnalysisBundleOut'];
/** 잔액 화면 캡처를 읽은 후보. 아무것도 저장되지 않은 상태다. */
export type AssetCaptureOut = Schemas['AssetCaptureOut'];
export type AssetCaptureItemOut = Schemas['AssetCaptureItemOut'];

// ── 목표 ──────────────────────────────────────
/** 목표 조회·저장 응답. 진행 중인 목표가 없으면 `goal` 이 null 이고 그것이 정상이다. */
export type GoalStateOut = Schemas['GoalStateOut'];
/** 목표 하나. 남은 금액·진행률·필요 월저축액·도달 예상까지 서버가 센 값이 함께 온다. */
export type GoalOut = Schemas['GoalOut'];
/** 다 모으고 마친 목표들. 비어 있는 것이 정상이다. */
export type GoalHistoryOut = Schemas['GoalHistoryOut'];
export type GoalCreate = Schemas['GoalCreate'];
export type GoalPatch = Schemas['GoalPatch'];
/** 모은 돈 한 줄. 최근 것이 앞에 온다. */
export type GoalContributionOut = Schemas['GoalContributionOut'];
/** 모은 돈 한 번. 날짜를 안 보내면 서버가 가계부 기준 오늘로 남긴다. */
export type GoalContributionCreate = Schemas['GoalContributionCreate'];
/** 목표의 상태. 접은 목표는 조회에 오지 않는다. */
export type GoalStatus = Schemas['GoalStatus'];

// ── 설정 ──────────────────────────────────────
export type PreferencesOut = Schemas['PreferencesOut'];
export type MeOut = Schemas['MeOut'];
export type EmailVerifyOut = Schemas['EmailVerifyOut'];
export type ProfilePatch = Schemas['ProfilePatch'];
export type AgeBand = Schemas['AgeBand'];
export type Gender = Schemas['Gender'];
export type PreferencesPatch = Schemas['PreferencesPatch'];
/** 홈 맨 위에 무엇을 크게 보여줄지. */
export type HomeHero = Schemas['HomeHero'];
/** 기록 알림 설정. `remind_at` 은 `"20:00"` 모양이고 안 정했으면 null 이다. */
export type NotificationSettingsOut = Schemas['NotificationSettingsOut'];
/** 보낸 필드만 고친다. `remind_at: null` 은 정해 둔 시각을 지운다는 뜻이다. */
export type NotificationSettingsPatch = Schemas['NotificationSettingsPatch'];

// ── 공유 가계부 ────────────────────────────────
/** 누구와 같이 쓰나. 기본 이름, 돈 나누기 기본값, 처음 심는 분류가 여기서 갈린다. */
export type BookKind = Schemas['BookKind'];
/** `even` 은 반반·똑같이 나누기, `none` 은 같이 모은 돈(정산 없음). */
export type SettleRule = Schemas['SettleRule'];
export type BookRole = Schemas['BookRole'];
/** 멤버 한 명. 나간 멤버는 `name` 이 null 로 온다. 서버가 이름을 보내지 않는다. */
export type BookMemberOut = Schemas['BookMemberOut'];
export type BookCategoryOut = Schemas['BookCategoryOut'];
/** 공유 분류 만들기. 이름은 1~40자(앞뒤 공백을 걷는다), `icon_key` 는 64자까지. */
export type BookCategoryCreate = Schemas['BookCategoryCreate'];
/** 지금 쓸 수 있는 초대 링크. 닫혔거나 만료됐으면 가계부의 `invite` 가 null 이다. */
export type BookInviteOut = Schemas['BookInviteOut'];
export type BookOut = Schemas['BookOut'];
/** 내가 지금 멤버인 가계부. 끝난 것도 담긴다. */
export type BookListOut = Schemas['BookListOut'];
export type BookCreate = Schemas['BookCreate'];
/** 보낸 필드만 고친다. `monthly_budget: null` 은 예산을 지운다. */
export type BookUpdate = Schemas['BookUpdate'];
/** 초대 화면이 그리는 것. 지운 가계부와 모르는 코드는 이 모양이 아니라 404 다. */
export type InvitePreviewOut = Schemas['InvitePreviewOut'];
export type InviteStatus = InvitePreviewOut['status'];
export type JoinIn = Schemas['JoinIn'];
/** 공유 기록 한 줄. 1차는 지출만 있다. */
export type BookEntryOut = Schemas['BookEntryOut'];
export type BookEntryListOut = Schemas['BookEntryListOut'];
export type BookEntryCreate = Schemas['BookEntryCreate'];
export type BookEntryUpdate = Schemas['BookEntryUpdate'];
/** 저장한 기록이 들어간 달의 쓴 돈과 남은 예산. */
export type BookMonthStateOut = Schemas['BookMonthStateOut'];
export type BookEntryCreated = Schemas['BookEntryCreated'];
export type MoveOutResult = Schemas['MoveOutResult'];
export type MoveInIn = Schemas['MoveInIn'];
export type MoveOutIn = Schemas['MoveOutIn'];
export type SettlementMemberOut = Schemas['SettlementMemberOut'];
export type SettlementTransferOut = Schemas['SettlementTransferOut'];
export type SettlementDoneOut = Schemas['SettlementDoneOut'];
/** 같이 모은 돈(`none`)이면 members 와 transfers 가 비고 total 만 있다. */
export type SettlementOut = Schemas['SettlementOut'];
export type SettlementDoneIn = Schemas['SettlementDoneIn'];
export type BookCategoryChangeOut = Schemas['BookCategoryChangeOut'];
/** 자세히 보기. 잠금은 화면의 일이고 값은 늘 온다. */
export type BookInsightOut = Schemas['BookInsightOut'];
export type BookReportOut = Schemas['BookReportOut'];

// ── 오류 ──────────────────────────────────────
export type ErrorBody = Schemas['ErrorBody'];
export type ErrorEnvelope = Schemas['ErrorEnvelope'];
