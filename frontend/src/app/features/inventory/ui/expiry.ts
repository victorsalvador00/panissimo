/** "vence hoy", "en 1 día", "en 5 días" (frontend §7.3). */
export function daysToExpireText(days: number | null | undefined): string {
  if (days === null || days === undefined) return '';
  if (days <= 0) return 'vence hoy';
  return days === 1 ? 'en 1 día' : `en ${days} días`;
}
