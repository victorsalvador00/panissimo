import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type UserDto = Schemas['UserDto'];
export type UserListItem = Schemas['UserListItemDto'];
export type UsersPage = Schemas['PagedResultOfUserListItemDto'];
export type CreateUserRequest = Schemas['CreateUserRequest'];
export type UpdateUserRequest = Schemas['UpdateUserRequest'];

export interface UserFilters {
  isActive?: boolean | null;
  roleId?: string | null;
  locationId?: string | null;
}

/** Usuarios (`/users`, permiso `security.users.manage`). */
@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);

  list(query: Partial<ListQuery>, filters: UserFilters = {}): Observable<UsersPage> {
    return this.http.get<UsersPage>('/users', { params: toHttpParams(query, { ...filters }) });
  }

  get(id: string): Observable<UserDto> {
    return this.http.get<UserDto>(`/users/${id}`);
  }

  create(request: CreateUserRequest): Observable<UserDto> {
    return this.http.post<UserDto>('/users', request);
  }

  update(id: string, request: UpdateUserRequest): Observable<UserDto> {
    return this.http.put<UserDto>(`/users/${id}`, request);
  }

  /** También desbloquea la cuenta y cierra las sesiones del usuario. */
  resetPassword(id: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`/users/${id}/reset-password`, { newPassword });
  }

  activate(id: string, version: number): Observable<UserDto> {
    return this.http.post<UserDto>(`/users/${id}/activate`, { version });
  }

  deactivate(id: string, version: number): Observable<UserDto> {
    return this.http.post<UserDto>(`/users/${id}/deactivate`, { version });
  }
}
