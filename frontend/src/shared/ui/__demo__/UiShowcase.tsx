import { useState, type ReactNode } from 'react';

import { colors, donutRamp } from '../../tokens';
import { Amount } from '../Amount';
import { BottomSheet } from '../BottomSheet';
import { Button } from '../Button';
import { Card } from '../Card';
import { CategoryAvatar } from '../CategoryAvatar';
import { Chip } from '../Chip';
import { Gauge } from '../Gauge';
import { MonthStepper } from '../MonthStepper';
import { SageCard } from '../SageCard';
import { SegmentedControl } from '../SegmentedControl';
import { Toggle } from '../Toggle';
import { TransactionRow } from '../TransactionRow';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PermissionDenied,
  RetryButton,
  UnsupportedFeature,
} from '../states';

/**
 * 프리미티브를 한 화면에 모아 눈으로 확인하는 데모.
 * 제품 화면이 아니라서 라우트 연결은 셸 쪽에서 정한다.
 */
export function UiShowcase() {
  const [month, setMonth] = useState('2026-09');
  const [mode, setMode] = useState<'keypad' | 'text' | 'capture'>('keypad');
  const [notify, setNotify] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="mx-auto flex max-w-[420px] flex-col gap-7 p-5 pb-16">
      <h1 className="text-16 font-bold">공용 UI 확인용 화면</h1>

      <Section title="Button">
        <div className="flex flex-col gap-2">
          <Button fullWidth>기록하기</Button>
          <Button variant="primarySmall">저장</Button>
          <Button variant="outline">예산 정하기</Button>
          <Button variant="ghost">나중에 할게요</Button>
          <Button disabled>비활성</Button>
        </div>
      </Section>

      <Section title="Card / SageCard">
        <Card padding="lg">
          <p className="text-13 text-muted">남은 예산</p>
          <Amount value={412000} size={26} weight={800} />
          <Gauge className="mt-3" ratio={0.62} label="예산 사용률 62%" />
        </Card>
        <SageCard>
          <p className="text-13 font-semibold text-sage-700">
            오늘까지 페이스대로 쓰고 있어요.
          </p>
        </SageCard>
      </Section>

      <Section title="Chip">
        <div className="flex flex-wrap items-center gap-2">
          <Chip variant="excluded">제외됨</Chip>
          <Chip variant="kind">이체</Chip>
          <Chip variant="caution">주의</Chip>
          <Chip variant="sage">이번 주 3일째</Chip>
          <Chip variant="coach">코치 한마디</Chip>
        </div>
      </Section>

      <Section title="Gauge">
        <Gauge ratio={0.45} size={10} label="10px 게이지" />
        <Gauge ratio={0.8} size={8} label="8px 게이지" />
        <Gauge ratio={1.3} size={6} label="6px 게이지, 예산 초과" />
      </Section>

      <Section title="MonthStepper">
        <MonthStepper value={month} onChange={setMonth} maxMonth="2026-09" />
        <MonthStepper
          value={month}
          onChange={setMonth}
          variant="compact"
          maxMonth="2026-09"
        />
      </Section>

      <Section title="SegmentedControl / Toggle">
        <SegmentedControl
          ariaLabel="기록 방식"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'keypad', label: '키패드' },
            { value: 'text', label: '문장' },
            { value: 'capture', label: '캡처' },
          ]}
        />
        <div className="flex items-center justify-between">
          <span className="text-14 font-semibold">기록 알림 받기</span>
          <Toggle
            checked={notify}
            onChange={setNotify}
            ariaLabel="기록 알림 받기"
          />
        </div>
      </Section>

      <Section title="TransactionRow / Amount">
        <Card padding="list">
          <TransactionRow
            icon="09_rice_bowl"
            title="김밥천국"
            subtitle="식비 · 오늘"
            amount={8500}
            avatarSize={54}
            density="compact"
          />
          <TransactionRow
            icon="28_cash"
            title="월급"
            subtitle="수입 · 9월 1일"
            amount={3200000}
            tone="income"
          />
          <TransactionRow
            icon="05_choice_arrows"
            title="적금 이체"
            subtitle="이체 · 9월 1일"
            amount={300000}
            tone="transfer"
            chips={<Chip variant="kind">이체</Chip>}
          />
          <TransactionRow
            icon="11_tshirt"
            title="유니클로"
            subtitle="쇼핑 · 8월 30일"
            amount={49000}
            excluded
            chips={<Chip variant="excluded">제외됨</Chip>}
            hideDivider
            onClick={() => setSheetOpen(true)}
          />
        </Card>
      </Section>

      <Section title="CategoryAvatar">
        <div className="flex items-end gap-3">
          {[44, 48, 54, 58].map((size) => (
            <CategoryAvatar key={size} icon="06_coffee" size={size} />
          ))}
        </div>
      </Section>

      <Section title="BottomSheet">
        <Button variant="outline" onClick={() => setSheetOpen(true)}>
          바텀시트 열기
        </Button>
        <BottomSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="거래 수정"
        >
          <p className="text-13 text-muted">
            Esc · 바깥 클릭 · 닫기 버튼 모두 닫힙니다.
          </p>
          <Button
            className="mt-4"
            fullWidth
            onClick={() => setSheetOpen(false)}
          >
            저장
          </Button>
        </BottomSheet>
      </Section>

      <Section title="상태 컴포넌트">
        <Card padding="md">
          <EmptyState
            title="아직 기록이 없어요"
            description="첫 기록은 10초면 끝나요."
            actionLabel="기록하기"
            onAction={() => setSheetOpen(true)}
            size="inline"
          />
        </Card>
        <Card padding="md">
          <ErrorState size="inline" onRetry={() => undefined} />
        </Card>
        <Card padding="md">
          <LoadingState variant="rows" rows={2} />
        </Card>
        <Card padding="md">
          <LoadingState size="inline" />
        </Card>
        <Card padding="md">
          <PermissionDenied
            resource="photos"
            size="inline"
            onRetry={() => undefined}
          />
        </Card>
        <Card padding="md">
          <UnsupportedFeature
            feature="앨범에서 캡처 불러오기"
            size="inline"
            fallbackAction={<RetryButton onRetry={() => undefined} label="직접 입력" />}
          />
        </Card>
      </Section>

      <Section title="색 토큰">
        <div className="flex flex-wrap gap-2">
          {Object.entries(colors).map(([name, value]) => (
            <div key={name} className="w-[72px]">
              <div
                className="h-10 rounded-sm border border-border"
                style={{ background: value }}
              />
              <p className="mt-1 text-10 text-muted">{name}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          {donutRamp.map((value) => (
            <div
              key={value}
              className="h-8 flex-1 rounded-xs"
              style={{ background: value }}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-12 font-bold text-muted">{title}</h2>
      {children}
    </section>
  );
}
