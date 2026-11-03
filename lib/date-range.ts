// Day pickers give "YYYY-MM-DD". A "to" day includes that whole day, so its upper bound is the start of the next one.
export function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
