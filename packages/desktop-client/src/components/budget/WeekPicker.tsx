// @ts-strict-ignore
import React, { useState } from 'react';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import * as monthUtils from 'loot-core/shared/months';
import type { SyncedPrefs } from 'loot-core/types/prefs';

type WeekPickerProps = {
  selectedWeek: string;
  firstDayOfWeekIdx?: SyncedPrefs['firstDayOfWeekIdx'];
  onSelect: (week: string) => void;
  onClose: () => void;
};

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function WeekPicker({
  selectedWeek,
  firstDayOfWeekIdx,
  onSelect,
  onClose,
}: WeekPickerProps) {
  // Start by showing the month containing the selected week
  const [viewMonth, setViewMonth] = useState(() =>
    monthUtils.getMonth(selectedWeek),
  );

  const firstDayIdx = parseInt(firstDayOfWeekIdx || '0');

  // Build header labels starting from firstDayIdx
  const headers = Array.from({ length: 7 }, (_, i) =>
    DAY_LABELS[(firstDayIdx + i) % 7],
  );

  // Build calendar grid: all days in viewMonth plus padding
  const monthStart = monthUtils._parse(viewMonth + '-01');
  const monthEnd = monthUtils._parse(
    monthUtils.getMonthEnd(viewMonth + '-01'),
  );

  // Collect all days, padded to fill week rows
  const firstDay = new Date(monthStart);
  const dayOfWeek = firstDay.getDay();
  const offsetDays = (dayOfWeek - firstDayIdx + 7) % 7;

  const startDate = monthUtils.subDays(
    monthUtils.dayFromDate(firstDay),
    offsetDays,
  );

  const endDay = monthUtils.dayFromDate(monthEnd);
  // Extend end to fill the last row
  const endDayOfWeek = monthEnd.getDay();
  const trailingDays = (6 - ((endDayOfWeek - firstDayIdx + 7) % 7));
  const gridEnd = monthUtils.addDays(endDay, trailingDays);

  const allDays = monthUtils._dayRange(startDate, gridEnd, true);

  // Group into weeks
  const weeks: string[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  const currentWeek = monthUtils.currentWeek(firstDayOfWeekIdx);
  const today = monthUtils.currentDay();

  return (
    <View
      style={{
        backgroundColor: theme.menuBackground,
        border: `1px solid ${theme.menuBorder}`,
        borderRadius: 4,
        padding: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        userSelect: 'none',
        minWidth: 220,
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Month navigation */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <button
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.pageText,
            fontSize: 14,
            padding: '2px 6px',
          }}
          onClick={() => setViewMonth(monthUtils.subMonths(viewMonth, 1))}
        >
          ‹
        </button>
        <span
          style={{
            fontWeight: 'bold',
            fontSize: 13,
            color: theme.pageText,
          }}
        >
          {monthUtils.format(viewMonth + '-01', 'MMMM yyyy')}
        </span>
        <button
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.pageText,
            fontSize: 14,
            padding: '2px 6px',
          }}
          onClick={() => setViewMonth(monthUtils.addMonths(viewMonth, 1))}
        >
          ›
        </button>
      </View>

      {/* Day headers */}
      <View
        style={{ flexDirection: 'row', marginBottom: 2 }}
      >
        {headers.map(h => (
          <View
            key={h}
            style={{
              width: 28,
              textAlign: 'center',
              fontSize: 10,
              color: theme.pageTextSubdued,
              fontWeight: 'bold',
            }}
          >
            {h}
          </View>
        ))}
      </View>

      {/* Week rows */}
      {weeks.map(week => {
        const weekStart = week[0];
        const isSelected = weekStart === selectedWeek;
        const isCurrentWeek = weekStart === currentWeek;
        const containsToday = week.includes(today);

        return (
          <View
            key={weekStart}
            style={{
              flexDirection: 'row',
              cursor: 'pointer',
              borderRadius: 3,
              marginBottom: 1,
              backgroundColor: isSelected
                ? theme.buttonPrimaryBackground
                : isCurrentWeek
                  ? theme.buttonBareBackgroundHover
                  : 'transparent',
            }}
            onClick={() => {
              onSelect(weekStart);
              onClose();
            }}
          >
            {week.map(day => {
              const inMonth = monthUtils.getMonth(day) === viewMonth;
              const isToday = day === today;
              return (
                <View
                  key={day}
                  style={{
                    width: 28,
                    height: 24,
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    color: isSelected
                      ? theme.buttonPrimaryText
                      : inMonth
                        ? isToday
                          ? theme.pageText
                          : theme.pageText
                        : theme.pageTextSubdued,
                    fontWeight: isToday ? 'bold' : 'normal',
                  }}
                >
                  {parseInt(day.slice(8), 10)}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}
