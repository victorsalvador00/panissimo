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
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
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
import { MxnPipe } from '../../../shared/pipes/pipes';
import {
  Requisition,
  RequisitionsApi,
  SupplierOffer,
  SupplierOffersApi,
} from '../data-access/purchasing-api';
import { repeatedWithoutNote } from '../ui/requisition-actions';

type RequisitionLine = FormGroup<{
  item: FormControl<ItemOption | null>;
  quantity: FormControl<number | null>;
  supplierId: FormControl<string | null>;
  notes: FormControl<string>;
}>;

/** What a plant buys: raw materials and supplies. */
const PURCHASED_TYPES: readonly ApiEnum<'ItemType'>[] = ['RawMaterial', 'Supply'];

function inDays(days: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * /compras/requisiciones/nueva and /:id/editar (frontend §7.6, RN-34): the plant, needed by (today + 7 by default,
 * never past), lines in the purchase unit with the suggested supplier (the preferred one) and the estimated amount; a
 * repeated item needs a note. Saves a draft.
 */
@Component({
  selector: 'app-requisition-form-page',
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
    MxnPipe,
  ],
  template: `
    <app-page-header
      [title]="requisition() ? 'Editar requisición ' + requisition()!.folio : 'Nueva requisición'"
    />

    @if (plant(); as plant) {
      <form
        id="requisition-form"
        class="layout pan-has-action-bar"
        [formGroup]="form"
        (ngSubmit)="save()"
        novalidate
      >
        <section class="pan-card" aria-labelledby="requisition-data">
          <h2 id="requisition-data">{{ plant.name }}</h2>
          <div class="fields">
            <mat-form-field>
              <mat-label>Se necesita para</mat-label>
              <input matInput [matDatepicker]="needed" [min]="today" formControlName="neededBy" />
              <mat-datepicker-toggle matIconSuffix [for]="needed" />
              <mat-datepicker #needed />
              <mat-error>{{ controlError(form.controls.neededBy) }}</mat-error>
            </mat-form-field>
            <mat-form-field class="wide">
              <mat-label>Notas</mat-label>
              <input matInput formControlName="notes" />
              <mat-error>{{ controlError(form.controls.notes) }}</mat-error>
            </mat-form-field>
          </div>
        </section>

        <section class="pan-card" aria-labelledby="requisition-lines">
          <h2 id="requisition-lines">Artículos</h2>
          <app-lines-editor [lines]="lines" [newLine]="newLine" addLabel="Agregar artículo">
            <ng-template appLineColumn="item" header="Artículo" [appLineColumnOf]="lines" let-line>
              <app-item-picker
                [formControl]="line.controls.item"
                label="Materia prima o insumo"
                [types]="purchasedTypes"
              />
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
                [formControl]="line.controls.quantity"
                [unit]="unitOf(line)"
                [ariaLabel]="'Cantidad de la línea ' + (i + 1)"
              />
            </ng-template>
            <ng-template
              appLineColumn="supplier"
              header="Proveedor"
              width="16rem"
              [appLineColumnOf]="lines"
              let-line
              let-i="index"
            >
              @if (line.controls.item.value) {
                @if (offersOf(line).length > 0) {
                  <mat-form-field>
                    <mat-label>Proveedor</mat-label>
                    <mat-select [formControl]="line.controls.supplierId">
                      @for (offer of offersOf(line); track offer.supplierId) {
                        <mat-option [value]="offer.supplierId">
                          {{ offer.supplierName }}{{ offer.isPreferred ? ' (preferido)' : '' }}
                        </mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                } @else {
                  <span class="muted">Ningún proveedor activo lo vende.</span>
                }
              }
            </ng-template>
            <ng-template
              appLineColumn="amount"
              header="Importe"
              width="8rem"
              [appLineColumnOf]="lines"
              let-line
            >
              <span class="amount">{{ amountOf(line) | mxn }}</span>
            </ng-template>
            <ng-template
              appLineColumn="notes"
              header="Nota"
              [appLineColumnOf]="lines"
              let-line
              let-i="index"
            >
              <mat-form-field>
                <mat-label>Nota</mat-label>
                <input matInput [formControl]="line.controls.notes" />
                @if (missingNotes().includes(i)) {
                  <mat-hint class="error">Artículo repetido: explica por qué.</mat-hint>
                }
              </mat-form-field>
            </ng-template>
          </app-lines-editor>
          <p class="subtotal">
            Subtotal estimado: <strong>{{ subtotal() | mxn }}</strong> (sin IVA)
          </p>
        </section>
      </form>

      <div class="pan-action-bar">
        <button matButton type="button" (click)="back()">Cancelar</button>
        <button matButton="filled" type="submit" form="requisition-form" [disabled]="saving()">
          Guardar borrador
        </button>
      </div>
    } @else {
      <p class="pan-card">Las requisiciones son de la Planta y no tienes acceso a una.</p>
    }
  `,
  styleUrl: '../../logistics/pages/logistics-form.scss',
  styles: `
    .amount {
      display: block;
      padding-top: 16px;
      text-align: right;
    }

    .subtotal {
      margin: 12px 0 0;
      text-align: right;
    }

    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class RequisitionFormPage {
  /** Present when editing a draft (`/:id/editar`). */
  readonly id = input<string>();

  private readonly api = inject(RequisitionsApi);
  private readonly offersApi = inject(SupplierOffersApi);
  private readonly itemLookup = inject(ItemLookupApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  protected readonly plant = inject(LocationContextService).plant;
  protected readonly purchasedTypes = PURCHASED_TYPES;
  protected readonly controlError = controlError;
  protected readonly today = inDays(0);
  protected readonly saving = signal(false);
  protected readonly requisition = signal<Requisition | null>(null);

  protected readonly lines = new FormArray<RequisitionLine>([], minLinesValidator(1));
  protected readonly form = new FormGroup({
    neededBy: new FormControl<Date | null>(inDays(7), Validators.required),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    lines: this.lines,
  });
  protected readonly newLine = () => this.createLine();

  /** Offers of each line's item (preferred first). */
  private readonly offers = new Map<RequisitionLine, ReturnType<typeof signal<SupplierOffer[]>>>();
  /** Bumps on every edit of the lines, for the amounts. */
  private readonly edits = signal(0);
  protected readonly subtotal = computed(() => {
    this.edits();
    return this.lines.controls.reduce((sum, line) => sum + (this.amountOf(line) ?? 0), 0);
  });
  protected readonly missingNotes = computed(() => {
    this.edits();
    return repeatedWithoutNote(
      this.lines.getRawValue().map((l) => ({ itemId: l.item?.id ?? null, notes: l.notes })),
    );
  });

  constructor() {
    this.lines.valueChanges.subscribe(() => this.edits.update((n) => n + 1));
    effect(() => {
      const id = this.id();
      if (id) void this.load(id);
      else if (this.lines.length === 0) this.lines.push(this.createLine());
    });
  }

  protected offersOf(line: RequisitionLine): SupplierOffer[] {
    return this.offers.get(line)?.() ?? [];
  }

  /** The purchase unit of the chosen supplier, or the base unit. */
  protected unitOf(line: RequisitionLine): string | null {
    const offer = this.offerOf(line);
    return offer?.purchaseUomCode ?? line.controls.item.value?.baseUomCode ?? null;
  }

  protected amountOf(line: RequisitionLine): number | null {
    const offer = this.offerOf(line);
    const qty = line.controls.quantity.value;
    return offer && qty ? Math.round(offer.price * qty * 100) / 100 : null;
  }

  protected back(): void {
    const requisition = this.requisition();
    void this.router.navigate(
      requisition ? ['/compras/requisiciones', requisition.id] : ['/compras/requisiciones'],
    );
  }

  protected async save(): Promise<void> {
    const plant = this.plant();
    if (this.form.invalid || !plant || this.missingNotes().length > 0) {
      this.form.markAllAsTouched();
      return;
    }
    const { neededBy, notes } = this.form.getRawValue();
    const lines: Schemas['RequisitionLineRequest'][] = this.lines.getRawValue().map((l) => ({
      itemId: l.item!.id,
      quantity: l.quantity!,
      suggestedSupplierId: l.supplierId,
      notes: l.notes.trim() || null,
    }));
    const requisition = this.requisition();

    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        requisition
          ? this.api.update(requisition.id, {
              version: requisition.version,
              neededBy: toIsoDate(neededBy)!,
              notes: notes.trim() || null,
              lines,
            })
          : this.api.create({
              locationId: plant.id,
              neededBy: toIsoDate(neededBy)!,
              notes: notes.trim() || null,
              lines,
            }),
      );
      this.notifier.info(`Requisición ${saved.folio} guardada en borrador.`);
      await this.router.navigate(['/compras/requisiciones', saved.id]);
    } catch (error) {
      this.formErrors.apply(this.form, error);
    } finally {
      this.saving.set(false);
    }
  }

  private offerOf(line: RequisitionLine): SupplierOffer | null {
    const supplierId = line.controls.supplierId.value;
    return this.offersOf(line).find((o) => o.supplierId === supplierId) ?? null;
  }

  private async load(id: string): Promise<void> {
    const requisition = await firstValueFrom(this.api.get(id));
    const items = await Promise.all(
      requisition.lines.map((l) => firstValueFrom(this.itemLookup.byId(l.itemId))),
    );
    this.lines.clear();
    requisition.lines.forEach((line, i) => {
      const control = this.createLine();
      control.setValue({
        item: items[i],
        quantity: line.quantity,
        supplierId: line.suggestedSupplierId,
        notes: line.notes ?? '',
      });
      this.lines.push(control);
    });
    this.form.patchValue({
      neededBy: fromIsoDate(requisition.neededBy),
      notes: requisition.notes ?? '',
    });
    this.requisition.set(requisition);
    this.breadcrumbs.setCurrent(`Editar ${requisition.folio}`);
  }

  /** A line loads the offers of its item and takes the preferred supplier while none is chosen. */
  private createLine(): RequisitionLine {
    const line: RequisitionLine = new FormGroup({
      item: new FormControl<ItemOption | null>(null, Validators.required),
      quantity: new FormControl<number | null>(null, Validators.required),
      supplierId: new FormControl<string | null>(null),
      notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(200) }),
    });
    const offers = signal<SupplierOffer[]>([]);
    this.offers.set(line, offers);
    line.controls.item.valueChanges.subscribe(async (item) => {
      offers.set(item ? await firstValueFrom(this.offersOf$(item.id)) : []);
      const supplier = line.controls.supplierId;
      if (!offers().some((o) => o.supplierId === supplier.value))
        supplier.setValue(offers()[0]?.supplierId ?? null);
      this.edits.update((n) => n + 1);
    });
    return line;
  }

  private offersOf$(itemId: string) {
    return this.offersApi.of(itemId);
  }
}
