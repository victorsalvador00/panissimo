import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, map, Observable, startWith } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier.service';
import { ItemPicker } from '../../../shared/components/item-picker/item-picker';
import { LocationPicker } from '../../../shared/components/location-picker/location-picker';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import type { ItemOption } from '../../../shared/data-access/item-lookup.service';
import { fromDateOnly, toDateOnly } from '../../../shared/forms/date-range';
import { FormErrors } from '../../../shared/forms/form-errors.service';
import { ProductionOrderDto, ProductionOrdersApi } from '../data-access/production-orders.api';
import { RecipeListItem, RecipesApi } from '../data-access/recipes.api';
import { ExplosionList } from '../ui/explosion-list';
import { isProductionLocation, PRODUCTION_LOCATION_TYPES } from '../ui/production-order-lines';
import { canHaveRecipe } from '../ui/recipe-lines';

/**
 * Orden de producción en borrador (spec frontend §7.4): producto → receta activa → cantidad planeada,
 * con la explosión teórica y la disponibilidad en la ubicación (faltantes en rojo). Con `id` edita
 * el borrador: producto, ubicación y versión de receta ya no cambian (RN-10).
 */
@Component({
  selector: 'app-production-order-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    PageHeader,
    ItemPicker,
    LocationPicker,
    QtyInput,
    ExplosionList,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page sgo-stack">
      <app-page-header
        [title]="order() ? 'Editar orden ' + order()!.folio : 'Nueva orden de producción'"
        subtitle="Se guarda como borrador; el inventario se mueve al completarla."
        [crumbs]="[
          { label: 'Producción' },
          { label: 'Órdenes', url: '/produccion/ordenes' },
          { label: order()?.folio ?? 'Nueva' },
        ]"
      />

      @if (id() && !order()) {
        <p class="muted">Cargando…</p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="sgo-stack">
          <mat-card appearance="outlined">
            <mat-card-content class="header">
              @if (order(); as o) {
                <div class="fixed">
                  <span class="label">Ubicación</span>
                  <strong>{{ o.locationCode }}</strong>
                </div>
                <div class="fixed">
                  <span class="label">Producto</span>
                  <strong>{{ o.outputSku }} · {{ o.outputName }}</strong>
                  <a class="meta" [routerLink]="['/produccion/recetas', o.recipeId]">
                    Receta versión {{ o.recipeVersion }}
                  </a>
                </div>
              } @else {
                @if (fixedLocation(); as location) {
                  <div class="fixed">
                    <span class="label">Ubicación</span>
                    <strong>{{ location.code }} · {{ location.name }}</strong>
                  </div>
                } @else {
                  <app-location-picker
                    formControlName="locationId"
                    label="Ubicación"
                    [types]="productionTypes"
                  />
                }
                <div>
                  <app-item-picker
                    formControlName="output"
                    label="Producto"
                    [filter]="outputFilter"
                  />
                  @if (form.controls.output.value) {
                    @if (recipe.isLoading()) {
                      <p class="meta">Buscando la receta…</p>
                    } @else if (recipe.value(); as r) {
                      <a class="meta" [routerLink]="['/produccion/recetas', r.id]">
                        Receta activa: versión {{ r.recipeVersion }}
                      </a>
                    } @else {
                      <p class="sgo-field-error">
                        Este producto no tiene receta activa.
                        @if (canManageRecipes) {
                          <a routerLink="/produccion/recetas/nueva">Crear receta</a>
                        }
                      </p>
                    }
                  }
                </div>
              }
              <app-qty-input
                formControlName="plannedQty"
                label="Cantidad planeada"
                [unit]="uom()"
              />
              <mat-form-field appearance="outline">
                <mat-label>Fecha programada</mat-label>
                <input matInput [matDatepicker]="date" formControlName="scheduledDate" />
                <mat-datepicker-toggle matIconSuffix [for]="date" />
                <mat-datepicker #date />
                <mat-error>Elige la fecha.</mat-error>
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
              <h2>Explosión teórica</h2>
              @if (explosion.value(); as e) {
                @if (e.canProduce === false) {
                  <p class="notice notice-error" role="status">
                    No alcanza la existencia de algunos componentes. Puedes guardar el borrador,
                    pero no completar la orden hasta tener existencia.
                  </p>
                }
                <app-explosion-list [explosion]="e" [outputUom]="uom()" />
              } @else if (explosion.isLoading()) {
                <p class="muted">Calculando…</p>
              } @else {
                <p class="muted">
                  Elige el producto y la cantidad planeada para ver el consumo y la disponibilidad.
                </p>
              }
            </mat-card-content>
          </mat-card>

          <div class="sgo-row">
            <button mat-flat-button type="submit" [disabled]="saving() || !recipeId()">
              Guardar borrador
            </button>
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
    .muted,
    .meta {
      color: var(--mat-sys-on-surface-variant);
    }
    .label,
    .meta {
      font: var(--mat-sys-body-small);
    }
    p.meta {
      margin: 0 0 var(--sgo-space-3);
    }
    a.meta {
      display: inline-block;
      margin-bottom: var(--sgo-space-3);
    }
    .muted {
      margin: 0;
    }
  `,
})
export class ProductionOrderFormPage {
  private readonly api = inject(ProductionOrdersApi);
  private readonly recipes = inject(RecipesApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);
  private readonly activeLocation = inject(LocationContextService).activeLocation;

  /** Borrador a editar (ruta `:id/editar`); sin él, orden nueva. */
  readonly id = input<string>();

  protected readonly canManageRecipes = inject(AuthService).can('production.recipes.manage');
  protected readonly productionTypes = [...PRODUCTION_LOCATION_TYPES];
  protected readonly outputFilter = canHaveRecipe;
  protected readonly saving = signal(false);
  protected readonly order = signal<ProductionOrderDto | null>(null);

  /** La ubicación activa, si es de producción (RN-14); si no, se elige entre las del usuario. */
  protected readonly fixedLocation = computed(() => {
    const location = this.activeLocation();
    return location && isProductionLocation(location.type) ? location : null;
  });

  protected readonly form = new FormGroup({
    locationId: new FormControl<string | null>(
      this.fixedLocation()?.id ?? null,
      Validators.required,
    ),
    output: new FormControl<ItemOption | null>(null, Validators.required),
    plannedQty: new FormControl<number | null>(null, Validators.required),
    scheduledDate: new FormControl<Date | null>(new Date(), Validators.required),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
  });

  private readonly output = toSignal(
    this.form.controls.output.valueChanges.pipe(startWith(this.form.controls.output.value)),
    { initialValue: null },
  );
  private readonly locationId = toSignal(
    this.form.controls.locationId.valueChanges.pipe(startWith(this.form.controls.locationId.value)),
    { initialValue: null },
  );
  /** La explosión se recalcula al dejar de escribir. */
  private readonly plannedQty = toSignal(
    this.form.controls.plannedQty.valueChanges.pipe(debounceTime(300)),
    { initialValue: null },
  );

  protected readonly uom = computed(
    () => this.order()?.outputUomCode ?? this.output()?.baseUomCode ?? null,
  );

  /** Receta activa del producto elegido (orden nueva). */
  protected readonly recipe = rxResource({
    params: () => (this.id() ? undefined : this.output()?.id),
    stream: ({ params }): Observable<RecipeListItem | null> =>
      this.recipes
        .list({ page: 1, pageSize: 1 }, { outputItemId: params })
        .pipe(map((page) => page.items[0] ?? null)),
  });

  protected readonly recipeId = computed(
    () => this.order()?.recipeId ?? this.recipe.value()?.id ?? null,
  );

  protected readonly explosion = rxResource({
    params: () => {
      const recipeId = this.recipeId();
      const qty = this.plannedQty();
      const valid = this.form.controls.plannedQty.valid;
      return recipeId && qty && qty > 0 && valid
        ? { recipeId, qty, locationId: this.order()?.locationId ?? this.locationId() }
        : undefined;
    },
    stream: ({ params }) => this.recipes.explode(params.recipeId, params.qty, params.locationId),
  });

  protected readonly backLink = computed(() => {
    const id = this.order()?.id;
    return id ? ['/produccion/ordenes', id] : ['/produccion/ordenes'];
  });

  constructor() {
    // Cambió la ubicación activa (orden nueva): si es de producción, se usa esa.
    effect(() => {
      const location = this.fixedLocation();
      untracked(() => {
        if (location && !this.order()) {
          this.form.controls.locationId.setValue(location.id);
        }
      });
    });
    effect(() => {
      const id = this.id();
      untracked(() => id && this.load(id));
    });
  }

  private load(id: string): void {
    this.api.get(id).subscribe((order) => {
      this.form.patchValue({
        locationId: order.locationId,
        plannedQty: order.plannedQty,
        scheduledDate: fromDateOnly(order.scheduledDate),
        notes: order.notes ?? '',
      });
      // Producto y ubicación quedan fijos: no se validan.
      this.form.controls.output.disable();
      this.form.controls.locationId.disable();
      this.order.set(order);
    });
  }

  protected submit(): void {
    if (this.form.invalid || this.saving() || !this.recipeId()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const common = {
      plannedQty: value.plannedQty!,
      scheduledDate: toDateOnly(value.scheduledDate)!,
      notes: value.notes.trim() || null,
    };
    const existing = this.order();
    this.saving.set(true);
    const request$ = existing
      ? this.api.update(existing.id, { version: existing.version, ...common })
      : this.api.create({
          locationId: value.locationId!,
          outputItemId: value.output!.id,
          ...common,
        });
    request$.subscribe({
      next: (order) => {
        this.saving.set(false);
        this.notifier.success(`Orden ${order.folio} guardada como borrador.`);
        void this.router.navigate(['/produccion/ordenes', order.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.formErrors.handle(error, this.form, {
          reload: () => existing && this.load(existing.id),
        });
      },
    });
  }
}
