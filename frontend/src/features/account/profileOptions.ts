import type { AgeBand, Gender, MeOut } from '../../shared/api';

/**
 * 연령대·성별의 보기와 이름.
 *
 * 온보딩 마지막 장과 「내 계정」 시트가 같은 목록을 쓴다. 두 벌로 두면 한쪽만 고쳐져
 * 같은 사람이 자리에 따라 다른 보기를 본다.
 */
export const AGE_BANDS: { value: AgeBand; label: string }[] = [
  { value: '10s', label: '10대' },
  { value: '20s', label: '20대' },
  { value: '30s', label: '30대' },
  { value: '40s', label: '40대' },
  { value: '50s', label: '50대' },
  { value: '60s_plus', label: '60대 이상' },
];

export const GENDERS: { value: Gender; label: string }[] = [
  { value: 'female', label: '여성' },
  { value: 'male', label: '남성' },
  { value: 'undisclosed', label: '말하지 않을래요' },
];

/** 카드 한 줄에 적을 요약. 둘 다 없으면 「아직 안 적었어요」. */
export function describeProfile(me: MeOut): string {
  const age = AGE_BANDS.find((item) => item.value === me.age_band)?.label;
  const gender = GENDERS.find((item) => item.value === me.gender)?.label;
  const parts = [age, gender === '말하지 않을래요' ? undefined : gender].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '아직 안 적었어요';
}
