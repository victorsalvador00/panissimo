import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { Schemas } from '../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../core/http/list-query';

export type AuditLogEntry = Schemas['AuditLogDto'];
export type AuditLogPage = Schemas['PagedResultOfAuditLogDto'];

export interface AuditLogFilters {
  entityType?: string | null;
  entityId?: string | null;
  userId?: string | null;
  /** Instantes ISO 8601 (inicio y fin del rango, inclusive). */
  from?: string | null;
  to?: string | null;
}

/** Bitácora (`GET /audit-log`, permiso `security.audit.view`). */
@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private readonly http = inject(HttpClient);

  list(query: Partial<ListQuery>, filters: AuditLogFilters = {}): Observable<AuditLogPage> {
    return this.http.get<AuditLogPage>('/audit-log', {
      params: toHttpParams(query, { ...filters }),
    });
  }
}
