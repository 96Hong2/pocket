import type { ParseOutcome } from '../../shared/analytics';
import type { ImportBatchOut } from '../../shared/api';

/**
 * 읽어 온 결과를 한 낱말로.
 *
 * **캡처·영수증·줄글이 같은 함수를 쓴다.** 예전에는 줄글만 따로 판정해서, 상한에 걸려
 * 화면이 「n건은 다음에 나눠서 적어 주세요」 라고 말한 그 순간에도 로그는 온전한 성공으로
 * 남았다. 그러면 「줄글에 몇 줄까지 적게 할 것인가」 를 로그로 정할 수 없다.
 */
export function parseOutcome(batch: ImportBatchOut): ParseOutcome {
  if ((batch.candidates?.length ?? 0) === 0) return 'empty';
  return batch.error_code?.startsWith('TRUNCATED:') ? 'partial' : 'ok';
}
