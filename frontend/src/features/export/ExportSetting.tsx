import { useState } from 'react';

import { useOverlayBackClose } from '../../app/providers';
import { BottomSheet, Button, CategoryAvatar, SegmentedControl } from '../../shared/ui';

import { EXPORT_PERIODS, type ExportPeriod } from './period';
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

  useOverlayBackClose(open, onClose, ledgerExport.busy);

  function close(): void {
    // 지난번 결과 줄을 지우고 닫는다. 남겨 두면 다시 열었을 때 방금 저장한 것으로 읽힌다.
    ledgerExport.reset();
    setPeriod('this_month');
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      onClose={close}
      dismissible={!ledgerExport.busy}
      title="엑셀로 내보내기"
    >
      {open ? (
        <ExportForm ledgerExport={ledgerExport} period={period} onPeriodChange={setPeriod} />
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
  const { busy, outcome, supported, unsupportedNotice, run } = ledgerExport;

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

      {/* 무엇이 들어 있는지 먼저 적는다. 열어 보기 전에는 파일 안이 안 보인다. */}
      <ul className="export-sheet__list">
        <li>날짜·시간·구분·카테고리·내용·금액·결제수단·메모</li>
        <li>엑셀 파일에는 월별 요약과 카테고리별 요약이 함께 들어가요</li>
        <li>이체는 요약에서 빼요. 옮긴 돈은 쓴 돈도 번 돈도 아니에요</li>
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
          */}
          {outcome.capped ? (
            <span className="export-sheet__done-hint">
              한 번에 1만 건까지 담겨서 최근 것부터 들어갔어요. 기간을 나눠 한 번 더 내보내면
              나머지도 받을 수 있어요.
            </span>
          ) : null}
        </p>
      ) : null}

      <div className="export-sheet__actions">
        <Button fullWidth disabled={!supported || busy} onClick={() => download('xlsx')}>
          {busy ? '만드는 중이에요' : '엑셀 파일 (.xlsx)'}
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
          CSV 파일 (.csv)
        </Button>
      </div>
    </div>
  );
}
