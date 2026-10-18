import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { AUDIT_ACTIONS, AUDIT_ENTITIES, AuditApi, formatChanges } from '../../data-access/audit';

const pageSize = 10;

/**
 * Change history of one record (`/audit-log?entityId=`, frontend §8), newest first, with its roles, locations or
 * permissions. Shows 10 and loads more on request. The page decides whether to show it (security.audit.view).
 */
@Component({
  selector: 'app-audit-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule],
  template: `
    <h2 class="title">Historial de cambios</h2>
    @if (history.isLoading() && entries().length === 0) {
      <p class="muted" role="status">Cargando…</p>
    } @else if (history.error()) {
      <p class="muted" role="status">No se pudo cargar el historial.</p>
    } @else if (entries().length === 0) {
      <p class="muted">Sin cambios registrados.</p>
    } @else {
      <ol class="entries">
        @for (entry of entries(); track entry.id) {
          <li>
            <p class="head">
              <strong>{{ actions[entry.action] ?? entry.action }}</strong>
              · {{ entities[entry.entityType] ?? entry.entityType }} ·
              <time [attr.datetime]="entry.occurredAt">{{
                entry.occurredAt | date: 'dd/MM/yyyy HH:mm'
              }}</time>
              · {{ entry.userName ?? 'Sistema' }}
            </p>
            @if (rows(entry); as rows) {
              @if (rows.length > 0) {
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Campo</th>
                      <th scope="col">Antes</th>
                      <th scope="col">Después</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of rows; track $index) {
                      <tr>
                        <td>{{ row.field }}</td>
                        <td>{{ row.before }}</td>
                        <td>{{ row.after }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            }
          </li>
        }
      </ol>
      @if (hasMore()) {
        <button matButton type="button" [disabled]="history.isLoading()" (click)="more()">
          Ver más
        </button>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .title {
      margin: 0 0 12px;
      font: var(--mat-sys-title-medium);
      font-weight: 700;
    }

    .muted {
      color: var(--mat-sys-on-surface-variant);
    }

    .entries {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      padding: 8px 0;
      border-bottom: 1px solid var(--pan-row-divider);
    }

    .head {
      margin: 0 0 6px;
      font: var(--mat-sys-body-medium);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font: var(--mat-sys-body-small);
    }

    th,
    td {
      padding: 4px 8px;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
    }

    th {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AuditPanel {
  readonly entityId = input.required<string>();

  private readonly api = inject(AuditApi);
  private readonly shown = signal(pageSize);

  protected readonly actions = AUDIT_ACTIONS;
  protected readonly entities = AUDIT_ENTITIES;
  protected readonly history = rxResource({
    params: () => ({ entityId: this.entityId(), pageSize: this.shown() }),
    stream: ({ params }) =>
      this.api.list({ page: 1, pageSize: params.pageSize }, { entityId: params.entityId }),
  });
  protected readonly entries = computed(() =>
    this.history.hasValue() ? this.history.value().items : [],
  );
  protected readonly hasMore = computed(
    () => this.history.hasValue() && this.history.value().total > this.entries().length,
  );

  protected rows(entry: { action: string; changes: unknown }) {
    return formatChanges(entry.action, entry.changes);
  }

  protected more(): void {
    this.shown.update((n) => Math.min(n + pageSize, 100));
  }
}
