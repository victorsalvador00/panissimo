import { HttpErrorResponse } from '@angular/common/http';
import type { Schemas } from '../api/api';

/** Stock shortage of a 409 `insufficient_stock` (backend StockShortage; not part of the OpenAPI). */
export interface Shortage {
  itemId: string;
  sku: string;
  name: string;
  lotId: string | null;
  lotNumber: string | null;
  requested: number;
  available: number;
}

/**
 * RFC 9457 problem as the backend sends it (backend §6): `code` is the last segment of `type`; `errors` comes with a 400
 * (camelCase keys such as `lines[2].quantity`), `shortages` with a 409 `insufficient_stock`, `rowErrors` with an import.
 */
export type Problem = Omit<Schemas['ProblemDetails'], 'status'> & {
  status: number;
  code: string;
  errors?: Record<string, string[]>;
  shortages?: Shortage[];
  rowErrors?: Schemas['ImportError'][];
  traceId?: string;
};

const unexpected = 'Ocurrió un error inesperado. Si persiste, contacta al administrador.';

/** Reads the problem of a failed request; network errors and non-JSON bodies get a generic one. */
export function toProblem(error: unknown): Problem {
  if (!(error instanceof HttpErrorResponse))
    return { status: 0, code: 'unknown', detail: unexpected };
  if (error.status === 0)
    return {
      status: 0,
      code: 'network',
      detail: 'No hay conexión con el servidor. Revisa tu red e intenta de nuevo.',
    };

  const body: unknown = error.error;
  if (body && typeof body === 'object' && 'title' in body) {
    const problem = body as Partial<Problem>;
    return { ...problem, status: problem.status ?? error.status, code: problem.code ?? 'unknown' };
  }
  return {
    status: error.status,
    code: error.status >= 500 ? 'internal' : 'unknown',
    detail: unexpected,
  };
}
