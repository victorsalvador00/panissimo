import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/auth/auth.service';
import { AuditLogEntry, AuditLogService } from '../../data-access/audit-log.service';
import { AuditActionPipe, AuditEntityPipe } from '../../pipes/audit-labels';
import { AuditChangesDialog } from './audit-changes-dialog';

const PAGE_SIZE = 10;

/**
 * Historial de cambios de un registro (spec frontend §8). Usa `/audit-log?entityId=`; si el usuario no
 * tiene `security.audit.view` no se muestra nada. `refresh` se incrementa tras guardar para recargar.
 */
@Component({
  selector: 'app-audit-panel',
  imports: [DatePipe, MatButtonModule, MatIconModule, AuditEntityPipe, AuditActionPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (canView) {
      <section aria-labelledby="audit-title">
        <h2 id="audit-title">Historial de cambios</h2>
        @if (loading() && !entries().length) {
          <p class="muted">Cargando historial…</p>
        } @else if (!entries().length) {
          <p class="muted">Sin cambios registrados.</p>
        } @else {
          <ol>
            @for (entry of entries(); track entry.id) {
              <li>
                <button type="button" class="entry" (click)="open(entry)">
                  <span class="when">{{ entry.occurredAt | date: 'dd/MM/yyyy HH:mm' }}</span>
                  <span>
                    <strong>{{ entry.action | auditAction }}</strong>
                    {{ entry.entityType | auditEntity }}
                  </span>
                  <span class="muted">{{ entry.userName ?? 'Sistema' }}</span>
                  <mat-icon aria-hidden="true">chevron_right</mat-icon>
                </button>
              </li>
            }
          </ol>
          @if (entries().length < total()) {
            <button mat-button type="button" (click)="loadMore()" [disabled]="loading()">
              Ver más ({{ total() - entries().length }})
            </button>
          }
        }
      </section>
    }
  `,
  styles: `
    h2 {
      margin: 0 0 var(--sgo-space-3);
      font: var(--mat-sys-title-medium);
    }
    ol {
      margin: 0;
      padding: 0;
      list-style: none;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--sgo-radius);
    }
    li + li {
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .entry {
      display: grid;
      grid-template-columns: 9.5rem 1fr auto 24px;
      align-items: center;
      gap: var(--sgo-space-3);
      width: 100%;
      padding: var(--sgo-space-2) var(--sgo-space-3);
      border: 0;
      background: none;
      font: var(--mat-sys-body-medium);
      color: inherit;
      text-align: start;
      cursor: pointer;

      &:hover {
        background: var(--mat-sys-surface-container-low);
      }

      @media (max-width: 767.98px) {
        grid-template-columns: minmax(0, 1fr) 24px;
        gap: 0 var(--sgo-space-3);

        // Fecha, acción y usuario apilados; el ícono a la derecha de las tres líneas.
        > span {
          grid-column: 1;
        }
        mat-icon {
          grid-column: 2;
          grid-row: 1 / span 3;
        }
      }
    }
    .when {
      font-variant-numeric: tabular-nums;
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AuditPanel {
  private readonly audit = inject(AuditLogService);
  private readonly dialog = inject(MatDialog);

  readonly entityId = input.required<string>();
  /** Cambia el valor (ej. un contador) para recargar después de guardar. */
  readonly refresh = input<unknown>();

  protected readonly canView = inject(AuthService).can('security.audit.view');
  protected readonly entries = signal<AuditLogEntry[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  private page = 1;

  constructor() {
    effect(() => {
      const entityId = this.entityId();
      this.refresh();
      if (this.canView && entityId) {
        this.page = 1;
        this.entries.set([]);
        this.load(entityId);
      }
    });
  }

  protected loadMore(): void {
    this.page++;
    this.load(this.entityId());
  }

  protected open(entry: AuditLogEntry): void {
    this.dialog.open(AuditChangesDialog, {
      data: entry,
      width: '640px',
      maxWidth: 'calc(100vw - 32px)',
    });
  }

  private load(entityId: string): void {
    this.loading.set(true);
    this.audit.list({ page: this.page, pageSize: PAGE_SIZE }, { entityId }).subscribe({
      next: (result) => {
        this.entries.update((current) => [...current, ...result.items]);
        this.total.set(result.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
