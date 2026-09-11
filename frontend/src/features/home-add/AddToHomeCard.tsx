import { useEffect, useState } from 'react';

import { useBridge } from '../../app/providers';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { markHomeAddPrompted, readHomeAddPrompted } from '../../shared/lib/homeAddSeen';
import { iconUrl } from '../../shared/ui';

import { AddToHomeSheet } from './AddToHomeSheet';

/**
 * 첫 기록을 마친 사람에게 딱 한 번 뜨는 카드.
 *
 * **첫 기록 전에는 뜨지 않는다.** 써 보지도 않은 앱을 홈 화면에 놓으라는 말은 광고로 읽힌다.
 * 한 번 기록해 본 사람은 이 앱이 무엇인지 알고, 그때가 "다시 오기 쉽게 해 둘까" 를 물을
 * 유일한 순간이다.
 *
 * 어느 쪽 버튼을 눌러도 다시 뜨지 않는다. 나중에 마음이 바뀌면 앱 설정에 같은 안내가 있다.
 * 같은 카드가 매일 뜨면 안내가 아니라 잔소리가 된다.
 */
export function AddToHomeCard({ hasAnyTransaction }: { hasAnyTransaction: boolean }) {
  const bridge = useBridge();
  const analytics = useAnalytics();
  // 아직 모르는 동안(null)은 아무것도 그리지 않는다. 늦게 뜨는 쪽이 깜빡이는 쪽보다 낫다.
  const [prompted, setPrompted] = useState<boolean | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!hasAnyTransaction) return;
    let alive = true;
    void readHomeAddPrompted(bridge.storage).then((value) => {
      if (alive) setPrompted(value);
    });
    return () => {
      alive = false;
    };
  }, [bridge, hasAnyTransaction]);

  const visible = hasAnyTransaction && prompted === false;

  // 노출도 남긴다. 이 카드를 본 사람 중 몇이 안내를 열어 봤는지 알아야 문구를 고칠 수 있다.
  useEffect(() => {
    if (!visible) return;
    analytics.log(EVENTS.homeAddResult, { from: 'first_record', result: 'shown' }, {
      kind: 'impression',
    });
  }, [analytics, visible]);

  /*
    카드를 접은 뒤에도 시트는 살아 있어야 한다.

    '추가하는 법' 을 누르는 순간 "이미 안내했다" 로 표시하는데, 그 표시 때문에 카드가
    사라진다. 여기서 통째로 null 을 돌려주면 방금 연 시트까지 같이 사라져, 누르면
    아무 일도 안 일어나는 버튼이 된다.
  */
  if (!visible && !sheetOpen) return null;

  function settle(result: 'opened' | 'dismissed'): void {
    void markHomeAddPrompted(bridge.storage);
    setPrompted(true);
    analytics.log(EVENTS.homeAddResult, { from: 'first_record', result }, { kind: 'click' });
  }

  return (
    <>
      {visible ? (
        <section className="home-add" aria-labelledby="home-add-title">
          <img
            className="home-add__icon"
            src={iconUrl('57_smartphone')}
            alt=""
            aria-hidden="true"
          />
          <div className="home-add__body">
            <h2 className="home-add__title" id="home-add-title">
              홈 화면에 두면 10초가 3초가 돼요
            </h2>
            <p className="home-add__hint">토스를 열고 찾는 시간을 줄여요</p>
          </div>
          <div className="home-add__actions">
            <button type="button" className="home-add__later" onClick={() => settle('dismissed')}>
              다음에
            </button>
            <button
              type="button"
              className="home-add__go"
              onClick={() => {
                settle('opened');
                setSheetOpen(true);
              }}
            >
              추가하는 법
            </button>
          </div>
        </section>
      ) : null}

      <AddToHomeSheet open={sheetOpen} onClose={() => setSheetOpen(false)} from="first_record" />
    </>
  );
}
