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
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, map, Observable, of, startWith, switchMap } from 'rxjs';
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
import { ItemLookupService, ItemOption } from '../../../shared/data-access/item-lookup.service';
import { LocationLookupService } from '../../../shared/data-access/location-lookup.service';
import { fromDateOnly, toDateOnly } from '../../../shared/forms/date-range';
import { FormErrors } from '../../../shared/forms/form-errors.service';
import { formatQty } from '../../../shared/pipes/qty.pipe';
import {
  BranchOrderDto,
  BranchOrdersApi,
  BranchOrderSuggestion,
} from '../data-access/branch-orders.api';
import {
  createOrderLine,
  missingSuggestions,
  OrderLineForm,
  supplyingOptions,
  toOrderLines,
} from '../ui/branch-order-lines';

function daysFromToday(days: number): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
}

/**
 * Pedido de sucursal en borrador (`/logistica/pedidos/nuevo`, `/:id/editar`): sucursal, origen,
 * fecha requerida y artículos en unidad base. "Sugerir por mín/máx" agrega lo que está en o por
 * debajo del mínimo (RN-20). Se guarda como borrador o se guarda y envía.
 */
@Component({
  selector: 'app-branch-order-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    PageHeader,
    LocationPicker,
    ItemPicker,
    QtyInput,
    LinesEditor,
    LineColumnDef,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page sgo-stack">
      <app-page-header
        [title]="order() ? 'Editar pedido ' + order()!.folio : 'Nuevo pedido'"
        subtitle="Cantidades en la unidad base de cada artículo."
        [crumbs]="[
          { label: 'Logística' },
          { label: 'Pedidos', url: '/logistica/pedidos' },
          { label: order()?.folio ?? 'Nuevo' },
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
                  <span class="label">Sucursal</span>
                  <strong>{{ o.requestingLocation.code }} · {{ o.requestingLocation.name }}</strong>
                </div>
              } @else if (fixedBranch(); as branch) {
                <div class="fixed">
                  <span class="label">Sucursal</span>
                  <strong>{{ branch.code }} · {{ branch.name }}</strong>
                </div>
              } @else {
                <app-location-picker
                  formControlName="requestingLocationId"
                  label="Sucursal que pide"
                  [types]="['Branch']"
                />
              }
              <mat-form-field appearance="outline">
                <mat-label>Pedir a</mat-label>
                <mat-select formControlName="supplyingLocationId">
                  @for (location of supplying(); track location.id) {
                    <mat-option [value]="location.id">
                      {{ location.code }} · {{ location.name }}
                    </mat-option>
                  }
                </mat-select>
                <mat-error>Elige a quién se pide.</mat-error>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Se requiere para</mat-label>
                <input
                  matInput
                  [matDatepicker]="date"
                  [min]="today"
                  formControlName="requiredDate"
                  required
                />
                <mat-datepicker-toggle matIconSuffix [for]="date" />
                <mat-datepicker #date />
                @if (form.controls.requiredDate.hasError('matDatepickerMin')) {
                  <mat-error>No puede ser una fecha pasada.</mat-error>
                } @else if (form.controls.requiredDate.hasError('server')) {
                  <mat-error>{{ form.controls.requiredDate.getError('server') }}</mat-error>
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
              <div class="lines-header">
                <h2>Artículos</h2>
                <button
                  mat-stroked-button
                  type="button"
                  [disabled]="!requestingId() || suggesting()"
                  (click)="suggest()"
                >
                  <mat-icon>auto_awesome</mat-icon>
                  Sugerir por mín/máx
                </button>
              </div>
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
                  <app-item-picker
                    [formControl]="line.controls.item"
                    [showStock]="true"
                    [stockLocationId]="requestingId()"
                    subscriptSizing="dynamic"
                  />
                </ng-template>
                <ng-template
                  appLineColumn="Cantidad"
                  width="240px"
                  [appLineColumnOf]="form.controls.lines"
                  let-line
                >
                  <app-qty-input
                    [formControl]="line.controls.quantity"
                    label="Cantidad"
                    [unit]="line.controls.item.value?.baseUomCode"
                    [hint]="hintOf(line)"
                    subscriptSizing="dynamic"
                  />
                </ng-template>
              </app-lines-editor>
            </mat-card-content>
          </mat-card>

          <div class="sgo-action-bar">
            <div class="sgo-row">
              <button mat-flat-button type="button" [disabled]="saving()" (click)="save(true)">
                Guardar y enviar
              </button>
              <button mat-stroked-button type="submit" [disabled]="saving()">
                Guardar borrador
              </button>
              <a mat-button [routerLink]="backLink()">Cancelar</a>
            </div>
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    h2 {
      margin: 0;
      font: var(--mat-sys-title-medium);
    }
    .lines-header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: var(--sgo-space-2);
      margin-bottom: var(--sgo-space-3);
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
  `,
})
export class BranchOrderFormPage {
  private readonly api = inject(BranchOrdersApi);
  private readonly itemLookup = inject(ItemLookupService);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);
  private readonly locale = inject(LOCALE_ID);
  private readonly activeLocation = inject(LocationContextService).activeLocation;
  private readonly locationLookup = inject(LocationLookupService);

  /** Borrador a editar (ruta `:id/editar`); sin él, pedido nuevo. */
  readonly id = input<string>();

  protected readonly today = daysFromToday(0);
  protected readonly saving = signal(false);
  protected readonly suggesting = signal(false);
  protected readonly order = signal<BranchOrderDto | null>(null);
  /** Datos del sugerido por artículo, para mostrar mín/máx y existencia bajo la cantidad. */
  private readonly suggestions = signal<ReadonlyMap<string, BranchOrderSuggestion>>(new Map());

  /** La ubicación activa, si es sucursal; si no, se elige entre las sucursales del usuario. */
  protected readonly fixedBranch = computed(() => {
    const location = this.activeLocation();
    return location?.type === 'Branch' ? location : null;
  });

  private readonly locations = rxResource({ stream: () => this.locationLookup.all() });
  protected readonly supplying = computed(() => supplyingOptions(this.locations.value() ?? []));

  protected readonly form = new FormGroup({
    requestingLocationId: new FormControl<string | null>(
      this.fixedBranch()?.id ?? null,
      Validators.required,
    ),
    supplyingLocationId: new FormControl<string | null>(null, Validators.required),
    requiredDate: new FormControl<Date | null>(daysFromToday(1), Validators.required),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    lines: new FormArray<OrderLineForm>([], {
      validators: [minLinesValidator(1), uniqueLinesValidator('item')],
    }),
  });

  protected readonly requestingId = toSignal(
    this.form.controls.requestingLocationId.valueChanges.pipe(
      startWith(this.form.controls.requestingLocationId.value),
    ),
    { initialValue: this.form.controls.requestingLocationId.value },
  );

  protected readonly newLine = () => createOrderLine();
  protected readonly backLink = computed(() => {
    const id = this.order()?.id;
    return id ? ['/logistica/pedidos', id] : ['/logistica/pedidos'];
  });

  constructor() {
    effect(() => {
      const branch = this.fixedBranch();
      untracked(() => {
        if (branch && !this.order()) {
          this.form.controls.requestingLocationId.setValue(branch.id);
        }
      });
    });
    // Si solo hay un origen posible (lo normal: el comisariato), se elige solo.
    effect(() => {
      const options = this.supplying();
      untracked(() => {
        const control = this.form.controls.supplyingLocationId;
        if (!control.value && options.length === 1) {
          control.setValue(options[0].id);
        }
      });
    });
    effect(() => {
      const id = this.id();
      untracked(() => (id ? this.load(id) : this.form.controls.lines.push(createOrderLine())));
    });
  }

  protected hintOf(line: OrderLineForm): string {
    const item = line.controls.item.value;
    const s = item ? this.suggestions().get(item.id) : undefined;
    if (!s) {
      return '';
    }
    const qty = (value: number) => formatQty(value, this.locale);
    let hint = `Mín ${qty(s.minQty)} · máx ${qty(s.maxQty)} · hay ${qty(s.onHand)}`;
    if (s.inTransit) {
      hint += ` · en camino ${qty(s.inTransit)}`;
    }
    if (s.pending) {
      hint += ` · pedido ${qty(s.pending)}`;
    }
    return hint;
  }

  /** Agrega los artículos sugeridos que faltan; las líneas ya capturadas no se tocan. */
  protected suggest(): void {
    const locationId = this.requestingId();
    if (!locationId || this.suggesting()) {
      return;
    }
    this.suggesting.set(true);
    this.api
      .suggestion(locationId)
      .pipe(
        switchMap((suggestions) => {
          this.suggestions.set(new Map(suggestions.map((s) => [s.itemId, s])));
          const missing = missingSuggestions(this.form.controls.lines.getRawValue(), suggestions);
          if (!missing.length) {
            return of({
              suggestions,
              added: [] as { s: BranchOrderSuggestion; item: ItemOption }[],
            });
          }
          return forkJoin(missing.map((s) => this.itemLookup.byId(s.itemId))).pipe(
            map((items) => ({
              suggestions,
              added: missing
                .map((s, i) => ({ s, item: items[i] }))
                .filter((x): x is { s: BranchOrderSuggestion; item: ItemOption } => !!x.item),
            })),
          );
        }),
      )
      .subscribe({
        next: ({ suggestions, added }) => {
          this.suggesting.set(false);
          const lines = this.form.controls.lines;
          // Lo sugerido ocupa primero las líneas vacías; el resto se agrega al final.
          const empty = lines.controls.filter((line) => !line.controls.item.value);
          added.forEach(({ s, item }, i) => {
            const value = { item, quantity: s.suggestedQty };
            if (i < empty.length) {
              empty[i].setValue(value);
            } else {
              lines.push(createOrderLine(value));
            }
          });
          if (!suggestions.length) {
            this.notifier.success(
              'Ningún artículo está en o por debajo de su mínimo (o la sucursal no tiene mín/máx).',
            );
          } else if (!added.length) {
            this.notifier.success('Los artículos sugeridos ya están en el pedido.');
          } else {
            this.notifier.success(
              added.length === 1
                ? 'Se agregó 1 artículo sugerido.'
                : `Se agregaron ${added.length} artículos sugeridos.`,
            );
          }
        },
        error: () => this.suggesting.set(false),
      });
  }

  private load(id: string): void {
    this.api
      .get(id)
      .pipe(
        switchMap((order) => {
          if (order.status !== 'Draft') {
            void this.router.navigate(['/logistica/pedidos', id]);
            return of(null);
          }
          const itemIds = [...new Set(order.lines.map((line) => line.itemId))];
          return forkJoin(itemIds.map((itemId) => this.itemLookup.byId(itemId))).pipe(
            map((items) => ({
              order,
              items: new Map(items.filter((i) => !!i).map((i) => [i.id, i])),
            })),
          );
        }),
      )
      .subscribe((loaded) => {
        if (!loaded) {
          return;
        }
        const { order, items } = loaded;
        this.form.patchValue({
          requestingLocationId: order.requestingLocation.id,
          supplyingLocationId: order.supplyingLocation.id,
          requiredDate: fromDateOnly(order.requiredDate),
          notes: order.notes ?? '',
        });
        this.form.controls.requestingLocationId.disable();
        this.form.controls.lines.clear();
        order.lines.forEach((line) =>
          this.form.controls.lines.push(
            createOrderLine({ item: items.get(line.itemId) ?? null, quantity: line.requestedQty }),
          ),
        );
        this.order.set(order);
      });
  }

  protected save(submit: boolean): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const common = {
      supplyingLocationId: value.supplyingLocationId!,
      requiredDate: toDateOnly(value.requiredDate)!,
      notes: value.notes.trim() || null,
      lines: toOrderLines(value.lines),
    };
    const existing = this.order();
    this.saving.set(true);
    const saved$: Observable<BranchOrderDto> = existing
      ? this.api.update(existing.id, { version: existing.version, ...common })
      : this.api.create({ requestingLocationId: value.requestingLocationId!, ...common });

    saved$.subscribe({
      next: (saved) => {
        if (!submit) {
          this.done(saved, `Pedido ${saved.folio} guardado como borrador.`);
          return;
        }
        this.api.submit(saved.id, saved.version).subscribe({
          next: (sent) =>
            this.done(sent, `Pedido ${sent.folio} enviado a ${sent.supplyingLocation.code}.`),
          // Quedó guardado como borrador: el detalle permite reintentar el envío.
          error: () => this.done(saved, `Pedido ${saved.folio} guardado como borrador.`),
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

  private done(order: BranchOrderDto, message: string): void {
    this.saving.set(false);
    this.notifier.success(message);
    void this.router.navigate(['/logistica/pedidos', order.id]);
  }
}
