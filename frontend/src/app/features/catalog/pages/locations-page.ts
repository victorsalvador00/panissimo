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
import {
  CardDef,
  CellDef,
  DataTable,
  TableColumn,
} from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { enumLabel } from '../../../shared/pipes/status-label.pipe';
import { LocationDto, LocationsApi } from '../data-access/locations.api';
import { LocationDialog } from '../ui/location-dialog';

@Component({
  selector: 'app-locations-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    PageHeader,
    DataTable,
    CellDef,
    CardDef,
    StatusTag,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page">
      <app-page-header title="Ubicaciones" subtitle="Sucursales, fábrica y comisariato.">
        @if (canManage) {
          <button mat-flat-button type="button" (click)="edit(null)">
            <mat-icon>add</mat-icon>
            Nueva ubicación
          </button>
        }
      </app-page-header>

      <mat-slide-toggle
        class="toggle"
        [checked]="includeInactive()"
        (change)="setInactive($event.checked)"
      >
        Mostrar inactivas
      </mat-slide-toggle>

      <app-data-table
        [columns]="columns"
        [rows]="locations.value()?.items ?? []"
        [total]="locations.value()?.total ?? 0"
        [loading]="locations.isLoading()"
        [query]="query()"
        [searchable]="true"
        searchPlaceholder="Buscar por código o nombre"
        emptyMessage="No hay ubicaciones con ese criterio."
        [emptyActionLabel]="canManage ? 'Nueva ubicación' : undefined"
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
        <ng-template appCardDef let-row>
          <strong>{{ row.code }} · {{ row.name }}</strong>
          <div class="muted">{{ typeLabel(row) }} · {{ row.isActive ? 'Activa' : 'Inactiva' }}</div>
        </ng-template>
      </app-data-table>
    </section>
  `,
  styles: `
    .toggle {
      display: block;
      margin-bottom: var(--sgo-space-3);
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class LocationsPage {
  private readonly api = inject(LocationsApi);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  private readonly auth = inject(AuthService);

  protected readonly canManage = this.auth.can('locations.manage');

  protected readonly columns: TableColumn<LocationDto>[] = [
    { key: 'code', header: 'Código', sortable: true },
    { key: 'name', header: 'Nombre', sortable: true },
    { key: 'type', header: 'Tipo', sortable: true, value: (row) => this.typeLabel(row) },
    { key: 'address', header: 'Dirección' },
    { key: 'isActive', header: 'Estado' },
  ];

  protected readonly query = signal<ListQuery>(defaultListQuery('code:asc'));
  protected readonly includeInactive = signal(false);

  protected readonly locations = rxResource({
    params: () => ({ query: this.query(), includeInactive: this.includeInactive() }),
    stream: ({ params }) =>
      this.api.list(params.query, { includeInactive: params.includeInactive || undefined }),
  });

  protected typeLabel(location: LocationDto): string {
    return enumLabel('LocationType', location.type);
  }

  protected setInactive(value: boolean): void {
    this.includeInactive.set(value);
    this.query.update((query) => ({ ...query, page: 1 }));
  }

  protected edit(location: LocationDto | null): void {
    this.dialog
      .open<LocationDialog, LocationDto | null, LocationDto>(LocationDialog, {
        data: location,
        width: '520px',
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed()
      .pipe(filter((saved): saved is LocationDto => !!saved))
      .subscribe((saved) => {
        this.notifier.success(location ? 'Ubicación guardada.' : `Ubicación ${saved.code} creada.`);
        this.locations.reload();
        // Las ubicaciones permitidas (selector de la barra) vienen de /me.
        this.auth.reloadUser();
      });
  }
}
