// @ts-strict-ignore
import React, { createContext } from 'react';
import type { ReactNode } from 'react';

import * as monthUtils from 'loot-core/shared/months';

import { useSyncedPref } from '@desktop-client/hooks/useSyncedPref';

export type MonthBounds = {
  start: string;
  end: string;
};

export function getValidMonthBounds(
  bounds: MonthBounds,
  startMonth: undefined | string,
  endMonth: string,
) {
  return {
    start: startMonth < bounds.start ? bounds.start : startMonth,
    end: endMonth > bounds.end ? bounds.end : endMonth,
  };
}

type MonthsContextProps = {
  months: string[];
  type: string;
};

export const MonthsContext = createContext<MonthsContextProps>(null);

type MonthsProviderProps = {
  startMonth: string | undefined;
  numMonths: number;
  monthBounds: MonthBounds;
  type: string;
  children: ReactNode;
};

export function MonthsProvider({
  startMonth,
  numMonths,
  monthBounds,
  type,
  children,
}: MonthsProviderProps) {
  const [budgetFrequency = 'monthly'] = useSyncedPref('budgetFrequency');
  const [firstDayOfWeekIdx] = useSyncedPref('firstDayOfWeekIdx');
  const isWeekly = budgetFrequency === 'weekly';

  const endMonth = isWeekly
    ? monthUtils.addWeeks(startMonth, numMonths - 1)
    : monthUtils.addMonths(startMonth, numMonths - 1);
  const bounds = getValidMonthBounds(monthBounds, startMonth, endMonth);
  const months = isWeekly
    ? monthUtils.weekRangeInclusive(bounds.start, bounds.end, firstDayOfWeekIdx)
    : monthUtils.rangeInclusive(bounds.start, bounds.end);

  return (
    <MonthsContext.Provider value={{ months, type }}>
      {children}
    </MonthsContext.Provider>
  );
}
