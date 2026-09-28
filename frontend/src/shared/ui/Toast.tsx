import { createPortal } from 'react-dom';

export interface ToastProps {
  text: string;
  /** 「되돌리기」 처럼 알림 안에서 바로 할 일. 없으면 글만 선다. */
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * 화면 아래에 잠깐 서는 한 줄 알림.
 *
 * 확인 창 대신 먼저 하고 알리는 자리에 쓴다(「지웠어요 [되돌리기]」). 창으로 묻는 것보다
 * 손이 한 번 덜 가고, 잘못 눌렀으면 알림에서 바로 되돌린다.
 *
 * **띄우고 감추는 것은 `ToastProvider` 가 한다.** 한 번에 하나만 서고 새 알림이 앞 알림을
 * 바로 갈아 끼운다. 이 부품은 그리기만 한다.
 *
 * 포털로 body 에 붙인다. 시트(60) 위, 떠나기 확인(80) 아래에 선다. 탭바와 시트 바닥 버튼을
 * 가리지 않게 탭바 높이만큼 띄운다.
 */
export function Toast({ text, actionLabel, onAction }: ToastProps) {
  return createPortal(
    <div className="pk-toast-root">
      <div className="pk-toast" role="status" aria-live="polite">
        <p className="pk-toast__text">{text}</p>
        {actionLabel != null && onAction != null ? (
          <button type="button" className="pk-toast__action" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
