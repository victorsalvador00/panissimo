/** `yyyy-MM-dd` of a local date (DateOnly in the API), without moving it to UTC. */
export function toIsoDate(date: Date | null | undefined): string | null {
  if (!date) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local date of a `yyyy-MM-dd` (DateOnly of the API), without the UTC shift of `new Date(iso)`. */
export function fromIsoDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Start of the local day as an instant, for `from` filters. */
export function startOfDayIso(date: Date | null | undefined): string | null {
  if (!date) return null;
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

/** End of the local day as an instant, for `to` filters (the whole day is included). */
export function endOfDayIso(date: Date | null | undefined): string | null {
  if (!date) return null;
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}
