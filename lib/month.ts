export interface YearMonth {
  year: number;
  month: number; // 1-12
}

export function ymKey(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, "0")}`;
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  const total = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

export function isDateInMonth(date: string, ym: YearMonth): boolean {
  return date.startsWith(ymKey(ym));
}

export function daysInMonth(ym: YearMonth): number {
  return new Date(ym.year, ym.month, 0).getDate();
}

export function buildMonthOptions(center: YearMonth, before: number, after: number): YearMonth[] {
  const options: YearMonth[] = [];
  for (let i = -before; i <= after; i++) {
    options.push(addMonths(center, i));
  }
  return options;
}
