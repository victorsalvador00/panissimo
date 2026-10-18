import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { debounceTime, map } from 'rxjs';
import type { ApiEnum } from '../../../core/api/api';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import {
  RecordDialogService,
  RecordField,
} from '../../../shared/components/record-dialog/record-dialog';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ListQuery } from '../../../shared/data-access/list-query';
import { StatusLabelPipe } from '../../../shared/pipes/pipes';
import { Location, LocationsApi } from '../data-access/catalog-api';

type LocationType = ApiEnum<'LocationType'>;

/** /catalogos/ubicaciones (frontend §7.2): plants, branches and sub-warehouses; name and address editable. */
@Component({
  selector: 'app-locations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    PageHeader,
    DataTable,
    CellDef,
    StatusTag,
    StatusLabelPipe,
  ],
  template: `
    <app-page-header title="Ubicaciones">
      @if (canManage) {
        <button matButton="filled" type="button" (click)="create()">
          <mat-icon>add_location_alt</mat-icon>
          Nueva ubicación
        </button>
      }
    </app-page-header>

    <div class="filters">
      <mat-form-field class="search">
        <mat-label>Buscar por código o nombre</mat-label>
        <input matInput type="search" [formControl]="search" />
        <mat-icon matSuffix aria-hidden="true">search</mat-icon>
      </mat-form-field>
      <mat-form-field>
        <mat-label>Tipo</mat-label>
        <mat-select [value]="type()" (valueChange)="setType($event)">
          <mat-option [value]="null">Todos</mat-option>
          @for (option of typeOptions; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-slide-toggle [checked]="includeInactive()" (change)="setInactive($event.checked)">
        Mostrar inactivas
      </mat-slide-toggle>
    </div>

    <app-data-table
      label="Ubicaciones"
      [rows]="rows()"
      [total]="total()"
      [query]="query()"
      [loading]="locations.isLoading()"
      emptyMessage="No hay ubicaciones con estos filtros."
      (queryChange)="query.set($event)"
    >
      <ng-template appCell="code" header="Código" sortable [appCellOf]="rows()" let-location>
        <strong>{{ location.code }}</strong>
      </ng-template>
      <ng-template appCell="name" header="Nombre" sortable [appCellOf]="rows()" let-location>
        {{ location.name }}
        @if (location.parentLocationId) {
          <span class="muted">· de {{ parentName(location.parentLocationId) }}</span>
        }
      </ng-template>
      <ng-template appCell="type" header="Tipo" [appCellOf]="rows()" let-location>
        {{ location.type | statusLabel: 'LocationType' }}
      </ng-template>
      <ng-template appCell="address" header="Dirección" [appCellOf]="rows()" let-location>
        {{ location.address ?? '—' }}
      </ng-template>
      <ng-template appCell="status" header="Estado" [appCellOf]="rows()" let-location>
        <app-status-tag
          [text]="location.isActive ? 'Activa' : 'Inactiva'"
          [color]="location.isActive ? 'green' : 'grey'"
        />
      </ng-template>
      @if (canManage) {
        <ng-template appCell="actions" header="" end [appCellOf]="rows()" let-location>
          <button
            matIconButton
            type="button"
            [attr.aria-label]="'Editar ' + location.name"
            (click)="edit(location)"
          >
            <mat-icon>edit</mat-icon>
          </button>
        </ng-template>
      }
    </app-data-table>
  `,
  styleUrl: './catalog-list.scss',
})
export class LocationsPage {
  private readonly api = inject(LocationsApi);
  private readonly dialogs = inject(RecordDialogService);
  private readonly notifier = inject(Notifier);
  protected readonly canManage = inject(AuthService).can('locations.manage');

  protected readonly typeOptions: { value: LocationType; label: string }[] = [
    { value: 'Plant', label: 'Planta' },
    { value: 'Branch', label: 'Sucursal' },
    { value: 'Warehouse', label: 'Subalmacén' },
  ];
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly type = signal<LocationType | null>(null);
  protected readonly includeInactive = signal(false);
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 25, sort: 'code' });

  protected readonly locations = rxResource({
    params: () => ({
      query: this.query(),
      type: this.type(),
      includeInactive: this.includeInactive(),
    }),
    stream: ({ params }) =>
      this.api.list(params.query, { type: params.type, includeInactive: params.includeInactive }),
  });
  protected readonly rows = computed(() =>
    this.locations.hasValue() ? this.locations.value().items : [],
  );
  protected readonly total = computed(() =>
    this.locations.hasValue() ? this.locations.value().total : 0,
  );
  /** Plants and branches, as parents of the sub-warehouses. */
  private readonly parents = rxResource({
    stream: () =>
      this.api
        .list({ page: 1, pageSize: 100, sort: 'code' }, { includeInactive: true })
        .pipe(map((page) => page.items.filter((l) => l.type !== 'Warehouse'))),
    defaultValue: [] as Location[],
  });

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe((q) => this.query.update((x) => ({ ...x, page: 1, q: q.trim() || undefined })));
  }

  protected parentName(id: string): string {
    return this.parents.value().find((l) => l.id === id)?.name ?? '';
  }

  protected setType(type: LocationType | null): void {
    this.type.set(type);
    this.query.update((x) => ({ ...x, page: 1 }));
  }

  protected setInactive(include: boolean): void {
    this.includeInactive.set(include);
    this.query.update((x) => ({ ...x, page: 1 }));
  }

  protected async create(): Promise<void> {
    const parents = this.parents.value().filter((l) => l.isActive);
    const fields: RecordField[] = [
      {
        key: 'code',
        label: 'Código',
        type: 'text',
        required: true,
        maxLength: 20,
        uppercase: true,
      },
      { key: 'name', label: 'Nombre', type: 'text', required: true, maxLength: 100 },
      { key: 'type', label: 'Tipo', type: 'select', required: true, options: this.typeOptions },
      {
        key: 'parentLocationId',
        label: 'Pertenece a',
        type: 'select',
        required: true,
        options: parents.map((l) => ({ value: l.id, label: `${l.code} · ${l.name}` })),
        hint: 'La planta o sucursal donde está el subalmacén.',
        visibleWhen: (value) => value['type'] === 'Warehouse',
      },
      { key: 'address', label: 'Dirección', type: 'textarea', maxLength: 300 },
    ];
    const saved = await this.dialogs.open({
      title: 'Nueva ubicación',
      fields,
      value: { type: 'Branch' },
      save: (value) =>
        this.api.create({
          code: value['code'] as string,
          name: value['name'] as string,
          type: value['type'] as LocationType,
          address: (value['address'] as string | null) ?? null,
          parentLocationId: (value['parentLocationId'] as string | null) ?? null,
        }),
    });
    if (saved) this.saved('Ubicación creada.');
  }

  protected async edit(location: Location): Promise<void> {
    const saved = await this.dialogs.open({
      title: `Editar ${location.code}`,
      fields: [
        { key: 'code', label: 'Código', type: 'text', readonly: true },
        { key: 'name', label: 'Nombre', type: 'text', required: true, maxLength: 100 },
        { key: 'address', label: 'Dirección', type: 'textarea', maxLength: 300 },
        { key: 'isActive', label: 'Activa', type: 'toggle' },
      ],
      value: { ...location },
      save: (value) =>
        this.api.update(location.id, {
          version: location.version,
          name: value['name'] as string,
          address: (value['address'] as string | null) ?? null,
          isActive: value['isActive'] as boolean,
        }),
    });
    if (saved) this.saved('Cambios guardados.');
  }

  private saved(message: string): void {
    this.notifier.info(message);
    this.locations.reload();
    this.parents.reload();
  }
}
