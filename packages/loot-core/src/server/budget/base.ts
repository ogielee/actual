// @ts-strict-ignore
import * as monthUtils from '../../shared/months';
import { q } from '../../shared/query';
import { getChangedValues } from '../../shared/util';
import type { CategoryGroupEntity } from '../../types/models';
import { aqlQuery } from '../aql';
import * as db from '../db';
import * as sheet from '../sheet';
import { resolveName } from '../spreadsheet/util';

import * as budgetActions from './actions';
import * as envelopeBudget from './envelope';
import * as report from './report';

export function getBudgetType() {
  const meta = sheet.get().meta();
  return meta.budgetType || 'envelope';
}

export function isWeeklyBudget(): boolean {
  const freq = db.firstSync<Pick<db.DbPreference, 'value'>>(
    `SELECT value FROM preferences WHERE id = ?`,
    ['budgetFrequency'],
  );
  return (freq?.value ?? 'monthly') === 'weekly';
}

// Migrates monthly budget amounts into the first week of each month.
// Called once when the user switches from monthly to weekly budgeting.
// Monthly budget entries have 6-digit month integers (e.g., 202501).
// Weekly entries use 8-digit integers (e.g., 20250105). This never
// overwrites an existing weekly entry.
export async function migrateMonthlyToWeekly(): Promise<void> {
  const firstDayPref = db.firstSync<Pick<db.DbPreference, 'value'>>(
    `SELECT value FROM preferences WHERE id = ?`,
    ['firstDayOfWeekIdx'],
  );
  const firstDayIdx = firstDayPref?.value ?? '0';

  const budgetType = getBudgetType();
  const table =
    budgetType === 'tracking' ? 'reflect_budgets' : 'zero_budgets';

  // Monthly months are ≤6-digit integers (max 209912); weekly are 8-digit.
  const monthlyEntries = await db.all<{
    id: string;
    month: number;
    category: string;
    amount: number;
  }>(
    `SELECT id, month, category, amount FROM ${table} WHERE month > 0 AND month <= 999999 AND amount != 0`,
  );

  for (const entry of monthlyEntries) {
    const monthStr = String(entry.month).padStart(6, '0');
    const yyyy = monthStr.slice(0, 4);
    const mm = monthStr.slice(4, 6);
    const monthStart = `${yyyy}-${mm}-01`;

    // The week that contains the 1st of the month
    const firstWeek = monthUtils.weekFromDate(monthStart, firstDayIdx);
    const weekMonthInt = parseInt(firstWeek.replace(/-/g, ''));

    // Only migrate if no weekly entry exists yet for this category+week
    const existingWeekly = db.firstSync<{ id: string }>(
      `SELECT id FROM ${table} WHERE month = ? AND category = ?`,
      [weekMonthInt, entry.category],
    );

    if (!existingWeekly) {
      await budgetActions.setBudget({
        category: entry.category,
        month: firstWeek,
        amount: entry.amount,
      });
    }
  }
}

export function getBudgetRange(start: string, end: string) {
  if (isWeeklyBudget()) {
    const firstDayPref = db.firstSync<Pick<db.DbPreference, 'value'>>(
      `SELECT value FROM preferences WHERE id = ?`,
      ['firstDayOfWeekIdx'],
    );
    const firstDayIdx = firstDayPref?.value;
    start = monthUtils.weekFromDate(start, firstDayIdx);
    end = monthUtils.weekFromDate(end, firstDayIdx);
    if (start > end) {
      start = end;
    }
    start = monthUtils.subWeeks(start, 12);
    end = monthUtils.addWeeks(end, 52);
    return {
      start,
      end,
      range: monthUtils.weekRangeInclusive(start, end, firstDayIdx),
    };
  }

  start = monthUtils.getMonth(start);
  end = monthUtils.getMonth(end);

  // The start date should never be after the end date. If that
  // happened, the month range might be a valid range and weird
  // things happen
  if (start > end) {
    start = end;
  }

  // Budgets should exist 3 months before the earliest needed date
  // (either the oldest transaction or the current month if no
  // transactions yet), and a year from the current date. There's no
  // need to ever have budgets outside that range.
  start = monthUtils.subMonths(start, 3);
  end = monthUtils.addMonths(end, 12);

  return { start, end, range: monthUtils.rangeInclusive(start, end) };
}

export function createCategory(cat, sheetName, prevSheetName, start, end) {
  sheet.get().createDynamic(sheetName, 'sum-amount-' + cat.id, {
    initialValue: 0,
    run: () => {
      // Making this sync is faster!
      const rows = db.runQuery<{ amount: number }>(
        `SELECT SUM(amount) as amount FROM v_transactions_internal_alive t
           LEFT JOIN accounts a ON a.id = t.account
         WHERE t.date >= ${start} AND t.date <= ${end}
           AND category = '${cat.id}' AND a.offbudget = 0`,
        [],
        true,
      );
      const row = rows[0];
      const amount = row ? row.amount : 0;
      return amount || 0;
    },
  });

  if (getBudgetType() === 'envelope') {
    envelopeBudget.createCategory(cat, sheetName, prevSheetName);
  } else {
    void report.createCategory(cat, sheetName, prevSheetName);
  }
}

function handleAccountChange(months, oldValue, newValue) {
  if (!oldValue || oldValue.offbudget !== newValue.offbudget) {
    const rows = db.runQuery<Pick<db.DbTransaction, 'category'>>(
      `
        SELECT DISTINCT(category) as category FROM transactions
        WHERE acct = ?
      `,
      [newValue.id],
      true,
    );

    months.forEach(month => {
      const sheetName = monthUtils.sheetForMonth(month);

      rows.forEach(row => {
        sheet
          .get()
          .recompute(resolveName(sheetName, 'sum-amount-' + row.category));
      });
    });
  }
}

function handleTransactionChange(transaction, changedFields) {
  if (
    (changedFields.has('date') ||
      changedFields.has('acct') ||
      changedFields.has('amount') ||
      changedFields.has('category') ||
      changedFields.has('tombstone') ||
      changedFields.has('isParent')) &&
    transaction.date &&
    transaction.category
  ) {
    let period: string;
    if (isWeeklyBudget()) {
      const firstDayPref = db.firstSync<Pick<db.DbPreference, 'value'>>(
        `SELECT value FROM preferences WHERE id = ?`,
        ['firstDayOfWeekIdx'],
      );
      period = monthUtils.weekFromDate(
        db.fromDateRepr(transaction.date),
        firstDayPref?.value,
      );
    } else {
      period = monthUtils.monthFromDate(db.fromDateRepr(transaction.date));
    }
    const sheetName = monthUtils.sheetForMonth(period);

    sheet
      .get()
      .recompute(resolveName(sheetName, 'sum-amount-' + transaction.category));
  }
}

function handleCategoryMappingChange(months, oldValue, newValue) {
  months.forEach(month => {
    const sheetName = monthUtils.sheetForMonth(month);
    if (oldValue) {
      sheet
        .get()
        .recompute(resolveName(sheetName, 'sum-amount-' + oldValue.transferId));
    }
    sheet
      .get()
      .recompute(resolveName(sheetName, 'sum-amount-' + newValue.transferId));
  });
}

function handleBudgetMonthChange(budget) {
  const sheetName = monthUtils.sheetForMonth(budget.id);
  sheet.get().set(`${sheetName}!buffered`, budget.buffered);
}

function handleBudgetChange(budget) {
  if (budget.category) {
    const sheetName = monthUtils.sheetForMonth(budget.month.toString());
    sheet
      .get()
      .set(`${sheetName}!budget-${budget.category}`, budget.amount || 0);
    sheet
      .get()
      .set(
        `${sheetName}!carryover-${budget.category}`,
        budget.carryover === 1 ? true : false,
      );
    sheet.get().set(`${sheetName}!goal-${budget.category}`, budget.goal);
    sheet
      .get()
      .set(`${sheetName}!long-goal-${budget.category}`, budget.long_goal);
  }
}

export function triggerBudgetChanges(oldValues, newValues) {
  const { createdMonths = new Set() } = sheet.get().meta();
  const budgetType = getBudgetType();
  sheet.startTransaction();

  try {
    newValues.forEach((items, table) => {
      const old = oldValues.get(table);

      items.forEach(newValue => {
        const oldValue = old && old.get(newValue.id);

        if (table === 'zero_budget_months') {
          handleBudgetMonthChange(newValue);
        } else if (table === 'zero_budgets' || table === 'reflect_budgets') {
          handleBudgetChange(newValue);
        } else if (table === 'transactions') {
          const changed = new Set(
            Object.keys(getChangedValues(oldValue || {}, newValue) || {}),
          );

          if (oldValue) {
            handleTransactionChange(oldValue, changed);
          }
          handleTransactionChange(newValue, changed);
        } else if (table === 'category_mapping') {
          handleCategoryMappingChange(createdMonths, oldValue, newValue);
        } else if (table === 'categories') {
          if (budgetType === 'envelope') {
            envelopeBudget.handleCategoryChange(
              createdMonths,
              oldValue,
              newValue,
            );
          } else {
            report.handleCategoryChange(createdMonths, oldValue, newValue);
          }
        } else if (table === 'category_groups') {
          if (budgetType === 'envelope') {
            envelopeBudget.handleCategoryGroupChange(
              createdMonths,
              oldValue,
              newValue,
            );
          } else {
            report.handleCategoryGroupChange(createdMonths, oldValue, newValue);
          }
        } else if (table === 'accounts') {
          handleAccountChange(createdMonths, oldValue, newValue);
        }
      });
    });
  } finally {
    sheet.endTransaction();
  }
}

export async function doTransfer(categoryIds, transferId) {
  const { createdMonths: months } = sheet.get().meta();

  [...months].forEach(month => {
    const totalValue = categoryIds
      .map(id => {
        return budgetActions.getBudget({ month, category: id });
      })
      .reduce((total, value) => total + value, 0);

    const transferValue = budgetActions.getBudget({
      month,
      category: transferId,
    });

    void budgetActions.setBudget({
      month,
      category: transferId,
      amount: totalValue + transferValue,
    });
  });
}

export async function createBudget(months) {
  const { data: groups }: { data: CategoryGroupEntity[] } = await aqlQuery(
    q('category_groups').select('*'),
  );
  const categories = groups.flatMap(group => group.categories);

  sheet.startTransaction();
  const meta = sheet.get().meta();
  meta.createdMonths = meta.createdMonths || new Set();

  const budgetType = getBudgetType();

  if (budgetType === 'envelope') {
    envelopeBudget.createBudget(meta, categories, months);
  }

  months.forEach(month => {
    if (!meta.createdMonths.has(month)) {
      const prevMonth = monthUtils.prevMonth(month);
      const { start, end } = monthUtils.bounds(month);
      const sheetName = monthUtils.sheetForMonth(month);
      const prevSheetName = monthUtils.sheetForMonth(prevMonth);

      categories.forEach(cat => {
        createCategory(cat, sheetName, prevSheetName, start, end);
      });
      groups.forEach(group => {
        if (budgetType === 'envelope') {
          envelopeBudget.createCategoryGroup(group, sheetName);
        } else {
          report.createCategoryGroup(group, sheetName);
        }
      });

      if (budgetType === 'envelope') {
        envelopeBudget.createSummary(
          groups,
          categories,
          prevSheetName,
          sheetName,
        );
      } else {
        report.createSummary(groups, sheetName);
      }

      meta.createdMonths.add(month);
    }
  });

  sheet.get().setMeta(meta);
  sheet.endTransaction();

  // Wait for the spreadsheet to finish computing. Normally this won't
  // do anything (as values are cached) but on first run this need to
  // show the loading screen while it initially sets up.
  await sheet.waitOnSpreadsheet();
}

export async function createAllBudgets() {
  const earliestTransaction = await db.first<db.DbTransaction>(
    'SELECT * FROM transactions WHERE isChild=0 AND date IS NOT NULL ORDER BY date ASC LIMIT 1',
  );
  const earliestDate =
    earliestTransaction && db.fromDateRepr(earliestTransaction.date);

  const weekly = isWeeklyBudget();
  const firstDayPref = weekly
    ? db.firstSync<Pick<db.DbPreference, 'value'>>(
        `SELECT value FROM preferences WHERE id = ?`,
        ['firstDayOfWeekIdx'],
      )
    : null;
  const firstDayIdx = firstDayPref?.value;

  const currentPeriod = weekly
    ? monthUtils.currentWeek(firstDayIdx)
    : monthUtils.currentMonth();

  const startPeriod = earliestDate
    ? weekly
      ? monthUtils.weekFromDate(earliestDate, firstDayIdx)
      : monthUtils.getMonth(earliestDate)
    : currentPeriod;

  // Get the range based off of the earliest transaction and the
  // current period. If no transactions currently exist the current
  // period is also used as the starting period
  const { start, end, range } = getBudgetRange(startPeriod, currentPeriod);

  const meta = sheet.get().meta();
  const createdMonths = meta.createdMonths || new Set();
  const newMonths = range.filter(m => !createdMonths.has(m));

  if (newMonths.length > 0) {
    await createBudget(range);
  }

  return { start, end };
}

export async function setType(type) {
  const meta = sheet.get().meta();
  if (type === meta.budgetType) {
    return;
  }

  meta.budgetType = type;
  meta.createdMonths = new Set();

  // Go through and force all the cells to be recomputed
  const nodes = sheet.get().getNodes();
  db.transaction(() => {
    for (const name of nodes.keys()) {
      const [sheetName, cellName] = name.split('!');
      if (sheetName.match(/^budget\d+/)) {
        sheet.get().deleteCell(sheetName, cellName);
      }
    }
  });

  sheet.get().startCacheBarrier();
  void sheet.loadUserBudgets(db);
  const bounds = await createAllBudgets();
  sheet.get().endCacheBarrier();

  return bounds;
}
