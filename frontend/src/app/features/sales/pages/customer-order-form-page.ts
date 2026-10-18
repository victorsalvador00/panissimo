import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { firstValueFrom, map, of } from 'rxjs';
import type { Schemas } from '../../../core/api/api';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { ItemOption, ItemPicker } from '../../../shared/components/item-picker/item-picker';
import {
  LineColumn,
  LinesEditor,
  minLinesValidator,
} from '../../../shared/components/lines-editor/lines-editor';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { ItemLookupApi } from '../../../shared/data-access/item-lookup';
import { controlError } from '../../../shared/forms/control-error';
import { fromIsoDate, toIsoDate } from '../../../shared/forms/dates';
import { FormErrors } from '../../../shared/forms/form-errors';
import { MxnPipe, formatQty } from '../../../shared/pipes/pipes';
import {
  CustomerItem,
  CustomerOption,
  CustomerOrder,
  CustomerOrdersApi,
  CustomersApi,
} from '../data-access/sales-api';
import { repeatedItems } from '../ui/customer-order-actions';
import { CustomerPicker } from '../ui/customer-picker';

type OrderLine = FormGroup<{
  item: FormControl<ItemOption | null>;
  quantity: FormControl<number | null>;
  unitPrice: FormControl<number | null>;
}>;

function tomorrow(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  return date;
}

/**
 * /ventas/pedidos/nuevo and /:id/editar (frontend §7.7, RN-80): customer (fixed once saved), delivery point, required
 * date, the customer's reference and notes; lines of finished goods (each once) with quantity and an optional price
 * (the customer's informative price by default, D-06). "Guardar borrador" or "Guardar y confirmar".
 */
@Component({
  selector: 'app-customer-order-form-page',
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
    ItemPicker,
    QtyInput,
    CustomerPicker,
    MxnPipe,
  ],
  template: `
    <app-page-header
      [title]="order() ? 'Editar pedido ' + order()!.folio : 'Nuevo pedido de cliente'"
    />

    <form
      id="customer-order-form"
      class="layout pan-has-action-bar"
      [formGroup]="form"
      (ngSubmit)="save(false)"
      novalidate
    >
      <section class="pan-card" aria-labelledby="order-data">
        <h2 id="order-data">Datos del pedido</h2>
        <div class="fields">
          @if (order(); as o) {
            <mat-form-field class="wide">
              <mat-label>Cliente</mat-label>
              <input matInput [value]="o.customerCode + ' · ' + o.customerName" disabled />
              <mat-hint>El cliente no cambia en un pedido guardado.</mat-hint>
            </mat-form-field>
          } @else {
            <app-customer-picker class="wide" formControlName="customer" label="Cliente" />
          }
          <mat-form-field>
            <mat-label>Punto de entrega</mat-label>
            <mat-select formControlName="deliveryPointId">
              <mat-option [value]="null">Sin punto de entrega</mat-option>
              @for (point of points.value(); track point.id) {
                <mat-option [value]="point.id">{{ point.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Se necesita para</mat-label>
            <input matInput [matDatepicker]="needed" [min]="today" formControlName="requiredDate" />
            <mat-datepicker-toggle matIconSuffix [for]="needed" />
            <mat-datepicker #needed />
            <mat-error>{{ controlError(form.controls.requiredDate) }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Referencia del cliente</mat-label>
            <input matInput formControlName="customerReference" autocomplete="off" />
            <mat-hint>Su orden de compra, si la tiene.</mat-hint>
            <mat-error>{{ controlError(form.controls.customerReference) }}</mat-error>
          </mat-form-field>
          <mat-form-field class="wide">
            <mat-label>Notas</mat-label>
            <input matInput formControlName="notes" />
            <mat-error>{{ controlError(form.controls.notes) }}</mat-error>
          </mat-form-field>
        </div>
      </section>

      <section class="pan-card" aria-labelledby="order-lines">
        <h2 id="order-lines">Productos</h2>
        <app-lines-editor [lines]="lines" [newLine]="newLine" addLabel="Agregar producto">
          <ng-template
            appLineColumn="item"
            header="Producto"
            [appLineColumnOf]="lines"
            let-line
            let-i="index"
          >
            <app-item-picker
              [formControl]="line.controls.item"
              label="Producto terminado"
              type="FinishedGood"
            />
            @if (repeated().includes(i)) {
              <span class="error">Este producto ya está en el pedido.</span>
            } @else if (customerSkuOf(line); as sku) {
              <span class="hint">Clave del cliente: {{ sku }}</span>
            }
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
              [unit]="line.controls.item.value?.baseUomCode ?? null"
              [ariaLabel]="'Cantidad de la línea ' + (i + 1)"
            />
          </ng-template>
          <ng-template
            appLineColumn="price"
            header="Precio (opcional)"
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
        </app-lines-editor>
        <p class="subtotal">
          Importe informativo: <strong>{{ subtotal() | mxn }}</strong> (sin IVA)
        </p>
      </section>
    </form>

    <div class="pan-action-bar">
      <button matButton type="button" (click)="back()">Cancelar</button>
      <button matButton="tonal" type="submit" form="customer-order-form" [disabled]="saving()">
        Guardar borrador
      </button>
      <button matButton="filled" type="button" [disabled]="saving()" (click)="save(true)">
        Guardar y confirmar
      </button>
    </div>
  `,
  styleUrl: '../../logistics/pages/logistics-form.scss',
  styles: `
    .hint {
      display: block;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }

    .error {
      display: block;
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }

    .subtotal {
      margin: 12px 0 0;
      text-align: right;
    }
  `,
})
export class CustomerOrderFormPage {
  /** Present when editing a draft (`/:id/editar`). */
  readonly id = input<string>();

  private readonly api = inject(CustomerOrdersApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly itemLookup = inject(ItemLookupApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly confirmService = inject(ConfirmService);
  private readonly formErrors = inject(FormErrors);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  protected readonly controlError = controlError;
  protected readonly today = new Date();
  protected readonly saving = signal(false);
  protected readonly order = signal<CustomerOrder | null>(null);

  protected readonly lines = new FormArray<OrderLine>([], minLinesValidator(1));
  protected readonly form = new FormGroup({
    customer: new FormControl<CustomerOption | null>(null),
    deliveryPointId: new FormControl<string | null>(null),
    requiredDate: new FormControl<Date | null>(tomorrow(), Validators.required),
    customerReference: new FormControl('', {
      nonNullable: true,
      validators: Validators.maxLength(50),
    }),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    lines: this.lines,
  });
  protected readonly newLine = () => this.createLine();

  private readonly chosen = toSignal(
    this.form.controls.customer.valueChanges.pipe(
      map((customer) => (customer && typeof customer === 'object' ? customer : null)),
    ),
    { initialValue: null },
  );
  protected readonly customerId = computed(
    () => this.order()?.customerId ?? this.chosen()?.id ?? null,
  );
  /** Active delivery points of the customer (RN-80). */
  protected readonly points = rxResource({
    params: () => this.customerId(),
    stream: ({ params }) =>
      params
        ? this.customersApi.points(params).pipe(map((points) => points.filter((p) => p.isActive)))
        : of([]),
    defaultValue: [],
  });
  /** The customer's active items: their code and informative price (D-06). */
  private readonly customerItems = rxResource({
    params: () => this.customerId(),
    stream: ({ params }) =>
      params
        ? this.customersApi.items(params).pipe(map((items) => items.filter((i) => i.isActive)))
        : of([] as CustomerItem[]),
    defaultValue: [] as CustomerItem[],
  });
  /** Bumps on every edit of the lines. */
  private readonly edits = signal(0);
  protected readonly repeated = computed(() => {
    this.edits();
    return repeatedItems(this.lines.controls.map((l) => l.controls.item.value?.id ?? null));
  });
  protected readonly subtotal = computed(() => {
    this.edits();
    return this.lines.controls.reduce((sum, l) => {
      const { quantity, unitPrice } = l.getRawValue();
      return sum + (quantity ?? 0) * (unitPrice ?? 0);
    }, 0);
  });

  constructor() {
    this.form.controls.customer.addValidators((c) =>
      this.order() || (c.value && typeof c.value === 'object') ? null : { required: true },
    );
    this.lines.valueChanges.subscribe(() => this.edits.update((n) => n + 1));
    effect(() => {
      const id = this.id();
      if (id) void this.load(id);
      else if (this.lines.length === 0) this.lines.push(this.createLine());
    });
  }

  protected customerSkuOf(line: OrderLine): string | null {
    const item = line.controls.item.value;
    return item
      ? (this.customerItems.value().find((c) => c.itemId === item.id)?.customerSku ?? null)
      : null;
  }

  protected back(): void {
    const order = this.order();
    void this.router.navigate(order ? ['/ventas/pedidos', order.id] : ['/ventas/pedidos']);
  }

  /** Saves the draft; with `confirm`, confirms it right after (it becomes demand of the plan). */
  protected async save(confirm: boolean): Promise<void> {
    this.form.controls.customer.updateValueAndValidity();
    if (this.form.invalid || this.repeated().length > 0) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const lines: Schemas['CustomerOrderLineRequest'][] = this.lines.getRawValue().map((l) => ({
      itemId: l.item!.id,
      quantity: l.quantity!,
      unitPrice: l.unitPrice,
    }));
    if (confirm) {
      const confirmed = await this.confirmService.confirm({
        title: 'Guardar y confirmar pedido',
        message:
          'El pedido confirmado entra al plan de producción y ya no se edita; si cambia, se cancela y se captura otro.',
        summary: this.lines.getRawValue().map((l) => ({
          label: l.item!.sku,
          value: formatQty(l.quantity, l.item!.baseUomCode),
        })),
        confirmLabel: 'Confirmar pedido',
      });
      if (!confirmed) return;
    }
    const order = this.order();
    const fields = {
      deliveryPointId: v.deliveryPointId,
      requiredDate: toIsoDate(v.requiredDate)!,
      customerReference: v.customerReference.trim() || null,
      notes: v.notes.trim() || null,
      lines,
    };

    this.saving.set(true);
    try {
      let saved = await firstValueFrom(
        order
          ? this.api.update(order.id, { version: order.version, ...fields })
          : this.api.create({ customerId: v.customer!.id, ...fields }),
      );
      if (confirm) saved = await firstValueFrom(this.api.confirm(saved.id, saved.version));
      this.notifier.info(
        confirm
          ? `Pedido ${saved.folio} confirmado.`
          : `Pedido ${saved.folio} guardado en borrador.`,
      );
      await this.router.navigate(['/ventas/pedidos', saved.id]);
    } catch (error) {
      this.formErrors.apply(this.form, error);
    } finally {
      this.saving.set(false);
    }
  }

  private async load(id: string): Promise<void> {
    const order = await firstValueFrom(this.api.get(id));
    const items = await Promise.all(
      order.lines.map((l) => firstValueFrom(this.itemLookup.byId(l.itemId))),
    );
    this.order.set(order);
    this.lines.clear();
    order.lines.forEach((line, i) => {
      const control = this.createLine();
      control.setValue(
        { item: items[i], quantity: line.quantity, unitPrice: line.unitPrice },
        { emitEvent: false },
      );
      this.lines.push(control);
    });
    this.form.patchValue({
      deliveryPointId: order.deliveryPointId,
      requiredDate: fromIsoDate(order.requiredDate),
      customerReference: order.customerReference ?? '',
      notes: order.notes ?? '',
    });
    this.breadcrumbs.setCurrent(`Editar ${order.folio}`);
  }

  /** Choosing a product takes the customer's informative price while the line has none. */
  private createLine(): OrderLine {
    const line: OrderLine = new FormGroup({
      item: new FormControl<ItemOption | null>(null, Validators.required),
      quantity: new FormControl<number | null>(null, Validators.required),
      unitPrice: new FormControl<number | null>(null),
    });
    line.controls.item.valueChanges.subscribe((item) => {
      const price = item
        ? this.customerItems.value().find((c) => c.itemId === item.id)?.price
        : undefined;
      if (price !== undefined && price !== null && line.controls.unitPrice.value === null)
        line.controls.unitPrice.setValue(price);
    });
    return line;
  }
}
