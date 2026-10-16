import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { filter } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { defaultListQuery, ListQuery } from '../../../core/http/list-query';
import { Notifier } from '../../../core/http/notifier.service';
import { CellDef, DataTable, TableColumn } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { enumLabel } from '../../../shared/pipes/status-label.pipe';
import { UnitDto, UnitsApi } from '../data-access/units.api';
import { UnitDialog } from '../ui/unit-dialog';

@Component({
  selector: 'app-units-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    PageHeader,
    DataTable,
    CellDef,
    StatusTag,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page">
      <app-page-header
        title="Unidades de medida"
        subtitle="Las existencias se guardan en la unidad base de cada artículo."
      >
        @if (canManage) {
          <button mat-flat-button type="button" (click)="edit(null)">
            <mat-icon>add</mat-icon>
            Nueva unidad
          </button>
        }
      </app-page-header>

      <mat-slide-toggle
        class="toggle"
        [checked]="includeInactive()"
        (change)="includeInactive.set($event.checked); query.set({ ...query(), page: 1 })"
      >
        Mostrar inactivas
      </mat-slide-toggle>

      <app-data-table
        [columns]="columns"
        [rows]="units.value()?.items ?? []"
        [total]="units.value()?.total ?? 0"
        [loading]="units.isLoading()"
        [query]="query()"
        [searchable]="true"
        searchPlaceholder="Buscar por código o nombre"
        emptyMessage="No hay unidades."
        [emptyActionLabel]="canManage ? 'Nueva unidad' : undefined"
        (emptyAction)="edit(null)"
        [rowClickable]="canManage"
        (rowClick)="edit($event)"
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="isActive" let-row>
          <app-status-tag
            [label]="row.isActive ? 'Activa' : 'Inactiva'"
            [color]="row.isActive ? 'green' : 'gray'"
          />
        </ng-template>
      </app-data-table>
    </section>
  `,
  styles: `
    .toggle {
      display: block;
      margin-bottom: var(--sgo-space-3);
    }
  `,
})
export class UnitsPage {
  private readonly api = inject(UnitsApi);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);

  protected readonly canManage = inject(AuthService).can('catalog.manage');

  protected readonly columns: TableColumn<UnitDto>[] = [
    { key: 'code', header: 'Código', sortable: true },
    { key: 'name', header: 'Nombre', sortable: true },
    { key: 'kind', header: 'Tipo', sortable: true, value: (row) => enumLabel('UomKind', row.kind) },
    { key: 'isActive', header: 'Estado' },
  ];

  protected readonly query = signal<ListQuery>(defaultListQuery('code:asc'));
  protected readonly includeInactive = signal(false);

  protected readonly units = rxResource({
    params: () => ({ query: this.query(), includeInactive: this.includeInactive() }),
    stream: ({ params }) => this.api.list(params.query, params.includeInactive),
  });

  protected edit(unit: UnitDto | null): void {
    this.dialog
      .open<UnitDialog, UnitDto | null, UnitDto>(UnitDialog, {
        data: unit,
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed()
      .pipe(filter((saved): saved is UnitDto => !!saved))
      .subscribe(() => {
        this.notifier.success(unit ? 'Unidad guardada.' : 'Unidad creada.');
        this.units.reload();
      });
  }
}
