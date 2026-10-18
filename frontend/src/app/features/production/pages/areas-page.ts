import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { RecordDialogService } from '../../../shared/components/record-dialog/record-dialog';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ListQuery } from '../../../shared/data-access/list-query';
import { Area, AreasApi } from '../../catalog/data-access/catalog-api';

/** /produccion/areas (frontend §7.2): list and dialog (code, name, order, active); editing needs its permission. */
@Component({
  selector: 'app-areas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    PageHeader,
    DataTable,
    CellDef,
    StatusTag,
  ],
  template: `
    <app-page-header title="Áreas de producción">
      @if (canManage) {
        <button matButton="filled" type="button" (click)="create()">
          <mat-icon>add</mat-icon>
          Nueva área
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
      label="Áreas de producción"
      [rows]="rows()"
      [total]="total()"
      [query]="query()"
      [loading]="areas.isLoading()"
      emptyMessage="No hay áreas."
      (queryChange)="query.set($event)"
    >
      <ng-template appCell="sortOrder" header="Orden" sortable end [appCellOf]="rows()" let-area>
        {{ area.sortOrder }}
      </ng-template>
      <ng-template appCell="code" header="Código" sortable [appCellOf]="rows()" let-area>
        <strong>{{ area.code }}</strong>
      </ng-template>
      <ng-template appCell="name" header="Nombre" sortable [appCellOf]="rows()" let-area>
        {{ area.name }}
      </ng-template>
      <ng-template appCell="status" header="Estado" [appCellOf]="rows()" let-area>
        <app-status-tag
          [text]="area.isActive ? 'Activa' : 'Inactiva'"
          [color]="area.isActive ? 'green' : 'grey'"
        />
      </ng-template>
      @if (canManage) {
        <ng-template appCell="actions" header="" end [appCellOf]="rows()" let-area>
          <button
            matIconButton
            type="button"
            [attr.aria-label]="'Editar ' + area.name"
            (click)="edit(area)"
          >
            <mat-icon>edit</mat-icon>
          </button>
        </ng-template>
      }
    </app-data-table>
  `,
  styleUrl: '../../catalog/pages/catalog-list.scss',
})
export class AreasPage {
  private readonly api = inject(AreasApi);
  private readonly dialogs = inject(RecordDialogService);
  private readonly notifier = inject(Notifier);
  protected readonly canManage = inject(AuthService).can('production.areas.manage');

  protected readonly includeInactive = signal(false);
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 25, sort: 'sortOrder' });
  protected readonly areas = rxResource({
    params: () => ({ query: this.query(), includeInactive: this.includeInactive() }),
    stream: ({ params }) =>
      this.api.list(params.query, { includeInactive: params.includeInactive }),
  });
  protected readonly rows = computed(() => (this.areas.hasValue() ? this.areas.value().items : []));
  protected readonly total = computed(() => (this.areas.hasValue() ? this.areas.value().total : 0));

  protected async create(): Promise<void> {
    const next = Math.max(0, ...this.rows().map((a) => a.sortOrder)) + 10;
    const saved = await this.dialogs.open({
      title: 'Nueva área de producción',
      fields: [
        {
          key: 'code',
          label: 'Código',
          type: 'text',
          required: true,
          maxLength: 20,
          uppercase: true,
        },
        { key: 'name', label: 'Nombre', type: 'text', required: true, maxLength: 100 },
        {
          key: 'sortOrder',
          label: 'Orden',
          type: 'number',
          required: true,
          min: 0,
          hint: 'Orden en el plan y en los reportes de producción.',
        },
      ],
      value: { sortOrder: next },
      save: (value) =>
        this.api.create({
          code: value['code'] as string,
          name: value['name'] as string,
          sortOrder: value['sortOrder'] as number,
        }),
    });
    if (saved) this.saved('Área creada.');
  }

  protected async edit(area: Area): Promise<void> {
    const saved = await this.dialogs.open({
      title: `Editar ${area.code}`,
      fields: [
        { key: 'code', label: 'Código', type: 'text', readonly: true },
        { key: 'name', label: 'Nombre', type: 'text', required: true, maxLength: 100 },
        { key: 'sortOrder', label: 'Orden', type: 'number', required: true, min: 0 },
        { key: 'isActive', label: 'Activa', type: 'toggle' },
      ],
      value: { ...area },
      save: (value) =>
        this.api.update(area.id, {
          version: area.version,
          name: value['name'] as string,
          sortOrder: value['sortOrder'] as number,
          isActive: value['isActive'] as boolean,
        }),
    });
    if (saved) this.saved('Cambios guardados.');
  }

  private saved(message: string): void {
    this.notifier.info(message);
    this.areas.reload();
  }
}
