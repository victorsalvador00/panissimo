import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { AuditLogEntry } from '../../data-access/audit-log.service';
import { AuditActionPipe, AuditEntityPipe } from '../../pipes/audit-labels';

export interface ChangeRow {
  field: string;
  value: string;
}

/** Aplana el JSON de cambios (`{ Campo: valor }` o `{ Campo: { old, new } }`) en filas legibles. */
export function changeRows(changes: unknown): ChangeRow[] {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    return [];
  }
  return Object.entries(changes as Record<string, unknown>).map(([field, value]) => ({
    field,
    value: formatValue(value),
  }));
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).map((k) => k.toLowerCase());
    if (keys.length === 2 && keys.includes('old') && keys.includes('new')) {
      const old = record['old'] ?? record['Old'];
      const next = record['new'] ?? record['New'];
      return `${formatValue(old)} → ${formatValue(next)}`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

/** Detalle de un registro de la bitácora con los cambios formateados (spec frontend §7.7). */
@Component({
  selector: 'app-audit-changes-dialog',
  imports: [MatDialogModule, MatButtonModule, DatePipe, AuditEntityPipe, AuditActionPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>
      {{ entry.entityType | auditEntity }} · {{ entry.action | auditAction }}
    </h2>
    <mat-dialog-content>
      <dl>
        <div>
          <dt>Fecha</dt>
          <dd>{{ entry.occurredAt | date: 'dd/MM/yyyy HH:mm:ss' }}</dd>
        </div>
        <div>
          <dt>Usuario</dt>
          <dd>{{ entry.userName ?? 'Sistema' }}</dd>
        </div>
        <div>
          <dt>Registro</dt>
          <dd class="mono">{{ entry.entityId }}</dd>
        </div>
        @if (entry.ipAddress) {
          <div>
            <dt>IP</dt>
            <dd>{{ entry.ipAddress }}</dd>
          </div>
        }
      </dl>
      @if (rows.length) {
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Campo</th>
                <th scope="col">Valor</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows; track row.field) {
                <tr>
                  <td>{{ row.field }}</td>
                  <td class="mono">{{ row.value }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p>Sin detalle de cambios.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button type="button" mat-dialog-close cdkFocusInitial>Cerrar</button>
    </mat-dialog-actions>
  `,
  styleUrl: '../confirm-summary/dialogs.scss',
  styles: `
    .mono {
      font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
      font-size: 13px;
      word-break: break-all;
    }
  `,
})
export class AuditChangesDialog {
  protected readonly entry = inject<AuditLogEntry>(MAT_DIALOG_DATA);
  protected readonly rows = changeRows(this.entry.changes);
}
