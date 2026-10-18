import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { ApiEnum, Schemas } from '../../../core/api/api';
import { httpParams } from '../../../shared/data-access/list-query';

export type TraceGraph = Schemas['TraceGraphDto'];
export type TraceNode = Schemas['TraceNodeDto'];
export type TraceEdge = Schemas['TraceEdgeDto'];
export type TraceGroup = Schemas['TraceGroupDto'];
export type TraceEvent = Schemas['TraceEventDto'];
export type TraceSource = Schemas['TraceSourceDto'];
export type TraceSourceType = ApiEnum<'TraceSourceType'>;
export type TraceDirection = ApiEnum<'TraceDirection'>;

/** `/traceability/*` (B-28, RN-100..RN-109): the chain of a lot, an OC, an OP, a transfer or a shipment. */
@Injectable({ providedIn: 'root' })
export class TraceabilityApi {
  private readonly http = inject(HttpClient);

  graph(
    sourceType: TraceSourceType,
    sourceId: string,
    direction: TraceDirection | null,
  ): Observable<TraceGraph> {
    return this.http.get<TraceGraph>('traceability/graph', {
      params: httpParams({ sourceType, sourceId, direction }),
    });
  }

  /** Entry points by folio (OC-, OP-, TR-, RM-) or lot number. */
  sources(q: string): Observable<TraceSource[]> {
    return this.http.get<TraceSource[]>('traceability/sources/lookup', {
      params: httpParams({ q }),
    });
  }
}

/** Route segment of each entry point: `/inventario/trazabilidad/:tipo/:id`. */
export const SOURCE_SEGMENTS: Readonly<Record<TraceSourceType, string>> = {
  Lot: 'lote',
  PurchaseOrder: 'oc',
  ProductionOrder: 'op',
  Transfer: 'traspaso',
  CustomerShipment: 'remision',
};

export function sourceTypeOf(segment: string): TraceSourceType | null {
  const found = Object.entries(SOURCE_SEGMENTS).find(([, s]) => s === segment);
  return found ? (found[0] as TraceSourceType) : null;
}

/** `?direccion=` of the route. */
export const DIRECTION_SEGMENTS: Readonly<Record<TraceDirection, string>> = {
  Backward: 'atras',
  Forward: 'adelante',
  Both: 'ambas',
};

export function directionOf(segment: string | null | undefined): TraceDirection | null {
  const found = Object.entries(DIRECTION_SEGMENTS).find(([, s]) => s === segment);
  return found ? (found[0] as TraceDirection) : null;
}

/** RN-100: the default direction of each entry point. */
export function defaultDirection(type: TraceSourceType): TraceDirection {
  return type === 'PurchaseOrder' ? 'Forward' : type === 'CustomerShipment' ? 'Backward' : 'Both';
}
