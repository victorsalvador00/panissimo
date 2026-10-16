/** Rango de fechas (días completos, hora local) → instantes ISO para filtros `from`/`to` del backend. */
export function dayRange(
  from: Date | null,
  to: Date | null,
): { from: string | null; to: string | null } {
  const start = from ? new Date(from.getFullYear(), from.getMonth(), from.getDate()) : null;
  const end = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999) : null;
  return { from: start?.toISOString() ?? null, to: end?.toISOString() ?? null };
}

/** Fecha local como `yyyy-MM-dd` (DateOnly del backend), sin corrimiento por zona horaria. */
export function toDateOnly(date: Date | null): string | null {
  if (!date) {
    return null;
  }
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** `yyyy-MM-dd` (DateOnly del backend) como fecha local a medianoche. */
export function fromDateOnly(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}
