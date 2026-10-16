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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier.service';
import { ItemPicker } from '../../../shared/components/item-picker/item-picker';
import { LineColumnDef, LinesEditor } from '../../../shared/components/lines-editor/lines-editor';
import {
  minLinesValidator,
  uniqueLinesValidator,
} from '../../../shared/components/lines-editor/lines-validators';
import { LocationPicker } from '../../../shared/components/location-picker/location-picker';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { ItemLookupService } from '../../../shared/data-access/item-lookup.service';
import { fromDateOnly, toDateOnly } from '../../../shared/forms/date-range';
import { FormErrors } from '../../../shared/forms/form-errors.service';
import { formatMxn, MxnPipe } from '../../../shared/pipes/mxn.pipe';
import { RequisitionDto, RequisitionsApi } from '../data-access/requisitions.api';
import { ItemSupplierOffers, SupplierOffer, SuppliersApi } from '../data-access/suppliers.api';
import {
  createRequisitionLine,
  defaultSupplierId,
  estimatedTotal,
  isPurchaseLocation,
  linePrice,
  PURCHASE_LOCATION_TYPES,
  RequisitionLineForm,
  RequisitionLineValue,
  toRequisitionLines,
} from '../ui/requisition-lines';

function daysFromToday(days: number): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
}

/**
 * Requisición en borrador (`/compras/requisiciones/nueva`, `/:id/editar`): ubicación de compra,
 * fecha requerida y líneas en unidad de compra con el proveedor sugerido (el preferido por omisión)
 * y su precio estimado. Se guarda como borrador o se guarda y envía a aprobación.
 */
@Component({
  selector: 'app-requisition-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    PageHeader,
    LocationPicker,
    ItemPicker,
    QtyInput,
    LinesEditor,
    LineColumnDef,
    MxnPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page sgo-stack">
      <app-page-header
        [title]="requisition() ? 'Editar requisición ' + requisition()!.folio : 'Nueva requisición'"
        subtitle="Cantidades en la unidad de compra de cada artículo; precios sin IVA."
        [crumbs]="[
          { label: 'Compras' },
          { label: 'Requisiciones', url: '/compras/requisiciones' },
          { label: requisition()?.folio ?? 'Nueva' },
        ]"
      />

      @if (id() && !requisition()) {
        <p class="muted">Cargando…</p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="save(false)" novalidate class="sgo-stack">
          <mat-card appearance="outlined">
            <mat-card-content class="header">
              @if (requisition(); as r) {
                <div class="fixed">
                  <span class="label">Ubicación</span>
                  <strong>{{ r.location.code }} · {{ r.location.name }}</strong>
                </div>
              } @else if (fixedLocation(); as location) {
                <div class="fixed">
                  <span class="label">Ubicación</span>
                  <strong>{{ location.code }} · {{ location.name }}</strong>
                </div>
              } @else {
                <app-location-picker
                  formControlName="locationId"
                  label="Ubicación que compra"
                  [types]="purchaseTypes"
                />
              }
              <mat-form-field appearance="outline">
                <mat-label>Se requiere para</mat-label>
                <input
                  matInput
                  [matDatepicker]="date"
                  [min]="today"
                  formControlName="neededBy"
                  required
                />
                <mat-datepicker-toggle matIconSuffix [for]="date" />
                <mat-datepicker #date />
                @if (form.controls.neededBy.hasError('matDatepickerMin')) {
                  <mat-error>No puede ser una fecha pasada.</mat-error>
                } @else if (form.controls.neededBy.hasError('server')) {
                  <mat-error>{{ form.controls.neededBy.getError('server') }}</mat-error>
                } @else {
                  <mat-error>Elige la fecha.</mat-error>
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
              <app-lines-editor
                [lines]="form.controls.lines"
                [createLine]="newLine"
                [minLines]="1"
                addLabel="Agregar artículo"
                totalLabel="Total estimado sin IVA"
                [total]="total"
              >
                <ng-template
                  appLineColumn="Artículo"
                  [appLineColumnOf]="form.controls.lines"
                  let-line
                >
                  <app-item-picker [formControl]="line.controls.item" subscriptSizing="dynamic" />
                </ng-template>
                <ng-template
                  appLineColumn="Cantidad"
                  width="170px"
                  [appLineColumnOf]="form.controls.lines"
                  let-line
                >
                  <app-qty-input
                    [formControl]="line.controls.quantity"
                    label="Cantidad"
                    [unit]="offersOf(line)?.purchaseUomCode"
                    subscriptSizing="dynamic"
                  />
                </ng-template>
                <ng-template
                  appLineColumn="Proveedor sugerido"
                  width="280px"
                  [appLineColumnOf]="form.controls.lines"
                  let-line
                >
                  @if (offersOf(line); as offers) {
                    @if (offers.offers.length) {
                      <mat-form-field appearance="outline" subscriptSizing="dynamic">
                        <mat-label>Proveedor</mat-label>
                        <mat-select [formControl]="line.controls.supplierId">
                          <mat-select-trigger>
                            @if (selectedOffer(line); as offer) {
                              {{ offer.supplierName }}{{ offer.isPreferred ? ' (preferido)' : '' }}
                            }
                          </mat-select-trigger>
                          @for (offer of offers.offers; track offer.supplierId) {
                            <mat-option [value]="offer.supplierId">
                              {{ offer.supplierName
                              }}{{ offer.isPreferred ? ' (preferido)' : '' }} ·
                              {{ offer.price | mxn: '1.2-4' }} / {{ offers.purchaseUomCode }}
                            </mat-option>
                          }
                        </mat-select>
                        @if (selectedOffer(line); as offer) {
                          <mat-hint>
                            {{ offer.price | mxn: '1.2-4' }} / {{ offers.purchaseUomCode }} ·
                            entrega {{ offer.leadTimeDays }} días
                          </mat-hint>
                        } @else {
                          <mat-hint>Elige el proveedor antes de enviar.</mat-hint>
                        }
                      </mat-form-field>
                    } @else {
                      <p class="sgo-field-error none">
                        Ningún proveedor activo vende este artículo.
                      </p>
                    }
                  } @else if (line.controls.item.value) {
                    <span class="none muted">Buscando proveedores…</span>
                  }
                </ng-template>
                <ng-template
                  appLineColumn="Importe"
                  width="130px"
                  align="end"
                  [appLineColumnOf]="form.controls.lines"
                  let-line
                >
                  <span class="amount">{{ amount(line) }}</span>
                </ng-template>
              </app-lines-editor>
              @if (missingSupplier()) {
                <p class="sgo-field-error" role="alert">
                  Para enviar, todas las líneas necesitan proveedor sugerido.
                </p>
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
    mat-form-field {
      width: 100%;
    }
    .none {
      display: inline-block;
      margin: 0;
      padding-top: var(--sgo-space-4);
    }
    .amount {
      display: inline-block;
      padding-top: var(--sgo-space-4);
      font-variant-numeric: tabular-nums;
    }
    .actions {
      flex-wrap: wrap;
    }
  `,
})
export class RequisitionFormPage {
  private readonly api = inject(RequisitionsApi);
  private readonly suppliers = inject(SuppliersApi);
  private readonly itemLookup = inject(ItemLookupService);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);
  private readonly locale = inject(LOCALE_ID);
  private readonly activeLocation = inject(LocationContextService).activeLocation;

  /** Borrador a editar (ruta `:id/editar`); sin él, requisición nueva. */
  readonly id = input<string>();

  protected readonly purchaseTypes = [...PURCHASE_LOCATION_TYPES];
  protected readonly today = daysFromToday(0);
  protected readonly saving = signal(false);
  protected readonly requisition = signal<RequisitionDto | null>(null);
  protected readonly missingSupplier = signal(false);
  /** Ofertas de proveedores por artículo (se piden una vez por artículo). */
  private readonly offers = signal<ReadonlyMap<string, ItemSupplierOffers>>(new Map());
  private readonly requested = new Set<string>();

  /** La ubicación activa, si compra; si no, se elige entre las del usuario que compran. */
  protected readonly fixedLocation = computed(() => {
    const location = this.activeLocation();
    return location && isPurchaseLocation(location.type) ? location : null;
  });

  protected readonly form = new FormGroup({
    locationId: new FormControl<string | null>(
      this.fixedLocation()?.id ?? null,
      Validators.required,
    ),
    neededBy: new FormControl<Date | null>(daysFromToday(7), Validators.required),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    lines: new FormArray<RequisitionLineForm>([], {
      validators: [minLinesValidator(1), uniqueLinesValidator('item')],
    }),
  });

  protected readonly newLine = () => createRequisitionLine();
  protected readonly total = (lines: RequisitionLineValue[]) =>
    estimatedTotal(lines, this.offers());

  protected readonly backLink = computed(() => {
    const id = this.requisition()?.id;
    return id ? ['/compras/requisiciones', id] : ['/compras/requisiciones'];
  });

  constructor() {
    effect(() => {
      const location = this.fixedLocation();
      untracked(() => {
        if (location && !this.requisition()) {
          this.form.controls.locationId.setValue(location.id);
        }
      });
    });
    // Al elegir un artículo: sus proveedores y, si no hay uno elegido, el preferido.
    this.form.controls.lines.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.fetchOffers();
      this.applyDefaultSuppliers();
      this.missingSupplier.set(false);
    });
    effect(() => {
      const id = this.id();
      untracked(() =>
        id ? this.load(id) : this.form.controls.lines.push(createRequisitionLine()),
      );
    });
  }

  protected offersOf(line: RequisitionLineForm): ItemSupplierOffers | undefined {
    const item = line.controls.item.value;
    return item ? this.offers().get(item.id) : undefined;
  }

  protected selectedOffer(line: RequisitionLineForm): SupplierOffer | undefined {
    const supplierId = line.controls.supplierId.value;
    return this.offersOf(line)?.offers.find((offer) => offer.supplierId === supplierId);
  }

  protected amount(line: RequisitionLineForm): string {
    const value = line.getRawValue();
    const price = linePrice(value, this.offersOf(line));
    return price === null || !value.quantity ? '—' : formatMxn(price * value.quantity, this.locale);
  }

  private fetchOffers(): void {
    const ids = this.form.controls.lines.controls
      .map((line) => line.controls.item.value?.id)
      .filter((id): id is string => !!id && !this.requested.has(id));
    for (const id of new Set(ids)) {
      this.requested.add(id);
      this.suppliers.offers(id).subscribe({
        next: (offers) => {
          this.offers.update((current) => new Map(current).set(id, offers));
          this.applyDefaultSuppliers();
        },
        error: () => this.requested.delete(id),
      });
    }
  }

  private applyDefaultSuppliers(): void {
    for (const line of this.form.controls.lines.controls) {
      const { item, supplierId } = line.getRawValue();
      const offers = item ? this.offers().get(item.id) : undefined;
      const wanted = item ? defaultSupplierId(supplierId, offers) : null;
      if (wanted !== supplierId) {
        line.controls.supplierId.setValue(wanted);
      }
    }
  }

  private load(id: string): void {
    this.api
      .get(id)
      .pipe(
        switchMap((requisition) => {
          if (requisition.status !== 'Draft') {
            void this.router.navigate(['/compras/requisiciones', id]);
            return of(null);
          }
          const itemIds = [...new Set(requisition.lines.map((line) => line.itemId))];
          return forkJoin(itemIds.map((itemId) => this.itemLookup.byId(itemId))).pipe(
            map((items) => ({
              requisition,
              items: new Map(items.filter((i) => !!i).map((i) => [i.id, i])),
            })),
          );
        }),
      )
      .subscribe((loaded) => {
        if (!loaded) {
          return;
        }
        const { requisition, items } = loaded;
        this.form.patchValue({
          locationId: requisition.location.id,
          neededBy: fromDateOnly(requisition.neededBy),
          notes: requisition.notes ?? '',
        });
        this.form.controls.locationId.disable();
        this.form.controls.lines.clear();
        requisition.lines.forEach((line) =>
          this.form.controls.lines.push(
            createRequisitionLine({
              item: items.get(line.itemId) ?? null,
              quantity: line.quantity,
              supplierId: line.suggestedSupplier?.id ?? null,
            }),
          ),
        );
        this.requisition.set(requisition);
      });
  }

  protected save(submit: boolean): void {
    const lines = this.form.controls.lines.getRawValue();
    const missingSupplier = submit && lines.some((line) => !line.supplierId);
    this.missingSupplier.set(missingSupplier);
    if (this.form.invalid || missingSupplier || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const common = {
      neededBy: toDateOnly(value.neededBy)!,
      notes: value.notes.trim() || null,
      lines: toRequisitionLines(lines),
    };
    const existing = this.requisition();
    this.saving.set(true);
    const saved$: Observable<RequisitionDto> = existing
      ? this.api.update(existing.id, { version: existing.version, ...common })
      : this.api.create({ locationId: value.locationId!, ...common });

    saved$.subscribe({
      next: (saved) => {
        if (!submit) {
          this.done(saved, `Requisición ${saved.folio} guardada como borrador.`);
          return;
        }
        this.api.submit(saved.id, saved.version).subscribe({
          next: (sent) => this.done(sent, `Requisición ${sent.folio} enviada a aprobación.`),
          // Quedó guardada como borrador: el detalle muestra por qué no se envió.
          error: () => this.done(saved, `Requisición ${saved.folio} guardada como borrador.`),
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

  private done(requisition: RequisitionDto, message: string): void {
    this.saving.set(false);
    this.notifier.success(message);
    void this.router.navigate(['/compras/requisiciones', requisition.id]);
  }
}
