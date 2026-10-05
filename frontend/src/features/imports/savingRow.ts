import type { ImportCandidateOut } from '../../shared/api';

/** 서버가 저축·투자로 읽은 이체. 항목을 정하지 못했어도(이름만 읽힘) 저축·투자다. */
export function isSavingRow(candidate: ImportCandidateOut): boolean {
  return (
    candidate.type === 'transfer' &&
    (candidate.asset_item_key != null || candidate.asset_name != null)
  );
}

/** 저축·투자로 읽었지만 「어디에」 를 아직 안 골랐나. 고르기 전에는 저장에서 뺀다. */
export function isUnpickedSaving(candidate: ImportCandidateOut): boolean {
  return isSavingRow(candidate) && candidate.asset_item_key == null;
}
