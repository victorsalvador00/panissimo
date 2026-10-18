import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { Schemas } from '../../../core/api/api';
import { ListQuery, Page, ParamValues, toHttpParams } from '../../../shared/data-access/list-query';

export type UserListItem = Schemas['UserListItemDto'];
export type User = Schemas['UserDto'];
export type RoleListItem = Schemas['RoleListItemDto'];
export type Role = Schemas['RoleDto'];
export type PermissionGroup = Schemas['PermissionGroupDto'];
export type Setting = Schemas['AppSettingDto'];
export type LocationOption = Schemas['LocationLookupDto'];

export interface UserFilters extends ParamValues {
  isActive?: boolean | null;
  roleId?: string | null;
}

/** Users (`/users`), [security.users.manage]. */
@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);

  list(query: ListQuery, filters: UserFilters = {}): Observable<Page<UserListItem>> {
    return this.http.get<Page<UserListItem>>('users', { params: toHttpParams(query, filters) });
  }

  get(id: string): Observable<User> {
    return this.http.get<User>(`users/${id}`);
  }

  create(request: Schemas['CreateUserRequest']): Observable<User> {
    return this.http.post<User>('users', request);
  }

  update(id: string, request: Schemas['UpdateUserRequest']): Observable<User> {
    return this.http.put<User>(`users/${id}`, request);
  }

  /** Temporary password: unlocks the account and closes its sessions. */
  resetPassword(id: string, newPassword: string): Observable<void> {
    const body: Schemas['ResetPasswordRequest'] = { newPassword };
    return this.http.post<void>(`users/${id}/reset-password`, body);
  }

  activate(id: string, version: number): Observable<User> {
    return this.http.post<User>(`users/${id}/activate`, { version });
  }

  /** Also closes its sessions. */
  deactivate(id: string, version: number): Observable<User> {
    return this.http.post<User>(`users/${id}/deactivate`, { version });
  }
}

/** Roles and the permission catalog (`/roles`, `/permissions`). */
@Injectable({ providedIn: 'root' })
export class RolesApi {
  private readonly http = inject(HttpClient);

  /** Also allowed with security.users.manage, to assign roles. */
  list(query: ListQuery = { page: 1, pageSize: 100 }): Observable<Page<RoleListItem>> {
    return this.http.get<Page<RoleListItem>>('roles', { params: toHttpParams(query) });
  }

  get(id: string): Observable<Role> {
    return this.http.get<Role>(`roles/${id}`);
  }

  create(request: Schemas['CreateRoleRequest']): Observable<Role> {
    return this.http.post<Role>('roles', request);
  }

  update(id: string, request: Schemas['UpdateRoleRequest']): Observable<Role> {
    return this.http.put<Role>(`roles/${id}`, request);
  }

  permissions(): Observable<PermissionGroup[]> {
    return this.http.get<PermissionGroup[]>('permissions');
  }
}

/** System settings (`/settings`), [settings.manage]. */
@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private readonly http = inject(HttpClient);

  list(): Observable<Setting[]> {
    return this.http.get<Setting[]>('settings');
  }

  /** Each setting checks its version (409 if someone else changed it). */
  update(settings: Schemas['SettingValueRequest'][]): Observable<Setting[]> {
    const body: Schemas['UpdateSettingsRequest'] = { settings };
    return this.http.put<Setting[]>('settings', body);
  }
}

/** Active plants and branches to assign (`/locations/lookup`). */
@Injectable({ providedIn: 'root' })
export class LocationsLookupApi {
  private readonly http = inject(HttpClient);

  list(): Observable<LocationOption[]> {
    return this.http.get<LocationOption[]>('locations/lookup');
  }
}
