import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { StatusColor, StatusTag } from '../../../shared/components/status-tag/status-tag';

export function userStatus(user: { isActive: boolean; isLockedOut: boolean }): {
  label: string;
  color: StatusColor;
} {
  if (!user.isActive) {
    return { label: 'Inactivo', color: 'gray' };
  }
  if (user.isLockedOut) {
    return { label: 'Bloqueado', color: 'red' };
  }
  return { label: 'Activo', color: 'green' };
}

/** Activo / Inactivo / Bloqueado (RN-42: 5 intentos fallidos bloquean 15 minutos). */
@Component({
  selector: 'app-user-status-tag',
  imports: [StatusTag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-status-tag [label]="status().label" [color]="status().color" />`,
})
export class UserStatusTag {
  readonly user = input.required<{ isActive: boolean; isLockedOut: boolean }>();
  protected readonly status = computed(() => userStatus(this.user()));
}
