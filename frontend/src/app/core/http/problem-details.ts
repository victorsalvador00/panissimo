import { HttpErrorResponse } from '@angular/common/http';
import type { Schemas } from '../api/api-types';

/** Faltante de un 409 `insufficient_stock` (extensión de ProblemDetails, no está en el OpenAPI). */
export interface StockShortage {
  itemId: string;
  sku: string;
  name: string;
  lotId: string | null;
  requested: number;
  available: number;
}

/** Error de una fila de un CSV (400 `import_invalid`, extensión `rowErrors`). */
export interface ImportRowError {
  row: number;
  column: string | null;
  message: string;
}

/** ProblemDetails (RFC 9457) con las extensiones que agrega el backend (spec backend §6.1). */
export type ApiProblem = Schemas['ProblemDetails'] & {
  code?: string;
  traceId?: string;
  errors?: Record<string, string[]>;
  shortages?: StockShortage[];
  rowErrors?: ImportRowError[];
};

/** Extrae el ProblemDetails de una respuesta de error, si lo trae. */
export function toProblem(error: unknown): ApiProblem | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const body: unknown = error.error;
  if (body && typeof body === 'object' && PROBLEM_KEYS.some((key) => key in body)) {
    return body as ApiProblem;
  }
  return null;
}

const PROBLEM_KEYS = ['type', 'title', 'status', 'detail', 'code', 'traceId', 'errors'];
