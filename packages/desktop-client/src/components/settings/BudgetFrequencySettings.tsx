import React, { useState } from 'react';
import { Trans } from 'react-i18next';

import { ButtonWithLoading } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';

import { send } from 'loot-core/platform/client/connection';

import { Setting } from './UI';

import { useSyncedPref } from '@desktop-client/hooks/useSyncedPref';

export function BudgetFrequencySettings() {
  const [budgetFrequency = 'monthly', setBudgetFrequency] =
    useSyncedPref('budgetFrequency');
  const [isLoading, setIsLoading] = useState(false);

  async function onSwitchFrequency() {
    setIsLoading(true);
    try {
      const switchingToWeekly = budgetFrequency === 'monthly';
      setBudgetFrequency(switchingToWeekly ? 'weekly' : 'monthly');
      if (switchingToWeekly) {
        // Copy monthly budget amounts into the first week of each month so
        // the user can redistribute them across the remaining weeks.
        await send('budget/migrate-monthly-to-weekly');
      }
      await send('reset-budget-cache');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Setting
      primaryAction={
        <ButtonWithLoading onPress={onSwitchFrequency} isLoading={isLoading}>
          {budgetFrequency === 'weekly' ? (
            <Trans>Switch to monthly budgeting</Trans>
          ) : (
            <Trans>Switch to weekly budgeting</Trans>
          )}
        </ButtonWithLoading>
      }
    >
      <Text>
        <Trans>
          <strong>Weekly budgeting</strong> organises your budget by 7-day
          periods instead of calendar months.
        </Trans>
      </Text>
    </Setting>
  );
}
