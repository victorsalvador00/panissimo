import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { Schemas } from '../../../core/api/api';
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
import { FormErrors } from '../../../shared/forms/form-errors';
import { InternalTransfersApi, Transfer } from '../../logistics/data-access/logistics-api';
import { LotSelect } from '../ui/lot-select';
import { stockWarehouses } from '../ui/stock-warehouses';

type VoucherLine = FormGroup<{
  item: FormControl<ItemOption | null>;
  quantity: FormControl<number | null>;
  lotId: FormControl<string | null>;
}>;

/**
 * ★ /inventario/vales-internos/nuevo and /:id/editar (frontend §7.3, RN-47): origin and destination sub-warehouses of
 * the active location (different), lines with an optional planned lot. Saves a draft; it is sent from the detail.
 */
@Component({
  selector: 'app-voucher-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    PageHeader,
    LinesEditor,
    LineColumn,
    ItemPicker,
    QtyInput,
    LotSelect,
  ],
  template: `
    <app-page-header
      [title]="voucher() ? 'Editar vale ' + voucher()!.folio : 'Nuevo vale interno'"
    />

    @if (warehouses().length > 1) {
      <form
        id="voucher-form"
        class="layout pan-has-action-bar"
        [formGroup]="form"
        (ngSubmit)="save()"
        novalidate
      >
        <section class="pan-card" aria-labelledby="voucher-data">
          <h2 id="voucher-data">{{ location()?.name }}</h2>
          <div class="fields">
            <mat-form-field>
              <mat-label>Sale de</mat-label>
              <mat-select formControlName="fromWarehouseId">
                @for (warehouse of warehouses(); track warehouse.id) {
                  <mat-option [value]="warehouse.id">{{ warehouse.name }}</mat-option>
                }
              </mat-select>
              <mat-error>{{ controlError(form.controls.fromWarehouseId) }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Entra a</mat-label>
              <mat-select formControlName="toWarehouseId">
                @for (warehouse of destinations(); track warehouse.id) {
                  <mat-option [value]="warehouse.id">{{ warehouse.name }}</mat-option>
                }
              </mat-select>
              <mat-error>{{ controlError(form.controls.toWarehouseId) }}</mat-error>
            </mat-form-field>
            <mat-form-field class="wide">
              <mat-label>Notas</mat-label>
              <input matInput formControlName="notes" />
              <mat-error>{{ controlError(form.controls.notes) }}</mat-error>
            </mat-form-field>
          </div>
        </section>

        <section class="pan-card" aria-labelledby="voucher-lines">
          <h2 id="voucher-lines">Artículos</h2>
          <app-lines-editor [lines]="lines" [newLine]="newLine" addLabel="Agregar artículo">
            <ng-template appLineColumn="item" header="Artículo" [appLineColumnOf]="lines" let-line>
              <app-item-picker [formControl]="line.controls.item" label="Artículo" />
            </ng-template>
            <ng-template
              appLineColumn="quantity"
              header="Cantidad"
              width="12rem"
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
              appLineColumn="lot"
              header="Lote planeado"
              width="18rem"
              [appLineColumnOf]="lines"
              let-line
            >
              @if (line.controls.item.value; as item) {
                @if (item.tracksLots && fromId(); as fromId) {
                  <app-lot-select
                    [formControl]="line.controls.lotId"
                    [locationId]="fromId"
                    [itemId]="item.id"
                    [unit]="item.baseUomCode"
                  />
                } @else if (!item.tracksLots) {
                  <span class="muted">Sin lotes.</span>
                }
              }
            </ng-template>
          </app-lines-editor>
        </section>
      </form>

      <div class="pan-action-bar">
        <button matButton type="button" (click)="back()">Cancelar</button>
        <button matButton="filled" type="submit" form="voucher-form" [disabled]="saving()">
          Guardar borrador
        </button>
      </div>
    } @else {
      <p class="pan-card">
        Los vales internos van entre dos subalmacenes de la ubicación activa donde puedas mover
        existencia; {{ location()?.name ?? 'la ubicación activa' }} no tiene dos.
      </p>
    }
  `,
  styleUrl: '../../logistics/pages/logistics-form.scss',
})
export class VoucherFormPage {
  /** Present when editing a draft (`/:id/editar`). */
  readonly id = input<string>();

  private readonly api = inject(InternalTransfersApi);
  private readonly itemLookup = inject(ItemLookupApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  protected readonly location = inject(LocationContextService).active;
  protected readonly warehouses = stockWarehouses(this.location);
  protected readonly controlError = controlError;
  protected readonly saving = signal(false);
  protected readonly voucher = signal<Transfer | null>(null);

  protected readonly lines = new FormArray<VoucherLine>([], minLinesValidator(1));
  protected readonly form = new FormGroup({
    fromWarehouseId: new FormControl<string | null>(null, Validators.required),
    toWarehouseId: new FormControl<string | null>(null, Validators.required),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    lines: this.lines,
  });
  protected readonly newLine = () => this.createLine();
  protected readonly fromId = toSignal(this.form.controls.fromWarehouseId.valueChanges, {
    initialValue: null,
  });
  /** RN-47: the destination is another sub-warehouse. */
  protected readonly destinations = computed(() =>
    this.warehouses().filter((w) => w.id !== this.fromId()),
  );

  constructor() {
    this.lines.push(this.createLine());
    effect(() => {
      const id = this.id();
      if (id) void this.load(id);
    });
    this.form.controls.fromWarehouseId.valueChanges.subscribe((from) => {
      const to = this.form.controls.toWarehouseId;
      if (to.value === from) to.setValue(null);
    });
  }

  protected back(): void {
    const voucher = this.voucher();
    void this.router.navigate(
      voucher ? ['/inventario/vales-internos', voucher.id] : ['/inventario/vales-internos'],
    );
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { fromWarehouseId, toWarehouseId, notes } = this.form.getRawValue();
    const lines: Schemas['TransferLineRequest'][] = this.lines.getRawValue().map((l) => ({
      itemId: l.item!.id,
      lotId: l.item!.tracksLots ? l.lotId : null,
      quantity: l.quantity!,
    }));
    const voucher = this.voucher();

    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        voucher
          ? this.api.update(voucher.id, {
              version: voucher.version,
              toLocationId: toWarehouseId!,
              notes: notes.trim() || null,
              lines,
            })
          : this.api.create({
              fromWarehouseId: fromWarehouseId!,
              toWarehouseId: toWarehouseId!,
              notes: notes.trim() || null,
              lines,
            }),
      );
      this.notifier.info(`Vale ${saved.folio} guardado.`);
      await this.router.navigate(['/inventario/vales-internos', saved.id]);
    } catch (error) {
      this.formErrors.apply(this.form, error);
    } finally {
      this.saving.set(false);
    }
  }

  private async load(id: string): Promise<void> {
    const voucher = await firstValueFrom(this.api.get(id));
    const items = await Promise.all(
      voucher.lines.map((l) => firstValueFrom(this.itemLookup.byId(l.itemId))),
    );
    this.lines.clear();
    voucher.lines.forEach((line, i) => {
      const control = this.createLine();
      control.setValue({ item: items[i], quantity: line.shippedQty, lotId: line.lotId });
      this.lines.push(control);
    });
    this.form.patchValue({
      fromWarehouseId: voucher.from.id,
      toWarehouseId: voucher.to.id,
      notes: voucher.notes ?? '',
    });
    // The origin of a voucher does not change.
    this.form.controls.fromWarehouseId.disable();
    this.voucher.set(voucher);
    this.breadcrumbs.setCurrent(`Editar ${voucher.folio}`);
  }

  private createLine(): VoucherLine {
    return new FormGroup({
      item: new FormControl<ItemOption | null>(null, Validators.required),
      quantity: new FormControl<number | null>(null, Validators.required),
      lotId: new FormControl<string | null>(null),
    });
  }
}
