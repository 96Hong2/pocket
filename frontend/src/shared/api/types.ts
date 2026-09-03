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

// ── 예산·피드백 ────────────────────────────────
/** 남은 예산·하루 가용액·게이지 비율이 든 한 덩어리. 저장·수정·요약·조회가 모두 같은 모양으로 준다. */
export type BudgetStateOut = Schemas['BudgetStateOut'];
export type BudgetOut = Schemas['BudgetOut'];
export type BudgetUpsert = Schemas['BudgetUpsert'];
/** 문장이 아니라 종류와 숫자만 온다. 문장 조립은 화면이 한다. */
export type FeedbackOut = Schemas['FeedbackOut'];

// ── 카테고리 ───────────────────────────────────
export type CategoryOut = Schemas['CategoryOut'];
export type CategoryListOut = Schemas['CategoryListOut'];

// ── 오류 ──────────────────────────────────────
export type ErrorBody = Schemas['ErrorBody'];
export type ErrorEnvelope = Schemas['ErrorEnvelope'];
