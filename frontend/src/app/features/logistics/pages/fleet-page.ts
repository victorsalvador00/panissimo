import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { RecordDialogService } from '../../../shared/components/record-dialog/record-dialog';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ListQuery } from '../../../shared/data-access/list-query';
import { Driver, FleetApi, Vehicle } from '../data-access/logistics-api';

/**
 * /logistica/flotilla (RN-113): vehicles and drivers the dispatches of transfers and shipments choose from. List and
 * dialog per catalog; managing them needs logistics.fleet.manage.
 */
@Component({
  selector: 'app-fleet-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatTabsModule,
    PageHeader,
    DataTable,
    CellDef,
    StatusTag,
  ],
  template: `
    <app-page-header title="Vehículos y choferes">
      @if (canManage) {
        <button
          matButton="filled"
          type="button"
          (click)="tab() === 0 ? createVehicle() : createDriver()"
        >
          <mat-icon>add</mat-icon>
          {{ tab() === 0 ? 'Nuevo vehículo' : 'Nuevo chofer' }}
        </button>
      }
    </app-page-header>

    <div class="filters">
      <mat-slide-toggle
        [checked]="includeInactive()"
        (change)="includeInactive.set($event.checked)"
      >
        Mostrar inactivos
      </mat-slide-toggle>
    </div>

    <mat-tab-group
      mat-stretch-tabs="false"
      animationDuration="0ms"
      [selectedIndex]="tab()"
      (selectedIndexChange)="tab.set($event)"
    >
      <mat-tab label="Vehículos">
        <app-data-table
          label="Vehículos"
          [rows]="vehicleRows()"
          [total]="vehicleTotal()"
          [query]="vehicleQuery()"
          [loading]="vehicles.isLoading()"
          emptyMessage="No hay vehículos. Da de alta el primero para poder despachar."
          (queryChange)="vehicleQuery.set($event)"
        >
          <ng-template appCell="plate" header="Placas" sortable [appCellOf]="vehicleRows()" let-v>
            <strong>{{ v.plate }}</strong>
          </ng-template>
          <ng-template
            appCell="description"
            header="Descripción"
            sortable
            [appCellOf]="vehicleRows()"
            let-v
          >
            {{ v.description }}
          </ng-template>
          <ng-template appCell="status" header="Estado" [appCellOf]="vehicleRows()" let-v>
            <app-status-tag
              [text]="v.isActive ? 'Activo' : 'Inactivo'"
              [color]="v.isActive ? 'green' : 'grey'"
            />
          </ng-template>
          @if (canManage) {
            <ng-template appCell="actions" header="" end [appCellOf]="vehicleRows()" let-v>
              <button
                matIconButton
                type="button"
                [attr.aria-label]="'Editar ' + v.plate"
                (click)="editVehicle(v)"
              >
                <mat-icon>edit</mat-icon>
              </button>
            </ng-template>
          }
        </app-data-table>
      </mat-tab>

      <mat-tab label="Choferes">
        <app-data-table
          label="Choferes"
          [rows]="driverRows()"
          [total]="driverTotal()"
          [query]="driverQuery()"
          [loading]="drivers.isLoading()"
          emptyMessage="No hay choferes. Da de alta el primero para poder despachar."
          (queryChange)="driverQuery.set($event)"
        >
          <ng-template appCell="name" header="Nombre" sortable [appCellOf]="driverRows()" let-d>
            <strong>{{ d.name }}</strong>
          </ng-template>
          <ng-template appCell="phone" header="Teléfono" [appCellOf]="driverRows()" let-d>
            {{ d.phone ?? '—' }}
          </ng-template>
          <ng-template appCell="status" header="Estado" [appCellOf]="driverRows()" let-d>
            <app-status-tag
              [text]="d.isActive ? 'Activo' : 'Inactivo'"
              [color]="d.isActive ? 'green' : 'grey'"
            />
          </ng-template>
          @if (canManage) {
            <ng-template appCell="actions" header="" end [appCellOf]="driverRows()" let-d>
              <button
                matIconButton
                type="button"
                [attr.aria-label]="'Editar ' + d.name"
                (click)="editDriver(d)"
              >
                <mat-icon>edit</mat-icon>
              </button>
            </ng-template>
          }
        </app-data-table>
      </mat-tab>
    </mat-tab-group>
  `,
  styleUrl: '../../catalog/pages/catalog-list.scss',
})
export class FleetPage {
  private readonly api = inject(FleetApi);
  private readonly dialogs = inject(RecordDialogService);
  private readonly notifier = inject(Notifier);
  protected readonly canManage = inject(AuthService).can('logistics.fleet.manage');

  protected readonly tab = signal(0);
  protected readonly includeInactive = signal(false);
  protected readonly vehicleQuery = signal<ListQuery>({
    page: 1,
    pageSize: 25,
    sort: 'description',
  });
  protected readonly driverQuery = signal<ListQuery>({ page: 1, pageSize: 25, sort: 'name' });

  protected readonly vehicles = rxResource({
    params: () => ({ query: this.vehicleQuery(), includeInactive: this.includeInactive() }),
    stream: ({ params }) =>
      this.api.vehicles(params.query, { includeInactive: params.includeInactive }),
  });
  protected readonly drivers = rxResource({
    params: () => ({ query: this.driverQuery(), includeInactive: this.includeInactive() }),
    stream: ({ params }) =>
      this.api.drivers(params.query, { includeInactive: params.includeInactive }),
  });
  protected readonly vehicleRows = computed(() =>
    this.vehicles.hasValue() ? this.vehicles.value().items : [],
  );
  protected readonly vehicleTotal = computed(() =>
    this.vehicles.hasValue() ? this.vehicles.value().total : 0,
  );
  protected readonly driverRows = computed(() =>
    this.drivers.hasValue() ? this.drivers.value().items : [],
  );
  protected readonly driverTotal = computed(() =>
    this.drivers.hasValue() ? this.drivers.value().total : 0,
  );

  protected async createVehicle(): Promise<void> {
    const saved = await this.dialogs.open({
      title: 'Nuevo vehículo',
      fields: [
        {
          key: 'plate',
          label: 'Placas',
          type: 'text',
          required: true,
          maxLength: 20,
          uppercase: true,
          hint: 'Únicas; se guardan en mayúsculas y sin espacios.',
        },
        { key: 'description', label: 'Descripción', type: 'text', required: true, maxLength: 120 },
      ],
      value: {},
      save: (value) =>
        this.api.createVehicle({
          plate: value['plate'] as string,
          description: value['description'] as string,
        }),
    });
    if (saved) this.saved('Vehículo dado de alta.');
  }

  protected async editVehicle(vehicle: Vehicle): Promise<void> {
    const saved = await this.dialogs.open({
      title: `Editar ${vehicle.plate}`,
      fields: [
        { key: 'plate', label: 'Placas', type: 'text', readonly: true },
        { key: 'description', label: 'Descripción', type: 'text', required: true, maxLength: 120 },
        { key: 'isActive', label: 'Activo', type: 'toggle' },
      ],
      value: { ...vehicle },
      save: (value) =>
        this.api.updateVehicle(vehicle.id, {
          version: vehicle.version,
          description: value['description'] as string,
          isActive: value['isActive'] as boolean,
        }),
    });
    if (saved) this.saved('Cambios guardados.');
  }

  protected async createDriver(): Promise<void> {
    const saved = await this.dialogs.open({
      title: 'Nuevo chofer',
      fields: [
        { key: 'name', label: 'Nombre', type: 'text', required: true, maxLength: 120 },
        { key: 'phone', label: 'Teléfono', type: 'text', maxLength: 20 },
      ],
      value: {},
      save: (value) =>
        this.api.createDriver({
          name: value['name'] as string,
          phone: ((value['phone'] as string | null) ?? '').trim() || null,
        }),
    });
    if (saved) this.saved('Chofer dado de alta.');
  }

  protected async editDriver(driver: Driver): Promise<void> {
    const saved = await this.dialogs.open({
      title: `Editar ${driver.name}`,
      fields: [
        { key: 'name', label: 'Nombre', type: 'text', required: true, maxLength: 120 },
        { key: 'phone', label: 'Teléfono', type: 'text', maxLength: 20 },
        { key: 'isActive', label: 'Activo', type: 'toggle' },
      ],
      value: { ...driver },
      save: (value) =>
        this.api.updateDriver(driver.id, {
          version: driver.version,
          name: value['name'] as string,
          phone: ((value['phone'] as string | null) ?? '').trim() || null,
          isActive: value['isActive'] as boolean,
        }),
    });
    if (saved) this.saved('Cambios guardados.');
  }

  private saved(message: string): void {
    this.notifier.info(message);
    this.vehicles.reload();
    this.drivers.reload();
  }
}
