/**
 * 이 기기에서 배너를 끄는 표시.
 *
 * **만든 사람이 자기 앱의 광고를 보면 안 된다.** 같은 사람이 같은 자리를 반복해서 보고
 * 누르면 무효 트래픽으로 잡히고, 쌓이면 광고 계정이 막힌다. 되돌리는 데 오래 걸린다.
 *
 * 자동으로 가릴 방법이 없어서 기기에 표시를 남긴다. 판(`sandbox`)으로 가르는 것만으로는
 * 모자라다. QR 테스트가 `toss` 로 잡히면 그 방어가 통째로 비껴간다.
 *
 * 서버에 두지 않는 이유는 [[homeAddSeen]] 과 같다. 광고를 보느냐 마느냐는 그 휴대폰에서
 * 정하는 일이고, 우리 익명키에 「테스터」 표시를 붙이면 그것 자체가 사람을 가리키는 값이 된다.
 */

import type { KeyValueStore } from '../toss';

const KEY = 'ad-opt-out';

/** 저장소가 막혀 있으면 '끄지 않았다' 로 본다. 광고가 뜨는 쪽이 기본값이다. */
export async function readAdOptOut(store: KeyValueStore): Promise<boolean> {
  try {
    return (await store.get(KEY)) === '1';
  } catch {
    return false;
  }
}

/** 실패하면 false 를 돌려준다. 화면이 "꺼졌다" 고 말하고 실제로는 안 꺼지면 안 된다. */
export async function writeAdOptOut(store: KeyValueStore, optOut: boolean): Promise<boolean> {
  try {
    if (optOut) await store.set(KEY, '1');
    else await store.remove(KEY);
    return true;
  } catch {
    return false;
  }
}
