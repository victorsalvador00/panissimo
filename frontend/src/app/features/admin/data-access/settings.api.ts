import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { Schemas } from '../../../core/api/api-types';

export type AppSetting = Schemas['AppSettingDto'];
export type SettingValue = Schemas['SettingValueRequest'];

/** Configuración del sistema (`/settings`, permiso `settings.manage`). */
@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private readonly http = inject(HttpClient);

  list(): Observable<AppSetting[]> {
    return this.http.get<AppSetting[]>('/settings');
  }

  update(settings: SettingValue[]): Observable<AppSetting[]> {
    return this.http.put<AppSetting[]>('/settings', { settings });
  }
}
