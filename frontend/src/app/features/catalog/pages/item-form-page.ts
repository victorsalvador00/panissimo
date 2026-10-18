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
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, map, startWith } from 'rxjs';
import type { ApiEnum } from '../../../core/api/api';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { AuditPanel } from '../../../shared/components/audit-panel/audit-panel';
import { ItemOption, ItemPicker } from '../../../shared/components/item-picker/item-picker';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { controlError } from '../../../shared/forms/control-error';
import { FormErrors } from '../../../shared/forms/form-errors';
import { AreasApi, CategoriesApi, Item, ItemsApi, UnitsApi } from '../data-access/catalog-api';
import { ItemLocationSettings } from '../ui/item-location-settings';
import {
  ITEM_TYPE_OPTIONS,
  PRESENTATION_OPTIONS,
  STORAGE_OPTIONS,
  TAX_OPTIONS,
  isProduced,
} from '../ui/item-options';
import { ItemPhotoEditor } from '../ui/item-photo-editor';
import { PackagedVersions } from '../ui/packaged-versions';

type ItemType = ApiEnum<'ItemType'>;
type Presentation = ApiEnum<'ItemPresentation'>;

/** Same rule as the backend (ItemRules): stored in upper case. */
function skuFormat(control: AbstractControl<string>): ValidationErrors | null {
  return control.value && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(control.value.trim())
    ? { message: 'Solo letras, números, punto, guion y guion bajo, sin espacios.' }
    : null;
}

/**
 * /catalogos/articulos/nuevo and /:id (frontend §7.2, dominio §4.2): general data with the fields that apply to the
 * type (presentation only for finished goods; bulk link and pieces only for packaged; area only for produced items);
 * tabs for min/max per location, packaged versions of a bulk item and history. `?granel=<id>` starts a packaged
 * version of that bulk item with its data. The photo tab arrives in F-23.
 */
@Component({
  selector: 'app-item-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTabsModule,
    PageHeader,
    ItemPicker,
    QtyInput,
    StatusTag,
    Stamp,
    AuditPanel,
    ItemLocationSettings,
    PackagedVersions,
    ItemPhotoEditor,
  ],
  templateUrl: './item-form-page.html',
  styleUrl: './item-form-page.scss',
})
export class ItemFormPage {
  /** Route parameter; absent on /nuevo. */
  readonly id = input<string>();
  /** `?granel=<id>`: new packaged version of that bulk item. */
  readonly granel = input<string>();

  private readonly api = inject(ItemsApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  private readonly auth = inject(AuthService);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly unitsApi = inject(UnitsApi);
  private readonly areasApi = inject(AreasApi);

  protected readonly typeOptions = ITEM_TYPE_OPTIONS;
  protected readonly presentationOptions = PRESENTATION_OPTIONS;
  protected readonly storageOptions = STORAGE_OPTIONS;
  protected readonly taxOptions = TAX_OPTIONS;
  protected readonly controlError = controlError;

  protected readonly canManage = this.auth.can('catalog.manage');
  protected readonly canSeeAudit = this.auth.can('security.audit.view');
  protected readonly item = signal<Item | null>(null);
  protected readonly saving = signal(false);
  protected readonly tab = signal(0);

  protected readonly categories = rxResource({
    stream: () => this.categoriesApi.list().pipe(map((page) => page.items)),
    defaultValue: [],
  });
  protected readonly units = rxResource({
    stream: () => this.unitsApi.list().pipe(map((page) => page.items)),
    defaultValue: [],
  });
  protected readonly areas = rxResource({
    stream: () => this.areasApi.list().pipe(map((page) => page.items)),
    defaultValue: [],
  });
  private readonly loaded = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });
  private readonly bulkSource = rxResource({
    params: () => (this.id() ? undefined : this.granel()),
    stream: ({ params }) => this.api.get(params),
  });

  protected readonly form = new FormGroup({
    sku: skuControl(),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    type: new FormControl<ItemType | null>(null, Validators.required),
    categoryId: new FormControl<string | null>(null, Validators.required),
    baseUomId: new FormControl<string | null>(null, Validators.required),
    purchaseUomId: new FormControl<string | null>(null),
    purchaseToBaseFactor: new FormControl<number | null>(null),
    tracksLots: new FormControl(false, { nonNullable: true }),
    shelfLifeDays: new FormControl<number | null>(null, [Validators.min(0)]),
    storageCondition: new FormControl<ApiEnum<'StorageCondition'>>('Ambient', {
      nonNullable: true,
    }),
    taxRate: new FormControl(0, { nonNullable: true }),
    presentation: new FormControl<Presentation | null>(null),
    bulkItemId: new FormControl<ItemOption | null>(null),
    unitsPerPackage: new FormControl<number | null>(null),
    productionAreaId: new FormControl<string | null>(null),
    productionMultiple: new FormControl<number | null>(null),
    unitWeightGrams: new FormControl<number | null>(null),
    isActive: new FormControl(true, { nonNullable: true }),
  });

  private readonly value = toSignal(this.form.valueChanges.pipe(startWith(this.form.value)), {
    initialValue: this.form.value,
  });
  protected readonly isFinishedGood = computed(() => this.value().type === 'FinishedGood');
  protected readonly isPackaged = computed(
    () => this.isFinishedGood() && this.value().presentation === 'Packaged',
  );
  protected readonly isProduced = computed(() => isProduced(this.value().type));
  protected readonly hasPurchaseUnit = computed(() => !!this.value().purchaseUomId);
  protected readonly baseUnitCode = computed(
    () => this.units.value().find((u) => u.id === this.value().baseUomId)?.code ?? null,
  );
  /** A saved bulk finished good shows its packaged versions. */
  protected readonly isBulk = computed(() => {
    const item = this.item();
    return item?.type === 'FinishedGood' && item.presentation === 'Bulk';
  });
  protected readonly title = computed(() => {
    const item = this.item();
    if (item) return `${item.sku} · ${item.name}`;
    return this.granel() ? 'Nueva versión empaquetada' : 'Nuevo artículo';
  });

  constructor() {
    if (!this.canManage) this.form.disable();
    effect(() => {
      if (this.loaded.hasValue()) this.showItem(this.loaded.value());
    });
    effect(() => {
      if (this.bulkSource.hasValue()) this.startPackagedVersion(this.bulkSource.value());
    });
    // Fields that do not apply to the new type or presentation are cleared, so the backend gets a valid item.
    this.form.controls.type.valueChanges.pipe(takeUntilDestroyed()).subscribe((type) => {
      if (type !== 'FinishedGood') this.form.controls.presentation.setValue(null);
      if (!isProduced(type)) this.form.controls.productionAreaId.setValue(null);
    });
    this.form.controls.presentation.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((presentation) => {
        if (presentation !== 'Packaged') {
          this.form.controls.bulkItemId.setValue(null);
          this.form.controls.unitsPerPackage.setValue(null);
        }
      });
    this.form.controls.purchaseUomId.valueChanges.pipe(takeUntilDestroyed()).subscribe((unit) => {
      if (!unit) this.form.controls.purchaseToBaseFactor.setValue(null);
    });
  }

  /** The photo changed in its tab: the item (and its title, lists and pickers) shows the new revision. */
  protected photoChanged(revision: number | null): void {
    this.item.update((item) => (item ? { ...item, photoRevision: revision } : item));
  }

  protected async save(): Promise<void> {
    const errors = this.ruleErrors();
    if (this.form.invalid || errors) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const v = this.form.getRawValue();
    const definition = {
      sku: v.sku.trim().toUpperCase(),
      name: v.name.trim(),
      type: v.type!,
      categoryId: v.categoryId!,
      baseUomId: v.baseUomId!,
      purchaseUomId: v.purchaseUomId,
      purchaseToBaseFactor: v.purchaseUomId ? v.purchaseToBaseFactor : null,
      tracksLots: v.tracksLots,
      shelfLifeDays: v.shelfLifeDays,
      storageCondition: v.storageCondition,
      taxRate: v.taxRate,
      presentation: v.type === 'FinishedGood' ? v.presentation : null,
      bulkItemId: v.presentation === 'Packaged' ? (v.bulkItemId?.id ?? null) : null,
      unitsPerPackage: v.presentation === 'Packaged' ? v.unitsPerPackage : null,
      productionAreaId: isProduced(v.type) ? v.productionAreaId : null,
      productionMultiple: v.productionMultiple,
      unitWeightGrams: v.unitWeightGrams,
    };
    try {
      const item = this.item();
      if (item) {
        const saved = await firstValueFrom(
          this.api.update(item.id, { ...definition, version: item.version, isActive: v.isActive }),
        );
        this.showItem(saved);
        this.notifier.info('Cambios guardados.');
      } else {
        const created = await firstValueFrom(this.api.create(definition));
        this.notifier.info('Artículo creado.');
        await this.router.navigate(['/catalogos/articulos', created.id]);
      }
    } catch (error) {
      this.formErrors.apply(this.form, error);
    } finally {
      this.saving.set(false);
    }
  }

  /** The rules that depend on several fields (ItemRules), shown before going to the server. */
  private ruleErrors(): boolean {
    const c = this.form.controls;
    let invalid = false;
    const require = (control: FormControl<unknown>, needed: boolean) => {
      const missing = needed && (control.value === null || control.value === undefined);
      if (missing) {
        control.setErrors({ ...control.errors, required: true });
        invalid = true;
      }
    };
    require(c.presentation as FormControl<unknown>, c.type.value === 'FinishedGood');
    require(c.purchaseToBaseFactor as FormControl<unknown>, !!c.purchaseUomId.value);
    return invalid;
  }

  private showItem(item: Item): void {
    this.item.set(item);
    this.breadcrumbs.setCurrent(item.sku);
    this.form.reset({
      sku: item.sku,
      name: item.name,
      type: item.type,
      categoryId: item.categoryId,
      baseUomId: item.baseUomId,
      purchaseUomId: item.purchaseUomId,
      purchaseToBaseFactor: item.purchaseUomId ? item.purchaseToBaseFactor : null,
      tracksLots: item.tracksLots,
      shelfLifeDays: item.shelfLifeDays,
      storageCondition: item.storageCondition,
      taxRate: item.taxRate,
      presentation: item.presentation,
      bulkItemId: item.bulkItemId ? bulkOption(item) : null,
      unitsPerPackage: item.unitsPerPackage,
      productionAreaId: item.productionAreaId,
      productionMultiple: item.productionMultiple,
      unitWeightGrams: item.unitWeightGrams,
      isActive: item.isActive,
    });
  }

  /** The packaged version takes the bulk item's data; only its SKUs, name and pieces are new. */
  private startPackagedVersion(bulk: Item): void {
    this.form.patchValue({
      name: `${bulk.name} empaquetado`,
      type: 'FinishedGood',
      categoryId: bulk.categoryId,
      baseUomId: bulk.baseUomId,
      tracksLots: bulk.tracksLots,
      shelfLifeDays: bulk.shelfLifeDays,
      storageCondition: bulk.storageCondition,
      taxRate: bulk.taxRate,
      productionAreaId: bulk.productionAreaId,
    });
    this.form.patchValue({
      presentation: 'Packaged',
      bulkItemId: {
        id: bulk.id,
        sku: bulk.sku,
        name: bulk.name,
        type: bulk.type,
        presentation: bulk.presentation,
        baseUomCode: bulk.baseUomCode,
        tracksLots: bulk.tracksLots,
        shelfLifeDays: bulk.shelfLifeDays,
        productionAreaId: bulk.productionAreaId,
        photoRevision: bulk.photoRevision,
      },
    });
  }
}

function skuControl(): FormControl<string> {
  return new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(50), skuFormat],
  });
}

/** The linked bulk item as a picker option (the item brings only its SKU and name). */
function bulkOption(item: Item): ItemOption {
  return {
    id: item.bulkItemId!,
    sku: item.bulkItemSku ?? '',
    name: item.bulkItemName ?? '',
    type: 'FinishedGood',
    presentation: 'Bulk',
    baseUomCode: item.baseUomCode,
    tracksLots: item.tracksLots,
    shelfLifeDays: item.shelfLifeDays,
    productionAreaId: item.productionAreaId,
    // The item does not bring the photo of its bulk version.
    photoRevision: null,
  };
}
