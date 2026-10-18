import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { Observable, delay, of, startWith } from 'rxjs';
import { ConflictHandler } from '../../../core/http/conflict-handler';
import { Notifier } from '../../../core/http/notifier';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { CellDef, DataTable, RowDetail } from '../../../shared/components/data-table/data-table';
import { ItemOption, ItemPicker } from '../../../shared/components/item-picker/item-picker';
import {
  LineColumn,
  LinesEditor,
  minLinesValidator,
  uniqueLinesValidator,
} from '../../../shared/components/lines-editor/lines-editor';
import { LocationPicker } from '../../../shared/components/location-picker/location-picker';
import { LookupPicker } from '../../../shared/components/lookup-picker/lookup-picker';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { ReasonService } from '../../../shared/components/reason-dialog/reason-dialog';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ListQuery } from '../../../shared/data-access/list-query';
import { MxnPipe, QtyPipe, StatusLabelPipe } from '../../../shared/pipes/pipes';

interface DemoSupplier {
  id: string;
  name: string;
  taxId: string;
}

interface DemoTransfer {
  id: string;
  folio: string;
  destination: string;
  status: 'Draft' | 'Dispatched' | 'Received' | 'ReceivedWithDiscrepancies' | 'Cancelled';
  amount: number;
  createdAt: string;
}

const suppliers: DemoSupplier[] = [
  { id: 's1', name: 'Harinas del Bajío', taxId: 'HBA010101AB1' },
  { id: 's2', name: 'Lácteos San Juan', taxId: 'LSJ020202CD2' },
  { id: 's3', name: 'Empaques del Norte', taxId: 'ENO030303EF3' },
];

const statuses: DemoTransfer['status'][] = [
  'Draft',
  'Dispatched',
  'Received',
  'ReceivedWithDiscrepancies',
  'Cancelled',
];
const transfers: DemoTransfer[] = Array.from({ length: 57 }, (_, i) => ({
  id: `t${i + 1}`,
  folio: `TR-${String(i + 1).padStart(5, '0')}`,
  destination: ['Sucursal Centro', 'Sucursal Norte', 'Sucursal Sur'][i % 3],
  status: statuses[i % statuses.length],
  amount: 1250.5 * ((i % 7) + 1),
  createdAt: new Date(2026, 9, 1 + (i % 28), 8 + (i % 10), 15).toISOString(),
}));

type DemoLine = FormGroup<{
  item: FormControl<ItemOption | null>;
  qty: FormControl<number | null>;
}>;

/** /demo/componentes: every shared component with sample data, to review in light, dark, desktop and 390 px. */
@Component({
  selector: 'app-components-demo-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatSlideToggleModule,
    MatTabsModule,
    PageHeader,
    StatusTag,
    Stamp,
    QtyInput,
    ItemPicker,
    LookupPicker,
    LocationPicker,
    LinesEditor,
    LineColumn,
    DataTable,
    CellDef,
    RowDetail,
    QtyPipe,
    MxnPipe,
    StatusLabelPipe,
  ],
  templateUrl: './components-demo-page.html',
  styleUrl: './components-demo-page.scss',
})
export class ComponentsDemoPage {
  private readonly confirmService = inject(ConfirmService);
  private readonly reasonService = inject(ReasonService);
  private readonly conflicts = inject(ConflictHandler);
  private readonly notifier = inject(Notifier);

  protected readonly statuses = statuses;
  protected readonly now = new Date().toISOString();

  protected readonly form = new FormGroup({
    supplier: new FormControl<DemoSupplier | null>(null, Validators.required),
    location: new FormControl<string | null>(null, Validators.required),
    date: new FormControl<Date | null>(new Date()),
    kilos: new FormControl<number | null>(12.5, Validators.required),
    pieces: new FormControl<number | null>(3, Validators.required),
    lines: new FormArray<DemoLine>([this.newLine()], {
      validators: [
        minLinesValidator(1),
        uniqueLinesValidator((line) => (line.value as { item?: ItemOption | null }).item?.id),
      ],
    }),
  });
  protected readonly lines = this.form.controls.lines;
  protected readonly newLineFn = () => this.newLine();
  private readonly linesValue = toSignal(
    this.lines.valueChanges.pipe(startWith(this.lines.value)),
    { initialValue: this.lines.value },
  );
  protected readonly totalQty = computed(() =>
    this.linesValue().reduce((sum, line) => sum + (line.qty ?? 0), 0),
  );

  protected readonly searchSuppliers = (q: string): Observable<DemoSupplier[]> =>
    of(
      suppliers.filter((s) => `${s.name} ${s.taxId}`.toLowerCase().includes(q.toLowerCase())),
    ).pipe(delay(150));
  protected readonly supplierName = (s: DemoSupplier) => s.name;
  protected readonly supplierTaxId = (s: DemoSupplier) => `RFC ${s.taxId}`;

  // Table with a fake server: sorts and pages the sample transfers.
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 10, sort: 'folio:desc' });
  protected readonly loading = signal(false);
  protected readonly empty = signal(false);
  protected readonly selection = signal<readonly DemoTransfer[]>([]);
  protected readonly page = computed(() => {
    if (this.empty()) return { items: [] as DemoTransfer[], total: 0 };
    const { page, pageSize, sort } = this.query();
    const [field, direction] = (sort ?? 'folio').split(':') as [keyof DemoTransfer, string?];
    const sorted = [...transfers].sort(
      (a, b) =>
        String(a[field]).localeCompare(String(b[field]), 'es', { numeric: true }) *
        (direction === 'desc' ? -1 : 1),
    );
    return { items: sorted.slice((page - 1) * pageSize, page * pageSize), total: sorted.length };
  });

  protected save(): void {
    this.form.markAllAsTouched();
    this.notifier.info(this.form.valid ? 'Formulario válido.' : 'Revisa los campos marcados.');
  }

  protected async confirm(): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Despachar traspaso',
      message: 'Se descontará la existencia de la Planta.',
      summary: [
        { label: 'Origen', value: 'Planta' },
        { label: 'Destino', value: 'Sucursal Centro' },
        { label: 'Líneas', value: '3' },
      ],
      confirmLabel: 'Despachar',
    });
    this.notifier.info(confirmed ? 'Confirmado.' : 'Cancelado.');
  }

  protected async askReason(): Promise<void> {
    const reason = await this.reasonService.ask({
      title: 'Rechazar pedido',
      confirmLabel: 'Rechazar',
    });
    this.notifier.info(reason ? `Motivo: ${reason}` : 'Cancelado.');
  }

  protected showConcurrency(): void {
    this.conflicts.handle(conflict('concurrency', 'El documento cambió desde que lo abriste.'), {
      reload: () => this.notifier.info('Aquí la pantalla recargaría el documento.'),
    });
  }

  protected showShortages(): void {
    this.conflicts.handle(
      conflict('insufficient_stock', 'No hay existencia suficiente para despachar.', [
        {
          itemId: 'i1',
          sku: 'HAR-001',
          name: 'Harina de trigo',
          lotId: null,
          lotNumber: 'L-0915',
          requested: 50,
          available: 32.5,
        },
        {
          itemId: 'i2',
          sku: 'AZU-002',
          name: 'Azúcar estándar',
          lotId: null,
          lotNumber: null,
          requested: 12,
          available: 0,
        },
      ]),
    );
  }

  private newLine(): DemoLine {
    return new FormGroup({
      item: new FormControl<ItemOption | null>(null, Validators.required),
      qty: new FormControl<number | null>(null, Validators.required),
    });
  }
}

function conflict(code: string, detail: string, shortages?: unknown[]): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 409,
    error: { title: 'Conflicto', status: 409, code, detail, shortages },
  });
}
