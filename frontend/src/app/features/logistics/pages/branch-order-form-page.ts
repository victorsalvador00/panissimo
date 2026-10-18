import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { ApiEnum, Schemas } from '../../../core/api/api';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
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
import { QtyPipe } from '../../../shared/pipes/pipes';
import { StockApi } from '../../inventory/data-access/inventory-api';
import { BranchOrder, BranchOrderSuggestion, BranchOrdersApi } from '../data-access/logistics-api';
import { tomorrow } from '../ui/branch-order-rules';

type OrderLine = FormGroup<{
  item: FormControl<ItemOption | null>;
  requestedQty: FormControl<number | null>;
}>;

/** D-05: a branch orders finished goods (bulk or packaged) and supplies; never semi-finished or raw materials. */
const ORDERABLE_TYPES: readonly ApiEnum<'ItemType'>[] = ['FinishedGood', 'Supply'];

/**
 * ★ /logistica/pedidos/nuevo and /:id/editar (frontend §7.5, RN-20): the active branch orders to the plant, required
 * date (tomorrow), notes and items with the branch's stock; **"Sugerir por mín/máx"** adds only the missing items
 * below their minimum with the quantity to reach the maximum, and shows min, max, stock, in transit and on order.
 */
@Component({
  selector: 'app-branch-order-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    PageHeader,
    LinesEditor,
    LineColumn,
    ItemPicker,
    QtyInput,
    QtyPipe,
  ],
  template: `
    <app-page-header
      [title]="order() ? 'Editar pedido ' + order()!.folio : 'Nuevo pedido a la Planta'"
    />

    @if (branch(); as branch) {
      <form
        id="branch-order-form"
        class="layout pan-has-action-bar"
        [formGroup]="form"
        (ngSubmit)="save()"
        novalidate
      >
        <section class="pan-card" aria-labelledby="order-data">
          <h2 id="order-data">{{ branch.name }}</h2>
          <div class="fields">
            <mat-form-field>
              <mat-label>Se necesita para</mat-label>
              <input
                matInput
                [matDatepicker]="needed"
                [min]="today"
                formControlName="requiredDate"
              />
              <mat-datepicker-toggle matIconSuffix [for]="needed" />
              <mat-datepicker #needed />
              <mat-error>{{ controlError(form.controls.requiredDate) }}</mat-error>
            </mat-form-field>
            <mat-form-field class="wide">
              <mat-label>Notas</mat-label>
              <input matInput formControlName="notes" />
              <mat-error>{{ controlError(form.controls.notes) }}</mat-error>
            </mat-form-field>
          </div>
        </section>

        <section class="pan-card" aria-labelledby="order-lines">
          <div class="lines-head">
            <h2 id="order-lines">Artículos</h2>
            <button
              matButton="tonal"
              type="button"
              [disabled]="suggesting()"
              (click)="suggest(branch.id)"
            >
              <mat-icon>auto_awesome</mat-icon>
              Sugerir por mín/máx
            </button>
          </div>
          <app-lines-editor [lines]="lines" [newLine]="newLine" addLabel="Agregar artículo">
            <ng-template appLineColumn="item" header="Artículo" [appLineColumnOf]="lines" let-line>
              <app-item-picker
                [formControl]="line.controls.item"
                label="Producto o insumo"
                [types]="orderableTypes"
              />
              @if (suggestionOf(line); as s) {
                <span class="hint">
                  Mín {{ s.minQty | qty: s.uomCode }} · máx {{ s.maxQty | qty: s.uomCode }} · en
                  camino {{ s.inTransit | qty: s.uomCode }} · pedido
                  {{ s.onOrder | qty: s.uomCode }}
                </span>
              }
            </ng-template>
            <ng-template
              appLineColumn="stock"
              header="Existencia"
              width="8rem"
              [appLineColumnOf]="lines"
              let-line
            >
              <span class="stock">
                {{
                  stockOf(line) === null
                    ? '—'
                    : (stockOf(line) | qty: line.controls.item.value?.baseUomCode)
                }}
              </span>
            </ng-template>
            <ng-template
              appLineColumn="quantity"
              header="Cantidad"
              width="11rem"
              [appLineColumnOf]="lines"
              let-line
              let-i="index"
            >
              <app-qty-input
                [formControl]="line.controls.requestedQty"
                [unit]="line.controls.item.value?.baseUomCode ?? null"
                [ariaLabel]="'Cantidad de la línea ' + (i + 1)"
              />
            </ng-template>
          </app-lines-editor>
        </section>
      </form>

      <div class="pan-action-bar">
        <button matButton type="button" (click)="back()">Cancelar</button>
        <button matButton="filled" type="submit" form="branch-order-form" [disabled]="saving()">
          Guardar borrador
        </button>
      </div>
    } @else {
      <p class="pan-card">
        Los pedidos los hace una sucursal: elige una sucursal como ubicación activa en la barra
        superior.
      </p>
    }
  `,
  styleUrl: './logistics-form.scss',
  styles: `
    .lines-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;

      h2 {
        margin: 0;
      }
    }

    .hint {
      display: block;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }

    .stock {
      display: block;
      padding-top: 16px;
      text-align: right;
    }
  `,
})
export class BranchOrderFormPage {
  /** Present when editing a draft (`/:id/editar`). */
  readonly id = input<string>();

  private readonly api = inject(BranchOrdersApi);
  private readonly stockApi = inject(StockApi);
  private readonly itemLookup = inject(ItemLookupApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  private readonly active = inject(LocationContextService).active;
  protected readonly orderableTypes = ORDERABLE_TYPES;
  protected readonly controlError = controlError;
  protected readonly today = new Date();
  protected readonly saving = signal(false);
  protected readonly suggesting = signal(false);
  protected readonly order = signal<BranchOrder | null>(null);

  /** The branch that orders: the draft's, or the active location when it is a branch. */
  protected readonly branch = computed(() => {
    const order = this.order();
    if (order) return order.requestingLocation;
    const active = this.active();
    return active?.type === 'Branch' ? active : null;
  });

  protected readonly lines = new FormArray<OrderLine>([], minLinesValidator(1));
  protected readonly form = new FormGroup({
    requiredDate: new FormControl<Date | null>(tomorrow(), Validators.required),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    lines: this.lines,
  });
  protected readonly newLine = () => this.createLine();

  /** Stock of the branch (with its sub-warehouses) per item. */
  private readonly stock = signal<Record<string, number>>({});
  /** The suggestion of the items it added (min, max, in transit, on order). */
  private readonly suggestions = signal<Record<string, BranchOrderSuggestion>>({});

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) void this.load(id);
      else if (this.lines.length === 0) this.lines.push(this.createLine());
    });
  }

  protected stockOf(line: OrderLine): number | null {
    const item = line.controls.item.value;
    return item ? (this.stock()[item.id] ?? null) : null;
  }

  protected suggestionOf(line: OrderLine): BranchOrderSuggestion | null {
    const item = line.controls.item.value;
    return item ? (this.suggestions()[item.id] ?? null) : null;
  }

  /** Adds only the items below their minimum that are not in the order yet. */
  protected async suggest(branchId: string): Promise<void> {
    this.suggesting.set(true);
    try {
      const present = new Set(this.lines.controls.map((l) => l.controls.item.value?.id));
      const missing = (await firstValueFrom(this.api.suggestion(branchId))).filter(
        (s) => !present.has(s.itemId),
      );
      if (missing.length === 0) {
        this.notifier.info('No hay más artículos en o debajo de su mínimo.');
        return;
      }
      const items = await Promise.all(
        missing.map((s) => firstValueFrom(this.itemLookup.byId(s.itemId))),
      );
      // A first empty line gives way to the suggestion.
      if (this.lines.length === 1 && !this.lines.at(0).controls.item.value) this.lines.removeAt(0);
      missing.forEach((s, i) => {
        const line = this.createLine();
        line.setValue({ item: items[i], requestedQty: s.suggestedQty });
        this.lines.push(line);
      });
      this.suggestions.update((all) => ({
        ...all,
        ...Object.fromEntries(missing.map((s) => [s.itemId, s])),
      }));
      this.stock.update((all) => ({
        ...all,
        ...Object.fromEntries(missing.map((s) => [s.itemId, s.stock])),
      }));
      this.notifier.info(
        `Se ${missing.length === 1 ? 'agregó 1 artículo' : `agregaron ${missing.length} artículos`} para llegar a su máximo.`,
      );
    } finally {
      this.suggesting.set(false);
    }
  }

  protected back(): void {
    const order = this.order();
    void this.router.navigate(order ? ['/logistica/pedidos', order.id] : ['/logistica/pedidos']);
  }

  protected async save(): Promise<void> {
    const branch = this.branch();
    if (this.form.invalid || !branch) {
      this.form.markAllAsTouched();
      return;
    }
    const { requiredDate, notes } = this.form.getRawValue();
    const lines: Schemas['BranchOrderLineRequest'][] = this.lines.getRawValue().map((l) => ({
      itemId: l.item!.id,
      requestedQty: l.requestedQty!,
    }));
    const order = this.order();

    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        order
          ? this.api.update(order.id, {
              version: order.version,
              requiredDate: toIsoDate(requiredDate)!,
              notes: notes.trim() || null,
              lines,
            })
          : this.api.create({
              requestingLocationId: branch.id,
              requiredDate: toIsoDate(requiredDate)!,
              notes: notes.trim() || null,
              lines,
            }),
      );
      this.notifier.info(`Pedido ${saved.folio} guardado en borrador.`);
      await this.router.navigate(['/logistica/pedidos', saved.id]);
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
      control.setValue({ item: items[i], requestedQty: line.requestedQty });
      this.lines.push(control);
    });
    this.form.patchValue({
      requiredDate: fromIsoDate(order.requiredDate),
      notes: order.notes ?? '',
    });
    this.breadcrumbs.setCurrent(`Editar ${order.folio}`);
  }

  /** Choosing an item brings the branch's stock of it. */
  private createLine(): OrderLine {
    const line: OrderLine = new FormGroup({
      item: new FormControl<ItemOption | null>(null, Validators.required),
      requestedQty: new FormControl<number | null>(null, Validators.required),
    });
    line.controls.item.valueChanges.subscribe(async (item) => {
      const branch = this.branch();
      if (!item || !branch || this.stock()[item.id] !== undefined) return;
      const page = await firstValueFrom(
        this.stockApi.list({ page: 1, pageSize: 50 }, { locationId: branch.id, itemId: item.id }),
      );
      const onHand = page.items.find((r) => r.locationId === branch.id)?.onHand ?? 0;
      this.stock.update((all) => ({ ...all, [item.id]: onHand }));
    });
    return line;
  }
}
