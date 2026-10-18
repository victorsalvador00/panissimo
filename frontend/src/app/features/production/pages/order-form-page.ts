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
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, firstValueFrom, map, of, startWith } from 'rxjs';
import type { ApiEnum } from '../../../core/api/api';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { ItemOption, ItemPicker } from '../../../shared/components/item-picker/item-picker';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { ItemLookupApi } from '../../../shared/data-access/item-lookup';
import { controlError } from '../../../shared/forms/control-error';
import { fromIsoDate, toIsoDate } from '../../../shared/forms/dates';
import { FormErrors } from '../../../shared/forms/form-errors';
import { ENUM_LABELS } from '../../../shared/pipes/labels';
import { MxnPipe, QtyPipe } from '../../../shared/pipes/pipes';
import { AreasApi } from '../../catalog/data-access/catalog-api';
import { ProductionOrder, ProductionOrdersApi, RecipesApi } from '../data-access/production-api';
import { OUTPUT_TYPES } from '../ui/recipe-rules';

type Shift = ApiEnum<'Shift'>;

/**
 * /produccion/ordenes/nueva and /:id/editar (frontend §7.4, RN-14, RN-60): plant, product with its active recipe (or a
 * warning with the link to create it), quantity (whole for `pza`), date, area (the product's by default), shift and
 * notes. The explosion with availability (RN-12) is recalculated when typing stops. Saves a draft.
 */
@Component({
  selector: 'app-order-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    PageHeader,
    ItemPicker,
    QtyInput,
    QtyPipe,
    MxnPipe,
  ],
  templateUrl: './order-form-page.html',
  styleUrl: './order-form-page.scss',
})
export class OrderFormPage {
  /** Present when editing a draft (`/:id/editar`). */
  readonly id = input<string>();

  private readonly api = inject(ProductionOrdersApi);
  private readonly recipesApi = inject(RecipesApi);
  private readonly areasApi = inject(AreasApi);
  private readonly itemLookup = inject(ItemLookupApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  private readonly context = inject(LocationContextService);
  protected readonly canManageRecipes = inject(AuthService).can('production.recipes.manage');
  protected readonly outputTypes = OUTPUT_TYPES;
  protected readonly controlError = controlError;
  protected readonly shifts = Object.entries(ENUM_LABELS.Shift).map(([value, label]) => ({
    value: value as Shift,
    label,
  }));
  protected readonly plants = computed(() =>
    this.context.locations().filter((l) => l.type === 'Plant'),
  );
  protected readonly saving = signal(false);
  protected readonly order = signal<ProductionOrder | null>(null);

  protected readonly form = new FormGroup({
    locationId: new FormControl<string | null>(null, Validators.required),
    output: new FormControl<ItemOption | null>(null, Validators.required),
    plannedQty: new FormControl<number | null>(null, Validators.required),
    scheduledDate: new FormControl<Date | null>(new Date(), Validators.required),
    productionAreaId: new FormControl<string | null>(null),
    shift: new FormControl<Shift | null>(null),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
  });

  private readonly output = toSignal(this.form.controls.output.valueChanges, {
    initialValue: null,
  });
  /** Quantity and plant settle 400 ms after typing stops. */
  private readonly explosionInput = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      debounceTime(400),
      map(() => ({
        qty: this.form.controls.plannedQty.valid ? this.form.controls.plannedQty.value : null,
        locationId: this.form.controls.locationId.value,
      })),
    ),
    { initialValue: { qty: null, locationId: null } },
  );

  protected readonly areas = rxResource({
    stream: () => this.areasApi.list().pipe(map((page) => page.items.filter((a) => a.isActive))),
    defaultValue: [],
  });
  /** The active recipe of the chosen product (RN-14). */
  protected readonly recipe = rxResource({
    params: () => this.output()?.id,
    stream: ({ params }) =>
      this.recipesApi
        .list({ page: 1, pageSize: 1 }, { outputItemId: params })
        .pipe(map((page) => page.items.find((r) => r.isActive) ?? null)),
  });
  protected readonly noRecipe = computed(
    () => !!this.output() && this.recipe.hasValue() && this.recipe.value() === null,
  );
  protected readonly explosion = rxResource({
    params: () => {
      const recipe = this.recipe.hasValue() ? this.recipe.value() : null;
      const { qty, locationId } = this.explosionInput();
      return recipe && qty && qty > 0 ? { recipeId: recipe.id, qty, locationId } : undefined;
    },
    stream: ({ params }) =>
      params ? this.recipesApi.explode(params.recipeId, params.qty, params.locationId) : of(null),
  });

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) void this.load(id);
    });
    // The plant: the active location when it is one, otherwise the user's plant.
    effect(() => {
      const control = this.form.controls.locationId;
      if (control.value || this.id()) return;
      const active = this.context.active();
      control.setValue(active?.type === 'Plant' ? active.id : (this.plants()[0]?.id ?? null));
    });
    // The area defaults to the product's while the user has not chosen one.
    this.form.controls.output.valueChanges.subscribe((item) => {
      const area = this.form.controls.productionAreaId;
      if (item?.productionAreaId && !area.dirty) area.setValue(item.productionAreaId);
    });
  }

  protected back(): void {
    const order = this.order();
    void this.router.navigate(order ? ['/produccion/ordenes', order.id] : ['/produccion/ordenes']);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid || this.noRecipe()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const order = this.order();
    const fields = {
      outputItemId: v.output!.id,
      plannedQty: v.plannedQty!,
      scheduledDate: toIsoDate(v.scheduledDate)!,
      productionAreaId: v.productionAreaId,
      shift: v.shift,
      notes: v.notes.trim() || null,
    };

    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        order
          ? this.api.update(order.id, { version: order.version, ...fields })
          : this.api.create({ locationId: v.locationId!, ...fields }),
      );
      this.notifier.info(`Orden ${saved.folio} guardada en borrador.`);
      await this.router.navigate(['/produccion/ordenes', saved.id]);
    } catch (error) {
      this.formErrors.apply(this.form, error);
    } finally {
      this.saving.set(false);
    }
  }

  private async load(id: string): Promise<void> {
    const order = await firstValueFrom(this.api.get(id));
    const output = await firstValueFrom(this.itemLookup.byId(order.outputItemId));
    this.form.patchValue({
      locationId: order.locationId,
      output,
      plannedQty: order.plannedQty,
      scheduledDate: fromIsoDate(order.scheduledDate),
      productionAreaId: order.productionAreaId,
      shift: order.shift,
      notes: order.notes ?? '',
    });
    // The plant of an order does not change.
    this.form.controls.locationId.disable();
    this.order.set(order);
    this.breadcrumbs.setCurrent(`Editar ${order.folio}`);
  }
}
