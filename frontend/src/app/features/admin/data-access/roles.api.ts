import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type RoleDto = Schemas['RoleDto'];
export type RoleListItem = Schemas['RoleListItemDto'];
export type RolesPage = Schemas['PagedResultOfRoleListItemDto'];
export type PermissionGroup = Schemas['PermissionGroupDto'];
export type CreateRoleRequest = Schemas['CreateRoleRequest'];
export type UpdateRoleRequest = Schemas['UpdateRoleRequest'];

/** Roles y catálogo de permisos (permiso `security.roles.manage`). */
@Injectable({ providedIn: 'root' })
export class RolesApi {
  private readonly http = inject(HttpClient);

  list(query: Partial<ListQuery>): Observable<RolesPage> {
    return this.http.get<RolesPage>('/roles', { params: toHttpParams(query) });
  }

  get(id: string): Observable<RoleDto> {
    return this.http.get<RoleDto>(`/roles/${id}`);
  }

  create(request: CreateRoleRequest): Observable<RoleDto> {
    return this.http.post<RoleDto>('/roles', request);
  }

  update(id: string, request: UpdateRoleRequest): Observable<RoleDto> {
    return this.http.put<RoleDto>(`/roles/${id}`, request);
  }

  permissions(): Observable<PermissionGroup[]> {
    return this.http.get<PermissionGroup[]>('/permissions');
  }
}
