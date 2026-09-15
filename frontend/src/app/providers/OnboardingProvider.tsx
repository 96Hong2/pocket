import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { OnboardingContext } from './onboardingContext';

/** 처음 안내가 떠 있는지를 한 곳에 둔다. 문지기가 적고, 다른 안내가 읽는다. */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [showing, setShowing] = useState<boolean | null>(null);
  const report = useCallback((value: boolean) => setShowing(value), []);
  const value = useMemo(() => ({ showing, setShowing: report }), [showing, report]);

  return <OnboardingContext value={value}>{children}</OnboardingContext>;
}
