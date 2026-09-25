import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { BottomSheet, Button, CategoryAvatar, SegmentedControl } from '../../shared/ui';

import { EXPORT_PERIODS, type ExportPeriod } from './period';
import { LEDGER_HEADER } from './rows';
import { useLedgerExport, type ExportFormat } from './useLedgerExport';

/**
 * 가계부를 파일로 내려받기.
 *
 * 설정 화면 링크 줄 하나가 자리다. 원래는 「CSV 내보내기 · 준비 중」 이라 적힌 못 누르는
 * 줄이었다. **감추지 않고 자리를 남겨 둔 이유가 그대로 이 기능의 이유다**: 적어 둔 것을
 * 언제든 꺼내 갈 수 있다는 것이 이 앱을 믿고 쓰게 하는 조건이다.
 *
 * 엑셀과 CSV 를 함께 준다. 열어 보는 사람에게는 엑셀이 편하고, 다른 가계부로 옮기는
 * 사람에게는 CSV 가 필요하다. 라벨을 엑셀로 적은 것은 누르기 전에 무엇을 얻는지가
 * 「CSV」 보다 분명해서다.
 */
export function ExportSetting() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="link-row" onClick={() => setOpen(true)}>
        <CategoryAvatar icon="23_document" size={48} />
        <span className="link-row__label">엑셀로 내보내기</span>
      </button>

      <ExportSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * 기간과 형식을 고르는 시트.
 *
 * 만드는 중에는 닫히지 않는다. 닫히면 결과가 갈 곳이 없어, 저장이 됐는지 안 됐는지
 * 모르는 채로 남는다.
 */
function ExportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ledgerExport = useLedgerExport();
  const [period, setPeriod] = useState<ExportPeriod>('this_month');
  const busy = ledgerExport.running != null;

  function close(): void {
    // 지난번 결과 줄을 지우고 닫는다. 남겨 두면 다시 열었을 때 방금 저장한 것으로 읽힌다.
    ledgerExport.reset();
    setPeriod('this_month');
    onClose();
  }

  function changePeriod(next: ExportPeriod): void {
    // 기간을 바꿀 때도 지운다. 「이번 달」 로 받은 줄이 「올해」 밑에 그대로 서 있으면
    // 올해치를 이미 받은 것으로 읽고 시트를 닫는다.
    ledgerExport.reset();
    setPeriod(next);
  }

  // 나가는 길을 하나로 모은다. 원래 onClose 를 넘기면 뒤로가기로 닫은 사람만 지난번 결과
  // 줄과 고른 기간을 그대로 물고 다시 연다.
  useOverlayBackClose(open, close, busy);

  return (
    <BottomSheet open={open} onClose={close} dismissible={!busy} title="엑셀로 내보내기">
      {open ? (
        <ExportForm ledgerExport={ledgerExport} period={period} onPeriodChange={changePeriod} />
      ) : null}
    </BottomSheet>
  );
}

interface ExportFormProps {
  ledgerExport: ReturnType<typeof useLedgerExport>;
  period: ExportPeriod;
  onPeriodChange: (next: ExportPeriod) => void;
}

function ExportForm({ ledgerExport, period, onPeriodChange }: ExportFormProps) {
  const { running, outcome, supported, unsupportedNotice, run } = ledgerExport;
  const busy = running != null;

  function download(format: ExportFormat): void {
    void run(period, format);
  }

  return (
    <div className="export-sheet">
      <p className="export-sheet__lead">적어 둔 기록을 파일로 만들어 기기에 저장해요.</p>

      <SegmentedControl
        className="export-sheet__periods"
        ariaLabel="내보낼 기간"
        options={EXPORT_PERIODS}
        value={period}
        onChange={onPeriodChange}
      />

      {/*
        무엇이 들어 있는지 먼저 적는다. 열어 보기 전에는 파일 안이 안 보인다.

        **네 줄에서 세 줄로 줄였다.** 회색 상자에 긴 문장 넷이 들어가니 어느 것이 중요한지
        안 보였고, 정작 눈에 담기는 것은 아무것도 없었다. 「왜 빠지나」 의 설명은 뺀다.
        여기서 궁금한 것은 무엇이 들어 있느냐지 우리 규칙의 근거가 아니다.

        **열 목록은 손으로 적지 않는다.** 줄이면서 「시간」 을 흘렸고, 파일에는 있는 열이
        안내에만 없었다. 만드는 쪽과 같은 상수를 그려 두 곳이 영영 안 어긋나게 한다.

        **셋째 줄의 둘은 빠지는 자리가 다르다.** 이체는 내역에 남고 요약에서만 빠지는데,
        안 쓴 날 표시는 파일 어디에도 안 들어간다(`rows.ts` 의 `toExportLines`).
        한 줄로 묶어 「요약에서 빠져요」 라고 적었더니 안 쓴 날을 찍어 둔 사람에게 거짓이 됐다.
      */}
      <ul className="export-sheet__list">
        <li>{LEDGER_HEADER.join(', ')}</li>
        <li>엑셀 파일에는 월별 요약과 카테고리별 요약 시트가 들어가요</li>
        <li>이체는 요약에서 빼요. 안 쓴 날 표시는 파일에 안 담겨요</li>
      </ul>

      {supported ? null : (
        <p className="export-sheet__notice" role="alert">
          {unsupportedNotice}
        </p>
      )}

      {outcome?.status === 'empty' ? (
        <p className="export-sheet__notice" role="alert">
          그 기간에 적어 둔 기록이 없어요. 다른 기간을 골라 보세요.
        </p>
      ) : null}

      {outcome?.status === 'failed' ? (
        <p className="export-sheet__notice" role="alert">
          {outcome.message}
        </p>
      ) : null}

      {outcome?.status === 'done' ? (
        <p className="export-sheet__done" role="status">
          {`${outcome.rows}건을 「${outcome.fileName}」 으로 저장했어요.`}
          {/*
            천장에 닿았으면 반드시 말한다. 다 받은 줄 알고 옛 기록을 지우는 사람이 있다.
            어디서 잘렸는지까지 적는다. 「기간을 나눠 한 번 더」 라고는 하지 않는다.
            고를 수 있는 기간이 넷뿐이라 그 앞을 꺼낼 자리가 실제로 없다.
          */}
          {outcome.partialFrom != null ? (
            <span className="export-sheet__done-hint">
              한 번에 1만 건까지 담을 수 있어서 {outcome.partialFrom}부터만 들어갔어요. 그 앞의
              기록은 앱에 그대로 있어요.
            </span>
          ) : null}
        </p>
      ) : null}

      <div className="export-sheet__actions">
        {/*
          만드는 중 표시는 **누른 버튼에만** 붙는다. 하나로 묶어 두면 CSV 를 눌렀는데 엑셀
          버튼이 「만드는 중」 으로 바뀌어, 엉뚱한 파일이 만들어지는 것으로 읽힌다.
          어느 파일인지까지 적어 두 버튼의 이름이 절대 같아지지 않게 한다.
        */}
        <Button fullWidth disabled={!supported || busy} onClick={() => download('xlsx')}>
          {running === 'xlsx' ? '엑셀 파일 만드는 중이에요' : '엑셀 파일 (.xlsx)'}
        </Button>
        {/*
          CSV 를 아래에 두되 감추지 않는다. 다른 가계부로 옮기려는 사람에게는 이쪽이
          필요한데, 더 보기 안에 넣으면 그런 사람이 이 앱에 그 길이 있는 것을 모른다.
        */}
        <Button
          variant="outline"
          fullWidth
          disabled={!supported || busy}
          onClick={() => download('csv')}
        >
          {running === 'csv' ? 'CSV 파일 만드는 중이에요' : 'CSV 파일 (.csv)'}
        </Button>
      </div>
    </div>
  );
}
