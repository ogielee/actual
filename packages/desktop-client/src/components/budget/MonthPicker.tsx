// @ts-strict-ignore
import React, { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import {
  SvgCheveronLeft,
  SvgCheveronRight,
} from '@actual-app/components/icons/v1';
import { SvgCalendar } from '@actual-app/components/icons/v2';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import * as monthUtils from 'loot-core/shared/months';

import type { MonthBounds } from './MonthsContext';
import { WeekPicker } from './WeekPicker';

import { Link } from '@desktop-client/components/common/Link';
import { useLocale } from '@desktop-client/hooks/useLocale';
import { useResizeObserver } from '@desktop-client/hooks/useResizeObserver';
import { useSyncedPref } from '@desktop-client/hooks/useSyncedPref';

type MonthPickerProps = {
  startMonth: string;
  numDisplayed: number;
  monthBounds: MonthBounds;
  style: CSSProperties;
  onSelect: (month: string) => void;
};

export const MonthPicker = ({
  startMonth,
  numDisplayed,
  monthBounds,
  style,
  onSelect,
}: MonthPickerProps) => {
  const locale = useLocale();
  const { t } = useTranslation();
  const [hoverId, setHoverId] = useState(null);
  const [targetMonthCount, setTargetMonthCount] = useState(12);
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const weekPickerRef = useRef<HTMLDivElement>(null);

  const [budgetFrequency = 'monthly'] = useSyncedPref('budgetFrequency');
  const [firstDayOfWeekIdx] = useSyncedPref('firstDayOfWeekIdx');
  const isWeekly = budgetFrequency === 'weekly';

  const currentPeriod = isWeekly
    ? monthUtils.currentWeek(firstDayOfWeekIdx)
    : monthUtils.currentMonth();

  const firstSelectedMonth = startMonth;

  const lastSelectedMonth = isWeekly
    ? monthUtils.addWeeks(firstSelectedMonth, numDisplayed - 1)
    : monthUtils.addMonths(firstSelectedMonth, numDisplayed - 1);

  const range = isWeekly
    ? monthUtils.weekRangeInclusive(
        monthUtils.subWeeks(
          firstSelectedMonth,
          Math.floor(targetMonthCount / 2 - numDisplayed / 2),
        ),
        monthUtils.addWeeks(
          lastSelectedMonth,
          Math.floor(targetMonthCount / 2 - numDisplayed / 2),
        ),
        firstDayOfWeekIdx,
      )
    : monthUtils.rangeInclusive(
        monthUtils.subMonths(
          firstSelectedMonth,
          Math.floor(targetMonthCount / 2 - numDisplayed / 2),
        ),
        monthUtils.addMonths(
          lastSelectedMonth,
          Math.floor(targetMonthCount / 2 - numDisplayed / 2),
        ),
      );

  const firstSelectedIndex =
    Math.floor(range.length / 2) - Math.floor(numDisplayed / 2);
  const lastSelectedIndex = firstSelectedIndex + numDisplayed - 1;

  const [size, setSize] = useState('small');
  const containerRef = useResizeObserver(rect => {
    setSize(rect.width <= 400 ? 'small' : 'big');
    setTargetMonthCount(
      Math.min(Math.max(Math.floor(rect.width / 50), 12), 24),
    );
  });

  const yearHeadersShown = [];
  const monthHeadersShown = [];

  // Close week picker when clicking outside
  const handleOutsideClick = (e: MouseEvent) => {
    if (
      weekPickerRef.current &&
      !weekPickerRef.current.contains(e.target as Node)
    ) {
      setShowWeekPicker(false);
      document.removeEventListener('click', handleOutsideClick);
    }
  };

  const toggleWeekPicker = () => {
    if (!showWeekPicker) {
      setTimeout(
        () => document.addEventListener('click', handleOutsideClick),
        0,
      );
    } else {
      document.removeEventListener('click', handleOutsideClick);
    }
    setShowWeekPicker(v => !v);
  };

  return (
    <View
      style={{
        flexDirection: 'column',
        ...style,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
      <View
        innerRef={containerRef}
        style={{
          flexDirection: 'row',
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Today / Calendar icon button */}
        <Link
          variant="button"
          buttonVariant="bare"
          onPress={() => {
            if (isWeekly) {
              toggleWeekPicker();
            } else {
              onSelect(currentPeriod);
            }
          }}
          style={{
            padding: '3px 3px',
            marginRight: '12px',
          }}
        >
          <View title={isWeekly ? t('Pick a week') : t('Today')}>
            <SvgCalendar
              style={{
                width: 16,
                height: 16,
              }}
            />
          </View>
        </Link>

        {/* This week quick-jump (weekly mode only) */}
        {isWeekly && (
          <Link
            variant="button"
            buttonVariant="bare"
            onPress={() => onSelect(currentPeriod)}
            style={{
              padding: '3px 5px',
              marginRight: '12px',
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            <View title={t('This week')}>{t('This Week')}</View>
          </Link>
        )}

        {/* Week picker popover */}
        {isWeekly && showWeekPicker && (
          <div
            ref={weekPickerRef}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 1000,
              marginTop: 4,
            }}
          >
            <WeekPicker
              selectedWeek={startMonth}
              firstDayOfWeekIdx={firstDayOfWeekIdx}
              onSelect={week => {
                onSelect(week);
                setShowWeekPicker(false);
              }}
              onClose={() => setShowWeekPicker(false)}
            />
          </div>
        )}

        <Link
          variant="button"
          buttonVariant="bare"
          onPress={() => onSelect(monthUtils.prevMonth(startMonth))}
          style={{
            padding: '3px 3px',
            marginRight: '12px',
          }}
        >
          <View title={isWeekly ? t('Previous week') : t('Previous month')}>
            <SvgCheveronLeft
              style={{
                width: 16,
                height: 16,
              }}
            />
          </View>
        </Link>

        {range.map((month, idx) => {
          const selected =
            idx >= firstSelectedIndex && idx <= lastSelectedIndex;

          const lastHoverId = hoverId + numDisplayed - 1;
          const hovered =
            hoverId === null ? false : idx >= hoverId && idx <= lastHoverId;

          const current = currentPeriod === month;
          const year = isWeekly ? month.slice(0, 4) : monthUtils.getYear(month);

          let showYearHeader = false;
          if (!yearHeadersShown.includes(year)) {
            yearHeadersShown.push(year);
            showYearHeader = true;
          }

          let showMonthHeader = false;
          let monthLabel = '';
          if (isWeekly) {
            const m = month.slice(0, 7);
            if (!monthHeadersShown.includes(m)) {
              monthHeadersShown.push(m);
              showMonthHeader = true;
              monthLabel = monthUtils.format(month, 'MMM', locale);
            }
          }

          const isMonthBudgeted =
            month >= monthBounds.start && month <= monthBounds.end;

          const label = isWeekly
            ? `${parseInt(monthUtils.format(month, 'II'))}`
            : size === 'small'
              ? monthUtils.format(month, 'MMM', locale)[0]
              : monthUtils.format(month, 'MMM', locale);

          return (
            <View
              key={month}
              style={{
                alignItems: 'center',
                padding: '3px 3px',
                width: size === 'big' ? '35px' : '20px',
                textAlign: 'center',
                userSelect: 'none',
                cursor: 'default',
                borderRadius: 2,
                border: 'none',
                ...(!isMonthBudgeted && {
                  textDecoration: 'line-through',
                  color: theme.pageTextSubdued,
                }),
                ...styles.smallText,
                ...(selected && {
                  backgroundColor: theme.buttonPrimaryBackground,
                  color: theme.buttonPrimaryText,
                }),
                ...((hovered || selected) && {
                  borderRadius: 0,
                  cursor: 'pointer',
                }),
                ...(hoverId !== null &&
                  !hovered &&
                  selected && {
                    filter: 'brightness(65%)',
                  }),
                ...(hovered &&
                  !selected && {
                    backgroundColor: theme.buttonBareBackgroundHover,
                  }),
                ...(!hovered &&
                  !selected &&
                  current && {
                    backgroundColor: theme.buttonBareBackgroundHover,
                    filter: 'brightness(120%)',
                  }),
                ...(hovered &&
                  selected &&
                  current && {
                    filter: 'brightness(120%)',
                  }),
                ...(hovered &&
                  selected && {
                    backgroundColor: theme.buttonPrimaryBackground,
                  }),
                ...((idx === firstSelectedIndex ||
                  (idx === hoverId && !selected)) && {
                  borderTopLeftRadius: 2,
                  borderBottomLeftRadius: 2,
                }),
                ...((idx === lastSelectedIndex ||
                  (idx === lastHoverId && !selected)) && {
                  borderTopRightRadius: 2,
                  borderBottomRightRadius: 2,
                }),
                ...(current && { fontWeight: 'bold' }),
              }}
              onClick={() => onSelect(month)}
              onMouseEnter={() => setHoverId(idx)}
              onMouseLeave={() => setHoverId(null)}
            >
              <View>
                {label}
                {isWeekly
                  ? showMonthHeader && (
                      <View
                        style={{
                          position: 'absolute',
                          top: -22,
                          left: 0,
                          fontSize: 9,
                          fontWeight: 'bold',
                          color: isMonthBudgeted
                            ? theme.pageText
                            : theme.pageTextSubdued,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {monthLabel}
                      </View>
                    )
                  : showYearHeader && (
                      <View
                        style={{
                          position: 'absolute',
                          top: -16,
                          left: 0,
                          fontSize: 10,
                          fontWeight: 'bold',
                          color: isMonthBudgeted
                            ? theme.pageText
                            : theme.pageTextSubdued,
                        }}
                      >
                        {year}
                      </View>
                    )}
              </View>
            </View>
          );
        })}

        {/* Next week / month */}
        <Link
          variant="button"
          buttonVariant="bare"
          onPress={() => onSelect(monthUtils.nextMonth(startMonth))}
          style={{
            padding: '3px 3px',
            marginLeft: '12px',
          }}
        >
          <View title={isWeekly ? t('Next week') : t('Next month')}>
            <SvgCheveronRight
              style={{
                width: 16,
                height: 16,
              }}
            />
          </View>
        </Link>

        {/* Keep range centered — only in non-weekly mode */}
        {!isWeekly && (
          <span
            style={{
              width: '22px',
              marginLeft: '12px',
            }}
          />
        )}
      </View>
      </View>

    </View>
  );
};
