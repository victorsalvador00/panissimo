import type {
  CountInput,
  PhysicalCountDto,
  PhysicalCountLine,
  UpdatePhysicalCountRequest,
} from '../data-access/physical-counts.api';

export type CountFilter = 'all' | 'pending' | 'counted';

/** Minúsculas y sin acentos, para buscar "azucar" y encontrar "Azúcar". */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** La línea coincide con la búsqueda por SKU, nombre o lote. */
export function lineMatches(line: PhysicalCountLine, query: string): boolean {
  const q = normalizeText(query);
  if (!q) {
    return true;
  }
  return [line.sku, line.itemName, line.lotNumber ?? ''].some((text) =>
    normalizeText(text).includes(q),
  );
}

/**
 * Cantidad contada vigente de la línea: lo capturado y aún sin guardar gana sobre lo guardado.
 * `null` = sin contar.
 */
export function currentCount(
  line: PhysicalCountLine,
  pending: ReadonlyMap<string, number>,
): number | null {
  return pending.get(line.id) ?? line.countedQty;
}

export function filterLines(
  lines: PhysicalCountLine[],
  query: string,
  filter: CountFilter,
  pending: ReadonlyMap<string, number>,
): PhysicalCountLine[] {
  return lines.filter((line) => {
    const counted = currentCount(line, pending) !== null;
    if ((filter === 'pending' && counted) || (filter === 'counted' && !counted)) {
      return false;
    }
    return lineMatches(line, query);
  });
}

export function countProgress(
  lines: PhysicalCountLine[],
  pending: ReadonlyMap<string, number>,
): { counted: number; total: number; missing: number } {
  const counted = lines.filter((line) => currentCount(line, pending) !== null).length;
  return { counted, total: lines.length, missing: lines.length - counted };
}

/** Líneas contadas cuya cantidad difiere del snapshot (lo que se registrará al cerrar). */
export function linesWithDifference(lines: PhysicalCountLine[]): PhysicalCountLine[] {
  return lines.filter((line) => line.countedQty !== null && (line.difference ?? 0) !== 0);
}

/**
 * Cantidades capturadas que aún no llegan al servidor. `take()` toma lo que se va a enviar y
 * `ack()` quita solo lo que no cambió mientras se guardaba (si el usuario siguió escribiendo en esa
 * línea, el valor nuevo queda pendiente para el siguiente guardado).
 */
export class PendingCounts {
  private readonly values = new Map<string, number>();

  get size(): number {
    return this.values.size;
  }

  get view(): ReadonlyMap<string, number> {
    return this.values;
  }

  set(lineId: string, value: number): void {
    this.values.set(lineId, value);
  }

  delete(lineId: string): void {
    this.values.delete(lineId);
  }

  take(): Map<string, number> {
    return new Map(this.values);
  }

  ack(sent: ReadonlyMap<string, number>): void {
    for (const [lineId, value] of sent) {
      if (this.values.get(lineId) === value) {
        this.values.delete(lineId);
      }
    }
  }

  clear(): void {
    this.values.clear();
  }
}

export function toCountInputs(values: ReadonlyMap<string, number>): CountInput[] {
  return [...values].map(([lineId, countedQty]) => ({
    lineId,
    countedQty,
    itemId: null,
    lotId: null,
    lotNumber: null,
    expirationDate: null,
  }));
}

/** PUT de un conteo en captura: conserva categoría y notas, y envía las cantidades. */
export function countUpdateRequest(
  count: PhysicalCountDto,
  counts: CountInput[],
): UpdatePhysicalCountRequest {
  return { version: count.version, categoryId: count.categoryId, notes: count.notes, counts };
}
