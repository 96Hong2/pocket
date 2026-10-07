import { useImperativeHandle, type Ref } from 'react';

import { useInterstitial } from '../ads';

import { nextReadIsFree, useCaptureFlow } from './useCaptureFlow';
import { useReport } from './useReport';

export interface AssetFillHandle {
  /** 바깥 버튼이 곧바로 시작할 때. 캡처면 사진 고르기를 연다. */
  start: () => void;
  /** 검토 중인 것을 버리고 처음으로. */
  reset: () => void;
}

export interface AssetFillPanelProps {
  ref?: Ref<AssetFillHandle>;
  /** 읽거나 저장하는 동안 감싼 시트가 닫히거나 단계가 옮겨지지 않게 알린다. */
  onBusyChange: (busy: boolean) => void;
  /** 검토 화면에 든 줄 수. 감싼 시트가 닫기 확인과 크기를 이 값으로 정한다. */
  onPendingChange: (pending: number) => void;
  onSaved: () => void;
  onCancel: () => void;
}

export interface AssetCapturePanelProps extends AssetFillPanelProps {
  /** 못 읽은 화면의 「직접 적기」. */
  onManual: () => void;
}

/**
 * 기록하기의 「캡처로 정리」 + 「저축·투자」. 자산 화면의 캡처로 채우기와 같은 흐름이다.
 *
 * 같은 사진 고르기, 같은 광고 규칙, 같은 검토, 같은 저장을 쓴다. 시트 대신 기록 패널 안에 선다.
 */
export function AssetCapturePanel({
  ref,
  onBusyChange,
  onPendingChange,
  onSaved,
  onCancel,
  onManual,
}: AssetCapturePanelProps) {
  const flow = useCaptureFlow({ from: 'record', onSaved, onCancel, onManual });
  const { locked, pending, pick, reset } = flow;

  useImperativeHandle(ref, () => ({ start: () => void pick(), reset }), [pick, reset]);

  useReport(locked, onBusyChange);
  useReport(pending, onPendingChange);

  return flow.view;
}

/**
 * 기록하기 첫 화면 아래 버튼 밑 한 줄. 잔액 캡처는 읽을 때마다 광고가 서서 늘 적는다.
 *
 * 광고가 설 수 없는 기기와, 못 읽은 다음이라 광고 없이 읽는 한 번에는 적지 않는다.
 */
export function AssetCaptureAdLine() {
  const { available } = useInterstitial('asset_capture');
  if (!available || nextReadIsFree()) return null;
  return <p className="capture-sheet__note">읽는 동안 광고가 한 번 지나가요</p>;
}
