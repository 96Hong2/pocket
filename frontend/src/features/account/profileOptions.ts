import type { AgeBand, Gender } from '../../shared/api';

/**
 * 연령대·성별의 보기와 이름.
 *
 * **묻는 자리는 처음 안내 마지막 장 하나뿐이다.** 「내 계정」 에서 다시 보여 주지 않는다.
 * 통계용으로 받아 둔 값을 계정 화면에 세우면, 가입과 상관없다고 적어 놔도 계정에 딸린
 * 개인정보로 읽힌다.
 */
export const AGE_BANDS: { value: AgeBand; label: string }[] = [
  { value: '10s', label: '10대' },
  { value: '20s', label: '20대' },
  { value: '30s', label: '30대' },
  { value: '40s', label: '40대' },
  { value: '50s', label: '50대' },
  { value: '60s_plus', label: '60대 이상' },
];

/**
 * 고를 수 있는 성별.
 *
 * **「말하지 않을래요」 는 뺐다.** 그 버튼이 있으면 안 고르고 넘어가면 될 것을 굳이 누르게 된다.
 * 안 고르는 것이 곧 말하지 않는 것이라, 보기를 하나 더 둘 이유가 없다.
 * 다만 예전에 그렇게 고른 사람의 값(`undisclosed`)은 서버에 그대로 남아 있다.
 */
export const GENDERS: { value: Gender; label: string }[] = [
  { value: 'female', label: '여성' },
  { value: 'male', label: '남성' },
];
