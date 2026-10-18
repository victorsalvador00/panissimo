import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import type { ApiEnum } from '../../../core/api/api';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { RecordDialogService } from '../../../shared/components/record-dialog/record-dialog';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ListQuery } from '../../../shared/data-access/list-query';
import { StatusLabelPipe } from '../../../shared/pipes/pipes';
import { Unit, UnitsApi } from '../data-access/catalog-api';

const kindOptions = [
  { value: 'Mass', label: 'Masa' },
  { value: 'Volume', label: 'Volumen' },
  { value: 'Unit', label: 'Pieza' },
];

/** /catalogos/unidades (frontend §7.2): list with dialog. The code (kg, pza) does not change once created. */
@Component({
  selector: 'app-units-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    PageHeader,
    DataTable,
    CellDef,
    StatusTag,
    StatusLabelPipe,
  ],
  template: `
    <app-page-header title="Unidades de medida">
      @if (canManage) {
        <button matButton="filled" type="button" (click)="create()">
          <mat-icon>add</mat-icon>
          Nueva unidad
        </button>
      }
    </app-page-header>

    <div class="filters">
      <mat-slide-toggle
        [checked]="includeInactive()"
        (change)="includeInactive.set($event.checked)"
      >
        Mostrar inactivas
      </mat-slide-toggle>
    </div>

    <app-data-table
      label="Unidades de medida"
      [rows]="rows()"
      [total]="total()"
      [query]="query()"
      [loading]="units.isLoading()"
      emptyMessage="No hay unidades."
      (queryChange)="query.set($event)"
    >
      <ng-template appCell="code" header="Código" sortable [appCellOf]="rows()" let-unit>
        <strong>{{ unit.code }}</strong>
      </ng-template>
      <ng-template appCell="name" header="Nombre" sortable [appCellOf]="rows()" let-unit>
        {{ unit.name }}
      </ng-template>
      <ng-template appCell="kind" header="Tipo" [appCellOf]="rows()" let-unit>
        {{ unit.kind | statusLabel: 'UomKind' }}
      </ng-template>
      <ng-template appCell="status" header="Estado" [appCellOf]="rows()" let-unit>
        <app-status-tag
          [text]="unit.isActive ? 'Activa' : 'Inactiva'"
          [color]="unit.isActive ? 'green' : 'grey'"
        />
      </ng-template>
      @if (canManage) {
        <ng-template appCell="actions" header="" end [appCellOf]="rows()" let-unit>
          <button
            matIconButton
            type="button"
            [attr.aria-label]="'Editar ' + unit.name"
            (click)="edit(unit)"
          >
            <mat-icon>edit</mat-icon>
          </button>
        </ng-template>
      }
    </app-data-table>
  `,
  styleUrl: './catalog-list.scss',
})
export class UnitsPage {
  private readonly api = inject(UnitsApi);
  private readonly dialogs = inject(RecordDialogService);
  private readonly notifier = inject(Notifier);
  protected readonly canManage = inject(AuthService).can('catalog.manage');

  protected readonly includeInactive = signal(false);
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 25, sort: 'code' });
  protected readonly units = rxResource({
    params: () => ({ query: this.query(), includeInactive: this.includeInactive() }),
    stream: ({ params }) =>
      this.api.list(params.query, { includeInactive: params.includeInactive }),
  });
  protected readonly rows = computed(() => (this.units.hasValue() ? this.units.value().items : []));
  protected readonly total = computed(() => (this.units.hasValue() ? this.units.value().total : 0));

  protected async create(): Promise<void> {
    const saved = await this.dialogs.open({
      title: 'Nueva unidad de medida',
      fields: [
        {
          key: 'code',
          label: 'Código',
          type: 'text',
          required: true,
          maxLength: 10,
          hint: 'Abreviatura que se muestra junto a las cantidades (kg, l, pza).',
        },
        { key: 'name', label: 'Nombre', type: 'text', required: true, maxLength: 50 },
        { key: 'kind', label: 'Tipo', type: 'select', required: true, options: kindOptions },
      ],
      value: { kind: 'Mass' },
      save: (value) =>
        this.api.create({
          code: value['code'] as string,
          name: value['name'] as string,
          kind: value['kind'] as ApiEnum<'UomKind'>,
        }),
    });
    if (saved) this.saved('Unidad creada.');
  }

  protected async edit(unit: Unit): Promise<void> {
    const saved = await this.dialogs.open({
      title: `Editar ${unit.code}`,
      fields: [
        { key: 'code', label: 'Código', type: 'text', readonly: true },
        { key: 'name', label: 'Nombre', type: 'text', required: true, maxLength: 50 },
        { key: 'kind', label: 'Tipo', type: 'select', required: true, options: kindOptions },
        { key: 'isActive', label: 'Activa', type: 'toggle' },
      ],
      value: { ...unit },
      save: (value) =>
        this.api.update(unit.id, {
          version: unit.version,
          name: value['name'] as string,
          kind: value['kind'] as ApiEnum<'UomKind'>,
          isActive: value['isActive'] as boolean,
        }),
    });
    if (saved) this.saved('Cambios guardados.');
  }

  private saved(message: string): void {
    this.notifier.info(message);
    this.units.reload();
  }
}
