/**
 * 기기에 남긴 「이미 봤다」 표시를 한 번에 지운다.
 *
 * 안내는 대부분 한 번만 뜬다. 그 「한 번」 을 서버가 아니라 기기가 기억해서,
 * **서버 데이터를 지워도 안내는 다시 뜨지 않는다.** 실기기에서 첫 기록 흐름을 다시 보려면
 * 이 표시들도 함께 지워야 한다.
 *
 * 광고 끄기(`ad-opt-out`)는 **일부러 남긴다.** 그건 「봤다」 표시가 아니라 테스터가 켜 둔
 * 설정이고, 여기서 같이 지우면 자기 기기에 실광고가 다시 뜬다.
 */

import { markHomeAddReplay } from './homeAddSeen';
import type { KeyValueStore } from '../toss';

/** 지우는 키. 값은 각 모듈의 `KEY` 와 같아야 한다. */
const MARKS = ['home-add-prompted', 'visit-log'] as const;

/** 결산은 달마다 키가 따로다. 지금 달과 지난 열두 달을 훑는다. */
function closingKeys(now: Date): string[] {
  const keys: string[] = [];
  for (let back = 0; back <= 12; back += 1) {
    const at = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const month = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`;
    keys.push(`closing-seen-${month}`);
  }
  return keys;
}

/** 하나라도 실패하면 false. 「지웠다」 고 말하고 안 지워지는 것이 가장 나쁘다. */
export async function clearDeviceMarks(store: KeyValueStore, now: Date): Promise<boolean> {
  const keys = [...MARKS, ...closingKeys(now)];
  const results = await Promise.all(
    keys.map(async (key) => {
      try {
        await store.remove(key);
        return true;
      } catch {
        return false;
      }
    }),
  );
  /*
    표시를 지우는 것만으로는 홈 추가 안내가 다시 안 뜬다. 그 안내는 「기록 없음 → 있음」
    으로 바뀌는 순간에만 열리는데, 이미 적어 둔 기록이 있으면 그 전이가 다시 없다.
    그래서 「다음 홈 진입에서 한 번 열어라」 를 따로 남긴다.
  */
  await markHomeAddReplay(store);
  return results.every(Boolean);
}
