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
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';
import { map, startWith } from 'rxjs';
import { Notifier } from '../../../core/http/notifier.service';
import { AuditPanel } from '../../../shared/components/audit-panel/audit-panel';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { FormErrors } from '../../../shared/forms/form-errors.service';
import { ENUM_LABELS } from '../../../shared/pipes/status-label.pipe';
import { CategoriesApi } from '../data-access/categories.api';
import { ItemDto, ItemsApi, ItemType, StorageCondition } from '../data-access/items.api';
import { UnitsApi } from '../data-access/units.api';
import { ItemLocationSettings } from '../ui/item-location-settings';
import { purchaseFactorValidator } from '../ui/item-validators';

export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Alta y edición de artículos (`/catalogos/articulos/nuevo`, `/:id`), permiso `catalog.manage`. */
@Component({
  selector: 'app-item-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTabsModule,
    PageHeader,
    AuditPanel,
    ItemLocationSettings,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './item-form-page.html',
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: var(--sgo-space-2) var(--sgo-space-4);
    }
    h2 {
      margin: var(--sgo-space-4) 0 var(--sgo-space-3);
      font: var(--mat-sys-title-medium);
    }
    h2:first-child {
      margin-top: 0;
    }
    .toggle {
      align-self: center;
    }
    .tab {
      padding-top: var(--sgo-space-4);
    }
  `,
})
export class ItemFormPage {
  private readonly api = inject(ItemsApi);
  private readonly unitsApi = inject(UnitsApi);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);

  readonly id = input<string>();

  protected readonly isNew = computed(() => !this.id());
  protected readonly item = signal<ItemDto | null>(null);
  protected readonly saving = signal(false);
  protected readonly auditRefresh = signal(0);

  protected readonly types: ItemType[] = ['RawMaterial', 'Intermediate', 'FinishedGood'];
  protected readonly storages: StorageCondition[] = ['Ambient', 'Refrigerated', 'Frozen'];
  protected readonly typeLabels = ENUM_LABELS.ItemType;
  protected readonly storageLabels = ENUM_LABELS.StorageCondition;

  protected readonly units = rxResource({
    stream: () => this.unitsApi.list({ page: 1, pageSize: 100 }).pipe(map((page) => page.items)),
  });
  protected readonly categories = rxResource({
    stream: () =>
      this.categoriesApi.list({ page: 1, pageSize: 100 }).pipe(map((page) => page.items)),
  });

  protected readonly form = inject(NonNullableFormBuilder).group({
    sku: ['', [Validators.required, Validators.maxLength(50), Validators.pattern(SKU_PATTERN)]],
    name: ['', [Validators.required, Validators.maxLength(200)]],
    type: ['RawMaterial' as ItemType],
    categoryId: ['', Validators.required],
    storageCondition: ['Ambient' as StorageCondition],
    taxRate: [0],
    baseUomId: ['', Validators.required],
    purchaseUomId: [null as string | null],
    purchaseToBaseFactor: [null as number | null, purchaseFactorValidator],
    tracksLots: [false],
    shelfLifeDays: [null as number | null, [Validators.min(1), Validators.pattern(/^\d+$/)]],
    isActive: [true],
  });

  private readonly value = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { requireSync: true },
  );

  /** "1 caja = 12 kg" para confirmar el factor de compra. */
  protected readonly conversion = computed(() => {
    const { purchaseUomId, baseUomId, purchaseToBaseFactor } = this.value();
    const units = this.units.value() ?? [];
    const purchase = units.find((u) => u.id === purchaseUomId);
    const base = units.find((u) => u.id === baseUomId);
    return purchase && base && purchaseToBaseFactor
      ? `1 ${purchase.code} = ${purchaseToBaseFactor} ${base.code}`
      : null;
  });

  protected readonly baseUomCode = computed(
    () => (this.units.value() ?? []).find((u) => u.id === this.value().baseUomId)?.code ?? '',
  );

  constructor() {
    const { purchaseUomId, purchaseToBaseFactor, tracksLots, shelfLifeDays } = this.form.controls;
    // Sin unidad de compra no hay factor; al elegirla, se exige.
    purchaseUomId.valueChanges.pipe(takeUntilDestroyed()).subscribe((uom) => {
      if (uom) {
        purchaseToBaseFactor.enable({ emitEvent: false });
      } else {
        purchaseToBaseFactor.setValue(null, { emitEvent: false });
        purchaseToBaseFactor.disable({ emitEvent: false });
      }
      purchaseToBaseFactor.updateValueAndValidity();
    });
    // La vida útil (para calcular caducidad) solo aplica a artículos con lotes.
    tracksLots.valueChanges.pipe(takeUntilDestroyed()).subscribe((lots) => {
      if (lots) {
        shelfLifeDays.enable();
      } else {
        shelfLifeDays.setValue(null);
        shelfLifeDays.disable();
      }
    });
    purchaseToBaseFactor.disable({ emitEvent: false });
    shelfLifeDays.disable({ emitEvent: false });

    effect(() => {
      const id = this.id();
      if (id) {
        this.load(id);
      }
    });
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const v = this.form.getRawValue();
    const request = {
      sku: v.sku.trim().toUpperCase(),
      name: v.name.trim(),
      type: v.type,
      categoryId: v.categoryId,
      storageCondition: v.storageCondition,
      taxRate: v.taxRate,
      baseUomId: v.baseUomId,
      purchaseUomId: v.purchaseUomId,
      purchaseToBaseFactor: v.purchaseUomId ? v.purchaseToBaseFactor : null,
      tracksLots: v.tracksLots,
      shelfLifeDays: v.tracksLots ? v.shelfLifeDays : null,
    };
    const item = this.item();
    const request$ = item
      ? this.api.update(item.id, { ...request, isActive: v.isActive, version: item.version })
      : this.api.create(request);

    request$.subscribe({
      next: (saved) => {
        this.saving.set(false);
        if (item) {
          this.setItem(saved);
          this.notifier.success('Artículo guardado.');
        } else {
          this.notifier.success(`Artículo ${saved.sku} creado. Ahora puedes capturar su mín/máx.`);
          void this.router.navigate(['/catalogos/articulos', saved.id]);
        }
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.formErrors.handle(error, this.form, { reload: () => item && this.load(item.id) });
      },
    });
  }

  private load(id: string): void {
    this.api.get(id).subscribe({
      next: (item) => this.setItem(item),
      error: () => void this.router.navigate(['/catalogos/articulos']),
    });
  }

  private setItem(item: ItemDto): void {
    this.item.set(item);
    this.form.reset({
      sku: item.sku,
      name: item.name,
      type: item.type,
      categoryId: item.categoryId,
      storageCondition: item.storageCondition,
      taxRate: item.taxRate,
      baseUomId: item.baseUomId,
      purchaseUomId: item.purchaseUomId,
      purchaseToBaseFactor: item.purchaseUomId ? item.purchaseToBaseFactor : null,
      tracksLots: item.tracksLots,
      shelfLifeDays: item.shelfLifeDays,
      isActive: item.isActive,
    });
    this.auditRefresh.update((n) => n + 1);
  }
}
