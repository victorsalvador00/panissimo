import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import type { PermissionGroup } from '../data-access/roles.api';

/** Estado de la casilla "todos" de un módulo. */
export function moduleState(
  group: PermissionGroup,
  selected: ReadonlySet<string>,
): 'all' | 'some' | 'none' {
  const count = group.permissions.filter((p) => selected.has(p.code)).length;
  return count === 0 ? 'none' : count === group.permissions.length ? 'all' : 'some';
}

/** Marca o desmarca todos los permisos de un módulo, conservando los demás. */
export function toggleModule(
  group: PermissionGroup,
  selected: readonly string[],
  checked: boolean,
): string[] {
  const codes = group.permissions.map((p) => p.code);
  const rest = selected.filter((code) => !codes.includes(code));
  return checked ? [...rest, ...codes] : rest;
}

/**
 * Matriz de permisos agrupada por módulo con casillas (spec frontend §7.7). Valor: códigos elegidos.
 * `<app-permission-matrix formControlName="permissions" [groups]="groups" />`
 */
@Component({
  selector: 'app-permission-matrix',
  imports: [MatCheckboxModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: PermissionMatrix, multi: true }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid">
      @for (group of groups(); track group.module) {
        <fieldset>
          <legend>
            <mat-checkbox
              [checked]="state(group) === 'all'"
              [indeterminate]="state(group) === 'some'"
              [disabled]="disabled()"
              (change)="setModule(group, $event.checked)"
            >
              <strong>{{ group.module }}</strong>
            </mat-checkbox>
          </legend>
          @for (permission of group.permissions; track permission.code) {
            <mat-checkbox
              [checked]="selectedSet().has(permission.code)"
              [disabled]="disabled()"
              (change)="setPermission(permission.code, $event.checked)"
            >
              {{ permission.description }}
              <code>{{ permission.code }}</code>
            </mat-checkbox>
          }
        </fieldset>
      }
    </div>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: var(--sgo-space-3);
    }
    fieldset {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: var(--sgo-space-2) var(--sgo-space-3) var(--sgo-space-3);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--sgo-radius);
    }
    legend {
      padding: 0 var(--sgo-space-1);
    }
    code {
      display: block;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class PermissionMatrix implements ControlValueAccessor {
  readonly groups = input.required<PermissionGroup[]>();

  protected readonly selected = signal<string[]>([]);
  protected readonly selectedSet = computed(() => new Set(this.selected()));
  protected readonly disabled = signal(false);

  private onChange: (value: string[]) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  protected state(group: PermissionGroup): 'all' | 'some' | 'none' {
    return moduleState(group, this.selectedSet());
  }

  protected setModule(group: PermissionGroup, checked: boolean): void {
    this.update(toggleModule(group, this.selected(), checked));
  }

  protected setPermission(code: string, checked: boolean): void {
    const rest = this.selected().filter((c) => c !== code);
    this.update(checked ? [...rest, code] : rest);
  }

  writeValue(value: string[] | null): void {
    this.selected.set(value ?? []);
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  private update(value: string[]): void {
    this.selected.set(value);
    this.onChange(value);
    this.onTouched();
  }
}
