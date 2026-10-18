import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { distinctUntilChanged, firstValueFrom, map, of } from 'rxjs';
import type { Schemas } from '../../../core/api/api';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import {
  LineColumn,
  LinesEditor,
  minLinesValidator,
} from '../../../shared/components/lines-editor/lines-editor';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { controlError } from '../../../shared/forms/control-error';
import { fromIsoDate, toIsoDate } from '../../../shared/forms/dates';
import { FormErrors } from '../../../shared/forms/form-errors';
import { MxnPipe } from '../../../shared/pipes/pipes';
import {
  PurchaseOrder,
  PurchaseOrdersApi,
  SupplierItem,
  SupplierOption,
  SuppliersApi,
} from '../data-access/purchasing-api';
import { lineSubtotal, orderTotals } from '../ui/purchase-math';
import { SupplierPicker } from '../ui/supplier-picker';

type OrderLine = FormGroup<{
  lineId: FormControl<string | null>;
  itemId: FormControl<string | null>;
  quantity: FormControl<number | null>;
  unitPrice: FormControl<number | null>;
  /** The item's VAT (from the catalog, or the saved line). */
  taxRate: FormControl<number>;
  /** Folio of the requisition the line came from (read-only). */
  requisition: FormControl<string | null>;
}>;

function inDays(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * /compras/ordenes/nueva and /:id/editar (frontend §7.6, RN-30): supplier (fixed once saved), delivery plant,
 * expected date; lines of the supplier's active catalog with the price suggested and editable, VAT and totals live
 * with the same rounding as the backend; the requisition each line came from. Saves a draft.
 */
@Component({
  selector: 'app-purchase-order-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    PageHeader,
    LinesEditor,
    LineColumn,
    QtyInput,
    SupplierPicker,
    MxnPipe,
  ],
  template: `
    <app-page-header
      [title]="order() ? 'Editar orden de compra ' + order()!.folio : 'Nueva orden de compra'"
    />

    <form
      id="po-form"
      class="layout pan-has-action-bar"
      [formGroup]="form"
      (ngSubmit)="save()"
      novalidate
    >
      <section class="pan-card" aria-labelledby="po-data">
        <h2 id="po-data">Datos de la orden</h2>
        <div class="fields">
          @if (order(); as o) {
            <mat-form-field class="wide">
              <mat-label>Proveedor</mat-label>
              <input matInput [value]="o.supplierName + ' · ' + o.supplierTaxId" disabled />
              <mat-hint>El proveedor no cambia en una orden guardada.</mat-hint>
            </mat-form-field>
          } @else {
            <app-supplier-picker class="wide" formControlName="supplier" label="Proveedor" />
          }
          <mat-form-field>
            <mat-label>Entrega en</mat-label>
            <mat-select formControlName="deliveryLocationId">
              @for (plant of plants(); track plant.id) {
                <mat-option [value]="plant.id">{{ plant.name }}</mat-option>
              }
            </mat-select>
            <mat-error>{{ controlError(form.controls.deliveryLocationId) }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Fecha esperada</mat-label>
            <input matInput [matDatepicker]="expected" formControlName="expectedDate" />
            <mat-datepicker-toggle matIconSuffix [for]="expected" />
            <mat-datepicker #expected />
            <mat-error>{{ controlError(form.controls.expectedDate) }}</mat-error>
          </mat-form-field>
          <mat-form-field class="wide">
            <mat-label>Notas</mat-label>
            <input matInput formControlName="notes" />
            <mat-error>{{ controlError(form.controls.notes) }}</mat-error>
          </mat-form-field>
        </div>
      </section>

      <section class="pan-card" aria-labelledby="po-lines">
        <h2 id="po-lines">Artículos</h2>
        @if (!supplierId()) {
          <p class="muted">Elige el proveedor para agregar artículos de su catálogo.</p>
        } @else if (catalog.isLoading()) {
          <p class="muted" role="status">Cargando el catálogo del proveedor…</p>
        } @else {
          <!-- Rendered once the catalog is in: the lines are created with its options. -->
          @if (catalog.value().length === 0) {
            <p class="muted">Este proveedor no tiene artículos activos en su catálogo.</p>
          }
          <app-lines-editor [lines]="lines" [newLine]="newLine" addLabel="Agregar artículo">
            <ng-template appLineColumn="item" header="Artículo" [appLineColumnOf]="lines" let-line>
              <mat-form-field>
                <mat-label>Artículo del catálogo</mat-label>
                <mat-select [formControl]="line.controls.itemId">
                  @for (row of catalog.value(); track row.id) {
                    <mat-option [value]="row.itemId">
                      {{ row.itemSku }} · {{ row.itemName }}
                    </mat-option>
                  }
                </mat-select>
                @if (line.controls.requisition.value) {
                  <mat-hint>De la requisición {{ line.controls.requisition.value }}</mat-hint>
                }
              </mat-form-field>
            </ng-template>
            <ng-template
              appLineColumn="quantity"
              header="Cantidad"
              width="10rem"
              [appLineColumnOf]="lines"
              let-line
              let-i="index"
            >
              <app-qty-input
                [formControl]="line.controls.quantity"
                [unit]="unitOf(line)"
                [ariaLabel]="'Cantidad de la línea ' + (i + 1)"
              />
            </ng-template>
            <ng-template
              appLineColumn="price"
              header="Precio"
              width="10rem"
              [appLineColumnOf]="lines"
              let-line
              let-i="index"
            >
              <app-qty-input
                [formControl]="line.controls.unitPrice"
                unit="$"
                [decimals]="4"
                allowZero
                [ariaLabel]="'Precio de la línea ' + (i + 1)"
              />
            </ng-template>
            <ng-template
              appLineColumn="amount"
              header="Importe e IVA"
              width="9rem"
              [appLineColumnOf]="lines"
              let-line
            >
              <span class="amount">
                {{ subtotalOf(line) | mxn }}
                <span class="muted">IVA {{ line.controls.taxRate.value * 100 }} %</span>
              </span>
            </ng-template>
          </app-lines-editor>
          <dl class="totals" aria-live="polite">
            <dt>Subtotal</dt>
            <dd>{{ totals().subtotal | mxn }}</dd>
            <dt>IVA</dt>
            <dd>{{ totals().tax | mxn }}</dd>
            <dt>Total</dt>
            <dd class="total">{{ totals().total | mxn }}</dd>
          </dl>
        }
      </section>
    </form>

    <div class="pan-action-bar">
      <button matButton type="button" (click)="back()">Cancelar</button>
      <button matButton="filled" type="submit" form="po-form" [disabled]="saving()">
        Guardar borrador
      </button>
    </div>
  `,
  styleUrl: '../../logistics/pages/logistics-form.scss',
  styles: `
    .amount {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      padding-top: 12px;
    }

    .muted {
      display: inline;
      padding: 0;
      font: var(--mat-sys-body-small);
    }

    .totals {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 4px 16px;
      max-width: 280px;
      margin: 12px 0 0 auto;

      dt {
        color: var(--mat-sys-on-surface-variant);
        text-align: right;
      }

      dd {
        margin: 0;
        text-align: right;
      }

      .total {
        font-weight: 700;
      }
    }
  `,
})
export class PurchaseOrderFormPage {
  /** Present when editing a draft (`/:id/editar`). */
  readonly id = input<string>();

  private readonly api = inject(PurchaseOrdersApi);
  private readonly suppliersApi = inject(SuppliersApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  private readonly context = inject(LocationContextService);
  protected readonly plants = computed(() =>
    this.context.locations().filter((l) => l.type === 'Plant'),
  );
  protected readonly controlError = controlError;
  protected readonly saving = signal(false);
  protected readonly order = signal<PurchaseOrder | null>(null);

  protected readonly lines = new FormArray<OrderLine>([], minLinesValidator(1));
  protected readonly form = new FormGroup({
    supplier: new FormControl<SupplierOption | null>(null),
    deliveryLocationId: new FormControl<string | null>(null, Validators.required),
    expectedDate: new FormControl<Date | null>(inDays(7), Validators.required),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    lines: this.lines,
  });
  protected readonly newLine = () => this.createLine();

  private readonly chosenSupplier = toSignal(
    this.form.controls.supplier.valueChanges.pipe(
      map((supplier) => (supplier && typeof supplier === 'object' ? supplier : null)),
    ),
    { initialValue: null },
  );
  protected readonly supplierId = computed(
    () => this.order()?.supplierId ?? this.chosenSupplier()?.id ?? null,
  );
  /** Active rows of the supplier's catalog (RN-30). */
  protected readonly catalog = rxResource({
    params: () => this.supplierId(),
    stream: ({ params }) => (params ? this.suppliersApi.items(params, false) : of([])),
    defaultValue: [] as SupplierItem[],
  });
  /** Bumps on every edit of the lines, for the live totals. */
  private readonly edits = signal(0);
  protected readonly totals = computed(() => {
    this.edits();
    return orderTotals(
      this.lines.getRawValue().map((l) => ({
        quantity: l.quantity ?? 0,
        unitPrice: l.unitPrice ?? 0,
        taxRate: l.taxRate,
      })),
    );
  });

  constructor() {
    this.form.controls.supplier.addValidators((c) =>
      this.order() || c.value ? null : { required: true },
    );
    this.lines.valueChanges.subscribe(() => this.edits.update((n) => n + 1));
    effect(() => {
      const id = this.id();
      if (id) void this.load(id);
      else if (this.lines.length === 0) this.lines.push(this.createLine());
    });
    // The delivery plant: the active location when it is a plant, otherwise the user's first plant.
    effect(() => {
      const control = this.form.controls.deliveryLocationId;
      if (control.value || this.id()) return;
      const active = this.context.active();
      control.setValue(active?.type === 'Plant' ? active.id : (this.plants()[0]?.id ?? null));
    });
    // Another supplier: the lines of the previous catalog no longer apply. Only a real change of supplier counts (the
    // picker also emits while typing and when it writes its value back).
    this.form.controls.supplier.valueChanges
      .pipe(
        map((supplier) => (supplier && typeof supplier === 'object' ? supplier.id : null)),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.lines.clear();
        this.lines.push(this.createLine());
      });
  }

  protected unitOf(line: OrderLine): string | null {
    const row = this.catalog.value().find((r) => r.itemId === line.controls.itemId.value);
    return row ? (row.purchaseUomCode ?? row.baseUomCode) : null;
  }

  protected subtotalOf(line: OrderLine): number | null {
    const { quantity, unitPrice } = line.getRawValue();
    return quantity && unitPrice !== null ? lineSubtotal(quantity, unitPrice) : null;
  }

  protected back(): void {
    const order = this.order();
    void this.router.navigate(order ? ['/compras/ordenes', order.id] : ['/compras/ordenes']);
  }

  protected async save(): Promise<void> {
    this.form.controls.supplier.updateValueAndValidity();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const lines: Schemas['PurchaseOrderLineRequest'][] = this.lines.getRawValue().map((l) => ({
      lineId: l.lineId,
      itemId: l.itemId!,
      quantity: l.quantity!,
      unitPrice: l.unitPrice,
    }));
    const order = this.order();

    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        order
          ? this.api.update(order.id, {
              version: order.version,
              deliveryLocationId: v.deliveryLocationId!,
              expectedDate: toIsoDate(v.expectedDate)!,
              notes: v.notes.trim() || null,
              lines,
            })
          : this.api.create({
              supplierId: v.supplier!.id,
              deliveryLocationId: v.deliveryLocationId!,
              expectedDate: toIsoDate(v.expectedDate)!,
              notes: v.notes.trim() || null,
              lines,
            }),
      );
      this.notifier.info(`Orden de compra ${saved.folio} guardada en borrador.`);
      await this.router.navigate(['/compras/ordenes', saved.id]);
    } catch (error) {
      this.formErrors.apply(this.form, error);
    } finally {
      this.saving.set(false);
    }
  }

  private async load(id: string): Promise<void> {
    const order = await firstValueFrom(this.api.get(id));
    this.order.set(order);
    this.form.patchValue(
      {
        deliveryLocationId: order.deliveryLocationId,
        expectedDate: fromIsoDate(order.expectedDate),
        notes: order.notes ?? '',
      },
      { emitEvent: false },
    );
    this.lines.clear();
    for (const line of order.lines) {
      const control = this.createLine();
      control.setValue(
        {
          lineId: line.id,
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRate: line.taxRate,
          requisition: line.requisitionFolio,
        },
        { emitEvent: false },
      );
      this.lines.push(control);
    }
    this.breadcrumbs.setCurrent(`Editar ${order.folio}`);
  }

  /** Choosing an item suggests its catalog price (RN-30) and takes its VAT. */
  private createLine(): OrderLine {
    const line: OrderLine = new FormGroup({
      lineId: new FormControl<string | null>(null),
      itemId: new FormControl<string | null>(null, Validators.required),
      quantity: new FormControl<number | null>(null, Validators.required),
      unitPrice: new FormControl<number | null>(null, Validators.required),
      taxRate: new FormControl(0, { nonNullable: true }),
      requisition: new FormControl<string | null>(null),
    });
    line.controls.itemId.valueChanges.subscribe((itemId) => {
      const row = this.catalog.value().find((r) => r.itemId === itemId);
      if (!row) return;
      line.controls.unitPrice.setValue(row.price);
      line.controls.taxRate.setValue(row.taxRate);
    });
    return line;
  }
}
