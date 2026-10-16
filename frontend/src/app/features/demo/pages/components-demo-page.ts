import { JsonPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ListQuery, defaultListQuery } from '../../../core/http/list-query';
import { Notifier } from '../../../core/http/notifier.service';
import {
  CardDef,
  CellDef,
  DataTable,
  TableColumn,
} from '../../../shared/components/data-table/data-table';
import { ConfirmService, ConflictHandler } from '../../../shared/components/dialogs.service';
import { ItemPicker } from '../../../shared/components/item-picker/item-picker';
import { LineColumnDef, LinesEditor } from '../../../shared/components/lines-editor/lines-editor';
import {
  minLinesValidator,
  uniqueLinesValidator,
} from '../../../shared/components/lines-editor/lines-validators';
import { LocationPicker } from '../../../shared/components/location-picker/location-picker';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ItemOption } from '../../../shared/data-access/item-lookup.service';
import { MxnPipe } from '../../../shared/pipes/mxn.pipe';
import { QtyPipe } from '../../../shared/pipes/qty.pipe';
import { EnumName } from '../../../shared/pipes/status-label.pipe';

interface DemoRow {
  id: number;
  folio: string;
  status: string;
  total: number;
  date: string;
}

type DemoLine = FormGroup<{
  item: FormControl<ItemOption | null>;
  quantity: FormControl<number | null>;
  unitCost: FormControl<number | null>;
}>;

const STATUSES = [
  'Draft',
  'PendingApproval',
  'Approved',
  'PartiallyReceived',
  'Received',
  'Rejected',
  'Cancelled',
  'Closed',
];

/** Datos de ejemplo: la tabla pagina, ordena y busca "en servidor" sobre este arreglo. */
const ALL_ROWS: DemoRow[] = Array.from({ length: 57 }, (_, i) => ({
  id: i + 1,
  folio: `OC-${String(i + 1).padStart(6, '0')}`,
  status: STATUSES[i % STATUSES.length],
  total: Math.round((1500 + i * 873.37) * 100) / 100,
  date: new Date(2026, 8, 1 + (i % 25)).toLocaleDateString('es-MX'),
}));

/**
 * Página interna de demostración de los componentes compartidos (criterio de aceptación de F-03).
 * Visible solo con `settings.manage`.
 */
@Component({
  selector: 'app-components-demo-page',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    PageHeader,
    StatusTag,
    DataTable,
    CellDef,
    CardDef,
    ItemPicker,
    LocationPicker,
    QtyInput,
    LinesEditor,
    LineColumnDef,
    QtyPipe,
    MxnPipe,
    JsonPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './components-demo-page.html',
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: var(--sgo-space-4);
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sgo-space-2);
    }
    h2 {
      margin: 0 0 var(--sgo-space-3);
      font: var(--mat-sys-title-large);
    }
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: var(--sgo-space-1) var(--sgo-space-4);
      margin: 0;
    }
    dd {
      margin: 0;
    }
    pre {
      margin: var(--sgo-space-2) 0 0;
      font-size: 12px;
      white-space: pre-wrap;
      color: var(--mat-sys-on-surface-variant);
    }
    .card-row {
      display: flex;
      justify-content: space-between;
      gap: var(--sgo-space-2);
    }
  `,
})
export class ComponentsDemoPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly confirmService = inject(ConfirmService);
  private readonly conflicts = inject(ConflictHandler);
  private readonly notifier = inject(Notifier);

  protected readonly statusSamples: { kind: EnumName; values: string[] }[] = [
    { kind: 'PurchaseOrderStatus', values: STATUSES },
    {
      kind: 'TransferStatus',
      values: ['Draft', 'Dispatched', 'Received', 'ReceivedWithDiscrepancies', 'Cancelled'],
    },
    { kind: 'ProductionOrderStatus', values: ['Released', 'Completed'] },
    { kind: 'PhysicalCountStatus', values: ['InProgress'] },
    { kind: 'RequisitionStatus', values: ['Submitted', 'Converted'] },
  ];

  // Tabla
  protected readonly columns: TableColumn<DemoRow>[] = [
    { key: 'folio', header: 'Folio', sortable: true },
    { key: 'date', header: 'Fecha' },
    { key: 'status', header: 'Estado', sortable: true },
    { key: 'total', header: 'Total', sortable: true, align: 'end' },
  ];
  protected readonly query = signal<ListQuery>(defaultListQuery('folio:desc'));
  protected readonly loading = signal(false);
  protected readonly emptyDemo = signal(false);
  private readonly filtered = computed(() => {
    const { q, sort } = this.query();
    let rows = this.emptyDemo()
      ? []
      : ALL_ROWS.filter((row) => !q || row.folio.toLowerCase().includes(q.toLowerCase()));
    if (sort) {
      const [key, direction] = sort.split(':') as [keyof DemoRow, string];
      rows = [...rows].sort(
        (a, b) =>
          (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (direction === 'desc' ? -1 : 1),
      );
    }
    return rows;
  });
  protected readonly pageRows = computed(() => {
    const { page, pageSize } = this.query();
    return this.filtered().slice((page - 1) * pageSize, page * pageSize);
  });
  protected readonly total = computed(() => this.filtered().length);

  // Formulario de ejemplo
  protected readonly form = this.fb.group({
    item: new FormControl<ItemOption | null>(null, Validators.required),
    locationId: new FormControl<string | null>(null, Validators.required),
    quantity: new FormControl<number | null>(null, Validators.required),
    adjustment: new FormControl<number | null>(null, Validators.required),
    date: new FormControl<Date | null>(null),
  });

  protected readonly lines = new FormArray<DemoLine>([this.createLine()], {
    validators: [minLinesValidator(1), uniqueLinesValidator('item')],
  });
  protected readonly newLine = () => this.createLine();
  protected readonly lineTotal = (values: ReturnType<DemoLine['getRawValue']>[]) =>
    values.reduce((sum, line) => sum + (line.quantity ?? 0) * (line.unitCost ?? 0), 0);

  protected onQuery(query: ListQuery): void {
    this.loading.set(true);
    // Simula la latencia del servidor para ver el estado de carga.
    setTimeout(() => {
      this.query.set(query);
      this.loading.set(false);
    }, 400);
  }

  protected toggleEmpty(): void {
    this.emptyDemo.update((empty) => !empty);
    this.query.update((q) => ({ ...q, page: 1 }));
  }

  protected validate(): void {
    this.form.markAllAsTouched();
    this.lines.markAllAsTouched();
    if (this.form.valid && this.lines.valid) {
      this.notifier.success('Todo válido.');
    }
  }

  protected openConfirm(): void {
    this.confirmService
      .confirm({
        title: '¿Despachar el traspaso TRA-000042?',
        message: 'Se descontará la existencia de Comisariato y el traspaso quedará en tránsito.',
        items: [
          { label: 'Origen', value: 'COM · Comisariato' },
          { label: 'Destino', value: 'SUC-03 · Sucursal 03' },
          { label: 'Chofer', value: 'Juan Pérez' },
        ],
        lines: {
          headers: ['Artículo', 'Lote', 'Cantidad'],
          rows: [
            ['HAR-001 · Harina de trigo', 'L-2409', '25 kg'],
            ['AZU-001 · Azúcar', '—', '10 kg'],
          ],
          alignEnd: [2],
        },
        confirmLabel: 'Despachar',
      })
      .subscribe((confirmed) =>
        confirmed
          ? this.notifier.success('Confirmado.')
          : this.notifier.error('Cancelado por el usuario.'),
      );
  }

  protected openShortages(): void {
    this.conflicts.handle(
      new HttpErrorResponse({
        status: 409,
        error: {
          status: 409,
          code: 'insufficient_stock',
          shortages: [
            {
              itemId: 'a',
              sku: 'HAR-001',
              name: 'Harina de trigo',
              lotId: 'l1',
              requested: 25,
              available: 12.5,
            },
            {
              itemId: 'b',
              sku: 'AZU-001',
              name: 'Azúcar',
              lotId: null,
              requested: 10,
              available: 0,
            },
          ],
        },
      }),
      { lotLabels: { l1: 'L-2409' }, units: { a: 'kg', b: 'kg' } },
    );
  }

  protected openConcurrency(): void {
    this.conflicts.handle(
      new HttpErrorResponse({ status: 409, error: { status: 409, code: 'concurrency' } }),
      { reload: () => this.notifier.success('Aquí la pantalla recargaría el documento.') },
    );
  }

  private createLine(): DemoLine {
    return new FormGroup({
      item: new FormControl<ItemOption | null>(null, Validators.required),
      quantity: new FormControl<number | null>(null, Validators.required),
      unitCost: new FormControl<number | null>(null),
    });
  }
}
