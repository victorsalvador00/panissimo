import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  LOCALE_ID,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { map, Observable, startWith } from 'rxjs';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier.service';
import { LineColumnDef, LinesEditor } from '../../../shared/components/lines-editor/lines-editor';
import {
  minLinesValidator,
  uniqueLinesValidator,
} from '../../../shared/components/lines-editor/lines-validators';
import { LocationPicker } from '../../../shared/components/location-picker/location-picker';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { fromDateOnly, toDateOnly } from '../../../shared/forms/date-range';
import { FormErrors } from '../../../shared/forms/form-errors.service';
import { formatMxn, MxnPipe } from '../../../shared/pipes/mxn.pipe';
import { PurchaseOrderDto, PurchaseOrdersApi } from '../data-access/purchase-orders.api';
import { SupplierDto, SuppliersApi } from '../data-access/suppliers.api';
import { LookupPicker } from '../ui/lookup-picker';
import {
  createPoLine,
  fromOrderLine,
  fromSupplierItem,
  lineAmounts,
  orderTotals,
  PoItemOption,
  PoLineForm,
  taxLabel,
  toOrderLines,
} from '../ui/purchase-order-lines';
import { isPurchaseLocation, PURCHASE_LOCATION_TYPES } from '../ui/requisition-lines';
import { creditLabel } from './suppliers-list-page';

type SupplierOption = Pick<SupplierDto, 'id' | 'name' | 'taxId'> & { paymentTermsDays?: number };

/**
 * OC en borrador (`/compras/ordenes/nueva`, `/:id/editar`): proveedor (fijo al guardar), entrega en
 * fábrica o comisariato y líneas del catálogo activo del proveedor con precio sugerido editable
 * (RN-30), IVA por línea y totales en vivo. Se guarda como borrador o se guarda y envía (RN-31).
 */
@Component({
  selector: 'app-purchase-order-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    PageHeader,
    LocationPicker,
    LookupPicker,
    QtyInput,
    LinesEditor,
    LineColumnDef,
    MxnPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page sgo-stack">
      <app-page-header
        [title]="order() ? 'Editar orden ' + order()!.folio : 'Nueva orden de compra'"
        subtitle="Cantidades y precios en la unidad de compra de cada artículo; precios sin IVA."
        [crumbs]="[
          { label: 'Compras' },
          { label: 'Órdenes de compra', url: '/compras/ordenes' },
          { label: order()?.folio ?? 'Nueva' },
        ]"
      />

      @if (id() && !order()) {
        <p class="muted">Cargando…</p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="save(false)" novalidate class="sgo-stack">
          <mat-card appearance="outlined">
            <mat-card-content class="header">
              @if (order(); as o) {
                <div class="fixed">
                  <span class="label">Proveedor</span>
                  <strong>{{ o.supplier.name }}</strong>
                  <span class="label">{{ o.supplier.taxId }}</span>
                </div>
              } @else {
                <app-lookup-picker
                  formControlName="supplier"
                  label="Proveedor"
                  requiredMessage="Elige el proveedor."
                  emptyText="Ningún proveedor activo coincide."
                  [search]="searchSuppliers"
                  [display]="supplierName"
                  [meta]="supplierMeta"
                />
              }
              @if (fixedLocation(); as location) {
                <div class="fixed">
                  <span class="label">Entrega en</span>
                  <strong>{{ location.code }} · {{ location.name }}</strong>
                </div>
              } @else {
                <app-location-picker
                  formControlName="deliveryLocationId"
                  label="Entrega en"
                  [types]="purchaseTypes"
                />
              }
              <mat-form-field appearance="outline">
                <mat-label>Fecha esperada</mat-label>
                <input
                  matInput
                  [matDatepicker]="date"
                  [min]="today"
                  formControlName="expectedDate"
                />
                <mat-datepicker-toggle matIconSuffix [for]="date" />
                <mat-datepicker #date />
                <mat-hint>Opcional.</mat-hint>
                @if (form.controls.expectedDate.hasError('matDatepickerMin')) {
                  <mat-error>No puede ser una fecha pasada.</mat-error>
                } @else {
                  <mat-error>{{ form.controls.expectedDate.getError('server') }}</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline" class="notes">
                <mat-label>Notas</mat-label>
                <input matInput formControlName="notes" autocomplete="off" />
                <mat-error>Máximo 500 caracteres.</mat-error>
              </mat-form-field>
            </mat-card-content>
          </mat-card>

          <mat-card appearance="outlined">
            <mat-card-content>
              <h2>Artículos</h2>
              @if (supplierId(); as sid) {
                <app-lines-editor
                  [lines]="form.controls.lines"
                  [createLine]="newLine"
                  [minLines]="1"
                  addLabel="Agregar artículo"
                >
                  <ng-template
                    appLineColumn="Artículo"
                    [appLineColumnOf]="form.controls.lines"
                    let-line
                  >
                    <app-lookup-picker
                      [formControl]="line.controls.item"
                      label="Artículo"
                      requiredMessage="Elige un artículo del catálogo del proveedor."
                      emptyText="El proveedor no tiene ese artículo en su catálogo."
                      subscriptSizing="dynamic"
                      [search]="searchItems"
                      [display]="itemName"
                      [meta]="itemMeta"
                    />
                  </ng-template>
                  <ng-template
                    appLineColumn="Cantidad"
                    width="150px"
                    [appLineColumnOf]="form.controls.lines"
                    let-line
                  >
                    <app-qty-input
                      [formControl]="line.controls.quantity"
                      label="Cantidad"
                      [unit]="line.controls.item.value?.purchaseUomCode"
                      subscriptSizing="dynamic"
                    />
                  </ng-template>
                  <ng-template
                    appLineColumn="Precio sin IVA"
                    width="170px"
                    [appLineColumnOf]="form.controls.lines"
                    let-line
                  >
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Precio</mat-label>
                      <span matTextPrefix>$&nbsp;</span>
                      <input
                        matInput
                        type="number"
                        inputmode="decimal"
                        min="0"
                        [formControl]="line.controls.unitPrice"
                      />
                      @if (catalogChanged(line); as catalog) {
                        <mat-hint>Catálogo: {{ catalog }}</mat-hint>
                      }
                      @if (line.controls.unitPrice.hasError('required')) {
                        <mat-error>Escribe el precio.</mat-error>
                      } @else if (line.controls.unitPrice.hasError('decimals')) {
                        <mat-error>Máximo 4 decimales.</mat-error>
                      } @else if (line.controls.unitPrice.hasError('min')) {
                        <mat-error>No puede ser negativo.</mat-error>
                      }
                    </mat-form-field>
                  </ng-template>
                  <ng-template
                    appLineColumn="IVA"
                    width="80px"
                    [appLineColumnOf]="form.controls.lines"
                    let-line
                  >
                    <span class="cell">{{
                      line.controls.item.value ? tax(line.controls.item.value.taxRate) : ''
                    }}</span>
                  </ng-template>
                  <ng-template
                    appLineColumn="Importe"
                    width="120px"
                    align="end"
                    [appLineColumnOf]="form.controls.lines"
                    let-line
                  >
                    <span class="cell amount">{{ amount(line) }}</span>
                  </ng-template>
                </app-lines-editor>

                <dl class="totals" aria-label="Totales">
                  <div>
                    <dt>Subtotal</dt>
                    <dd>{{ totals().subtotal | mxn }}</dd>
                  </div>
                  <div>
                    <dt>IVA</dt>
                    <dd>{{ totals().tax | mxn }}</dd>
                  </div>
                  <div class="grand">
                    <dt>Total</dt>
                    <dd>{{ totals().total | mxn }}</dd>
                  </div>
                </dl>
              } @else {
                <p class="muted">Elige el proveedor para agregar artículos de su catálogo.</p>
              }
            </mat-card-content>
          </mat-card>

          <div class="sgo-row actions">
            <button mat-flat-button type="button" [disabled]="saving()" (click)="save(true)">
              Guardar y enviar
            </button>
            <button mat-stroked-button type="submit" [disabled]="saving()">Guardar borrador</button>
            <a mat-button [routerLink]="backLink()">Cancelar</a>
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    h2 {
      margin: 0 0 var(--sgo-space-3);
      font: var(--mat-sys-title-medium);
    }
    .header {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      align-items: start;
      gap: 0 var(--sgo-space-4);
    }
    .notes {
      grid-column: 1 / -1;
    }
    .fixed {
      display: grid;
      padding-block: var(--sgo-space-2) var(--sgo-space-4);
    }
    .label,
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
    .label {
      font: var(--mat-sys-body-small);
    }
    .muted {
      margin: 0;
    }
    mat-form-field {
      width: 100%;
    }
    .cell {
      display: inline-block;
      padding-top: var(--sgo-space-4);
    }
    .amount {
      font-variant-numeric: tabular-nums;
    }
    .totals {
      display: grid;
      justify-content: end;
      gap: var(--sgo-space-1);
      margin: var(--sgo-space-4) 0 0;
    }
    .totals div {
      display: grid;
      grid-template-columns: 8rem 9rem;
      text-align: end;
    }
    .totals dt {
      color: var(--mat-sys-on-surface-variant);
    }
    .totals dd {
      margin: 0;
      font-variant-numeric: tabular-nums;
    }
    .totals .grand {
      font-weight: 600;
    }
    .actions {
      flex-wrap: wrap;
    }
  `,
})
export class PurchaseOrderFormPage {
  private readonly api = inject(PurchaseOrdersApi);
  private readonly suppliers = inject(SuppliersApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);
  private readonly activeLocation = inject(LocationContextService).activeLocation;
  private readonly locale = inject(LOCALE_ID);

  /** Borrador a editar (ruta `:id/editar`); sin él, OC nueva. */
  readonly id = input<string>();

  protected readonly purchaseTypes = [...PURCHASE_LOCATION_TYPES];
  protected readonly today = new Date(new Date().setHours(0, 0, 0, 0));
  protected readonly saving = signal(false);
  protected readonly order = signal<PurchaseOrderDto | null>(null);
  /** Artículo con el que se tomó el precio de cada línea (para no pisar un precio editado). */
  private readonly pricedItem = new WeakMap<PoLineForm, string>();

  /** La ubicación activa, si compra; al editar, la de la OC. */
  protected readonly fixedLocation = computed(() => {
    const order = this.order();
    if (order) {
      return order.deliveryLocation;
    }
    const location = this.activeLocation();
    return location && isPurchaseLocation(location.type) ? location : null;
  });

  protected readonly form = new FormGroup({
    supplier: new FormControl<SupplierOption | null>(null, Validators.required),
    deliveryLocationId: new FormControl<string | null>(
      this.fixedLocation()?.id ?? null,
      Validators.required,
    ),
    expectedDate: new FormControl<Date | null>(null),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    lines: new FormArray<PoLineForm>([], {
      validators: [minLinesValidator(1), uniqueLinesValidator('item')],
    }),
  });

  protected readonly supplierId = toSignal(
    this.form.controls.supplier.valueChanges.pipe(
      startWith(this.form.controls.supplier.value),
      map((supplier) => supplier?.id ?? null),
    ),
    { initialValue: null },
  );

  private readonly lineValues = toSignal(
    this.form.controls.lines.valueChanges.pipe(
      startWith(null),
      map(() => this.form.controls.lines.getRawValue()),
    ),
    { initialValue: [] },
  );
  protected readonly totals = computed(() => orderTotals(this.lineValues()));

  protected readonly newLine = () => createPoLine();
  protected readonly searchSuppliers = (q: string): Observable<SupplierOption[]> =>
    this.suppliers.list({ q, page: 1, pageSize: 20, sort: 'name:asc' }).pipe(map((p) => p.items));
  protected readonly supplierName = (supplier: SupplierOption) => supplier.name;
  protected readonly supplierMeta = (supplier: SupplierOption) =>
    supplier.paymentTermsDays === undefined
      ? supplier.taxId
      : `${supplier.taxId} · crédito: ${creditLabel(supplier.paymentTermsDays)}`;
  protected readonly searchItems = (q: string): Observable<PoItemOption[]> =>
    this.suppliers
      .items(this.supplierId()!, { q, page: 1, pageSize: 20, sort: 'name:asc' })
      .pipe(map((page) => page.items.map(fromSupplierItem)));
  protected readonly itemName = (item: PoItemOption) => `${item.sku} · ${item.name}`;
  protected readonly itemMeta = (item: PoItemOption) =>
    `${formatMxn(item.catalogPrice, this.locale, '1.2-4')} / ${item.purchaseUomCode} · IVA ${taxLabel(item.taxRate)}`;
  protected readonly tax = taxLabel;

  protected readonly backLink = computed(() => {
    const id = this.order()?.id;
    return id ? ['/compras/ordenes', id] : ['/compras/ordenes'];
  });

  constructor() {
    effect(() => {
      const location = this.fixedLocation();
      untracked(() => {
        if (location && !this.order()) {
          this.form.controls.deliveryLocationId.setValue(location.id);
        }
      });
    });
    // Otro proveedor: las líneas eran de su catálogo.
    this.form.controls.supplier.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const lines = this.form.controls.lines;
      if (!this.order() && lines.getRawValue().some((line) => line.item)) {
        lines.clear();
        lines.push(createPoLine());
      }
    });
    // Al elegir el artículo se sugiere el precio del catálogo (RN-30), editable.
    this.form.controls.lines.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      for (const line of this.form.controls.lines.controls) {
        const item = line.controls.item.value;
        if (item && item.catalogPrice !== null && this.pricedItem.get(line) !== item.itemId) {
          this.pricedItem.set(line, item.itemId);
          line.controls.unitPrice.setValue(item.catalogPrice);
        }
      }
    });
    effect(() => {
      const id = this.id();
      untracked(() => (id ? this.load(id) : this.form.controls.lines.push(createPoLine())));
    });
  }

  protected amount(line: PoLineForm): string {
    const value = line.getRawValue();
    return value.item && value.quantity ? formatMxn(lineAmounts(value).subtotal, this.locale) : '—';
  }

  /** Precio del catálogo, si el de la línea es distinto. */
  protected catalogChanged(line: PoLineForm): string | null {
    const { item, unitPrice } = line.getRawValue();
    return item?.catalogPrice !== null &&
      item?.catalogPrice !== undefined &&
      unitPrice !== item.catalogPrice
      ? formatMxn(item.catalogPrice, this.locale, '1.2-4')
      : null;
  }

  private load(id: string): void {
    this.api.get(id).subscribe((order) => {
      if (order.status !== 'Draft') {
        void this.router.navigate(['/compras/ordenes', id]);
        return;
      }
      this.order.set(order);
      this.form.patchValue({
        supplier: order.supplier,
        deliveryLocationId: order.deliveryLocation.id,
        expectedDate: fromDateOnly(order.expectedDate),
        notes: order.notes ?? '',
      });
      this.form.controls.supplier.disable();
      this.form.controls.lines.clear();
      order.lines.forEach((line) =>
        this.form.controls.lines.push(
          createPoLine({
            item: fromOrderLine(line),
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineId: line.id,
          }),
        ),
      );
    });
  }

  protected save(submit: boolean): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const common = {
      deliveryLocationId: value.deliveryLocationId!,
      expectedDate: toDateOnly(value.expectedDate),
      notes: value.notes.trim() || null,
      lines: toOrderLines(value.lines),
    };
    const existing = this.order();
    this.saving.set(true);
    const saved$ = existing
      ? this.api.update(existing.id, { version: existing.version, ...common })
      : this.api.create({ supplierId: value.supplier!.id, ...common });

    saved$.subscribe({
      next: (saved) => {
        if (!submit) {
          this.done(saved, `Orden ${saved.folio} guardada como borrador.`);
          return;
        }
        this.api.submit(saved.id, saved.version).subscribe({
          next: (sent) =>
            this.done(
              sent,
              sent.status === 'PendingApproval'
                ? `Orden ${sent.folio} enviada a aprobación.`
                : `Orden ${sent.folio} aprobada (no requiere aprobación por su monto).`,
            ),
          error: () => this.done(saved, `Orden ${saved.folio} guardada como borrador.`),
        });
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.formErrors.handle(error, this.form, {
          reload: () => existing && this.load(existing.id),
        });
      },
    });
  }

  private done(order: PurchaseOrderDto, message: string): void {
    this.saving.set(false);
    this.notifier.success(message);
    void this.router.navigate(['/compras/ordenes', order.id]);
  }
}
