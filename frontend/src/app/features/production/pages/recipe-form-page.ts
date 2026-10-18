import { DatePipe } from '@angular/common';
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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { Schemas } from '../../../core/api/api';
import { AuthService } from '../../../core/auth/auth.service';
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
import { Stamp } from '../../../shared/components/stamp/stamp';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { controlError } from '../../../shared/forms/control-error';
import { FormErrors } from '../../../shared/forms/form-errors';
import { Recipe, RecipesApi } from '../data-access/production-api';
import { COMPONENT_TYPES, OUTPUT_TYPES, savesNewVersion } from '../ui/recipe-rules';

type ComponentLine = FormGroup<{
  item: FormControl<ItemOption | null>;
  quantity: FormControl<number | null>;
  wastePct: FormControl<number | null>;
}>;

/**
 * /produccion/recetas/nueva and /:id (frontend §7.4, RN-10): product (semi-finished or finished), yield and components
 * (raw material, supply or semi-finished; quantity and waste %). Only the active version is edited; one already used by
 * an order is saved as version N+1 after confirming. Deactivate / activate this version and the version history.
 * The costs tab arrives with F-22.
 */
@Component({
  selector: 'app-recipe-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    PageHeader,
    LinesEditor,
    LineColumn,
    ItemPicker,
    QtyInput,
    Stamp,
    StatusTag,
  ],
  templateUrl: './recipe-form-page.html',
  styleUrl: './recipe-form-page.scss',
})
export class RecipeFormPage {
  /** Present for an existing version (`/:id`). */
  readonly id = input<string>();

  private readonly api = inject(RecipesApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly confirmService = inject(ConfirmService);
  private readonly formErrors = inject(FormErrors);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  private readonly canManage = inject(AuthService).can('production.recipes.manage');

  protected readonly outputTypes = OUTPUT_TYPES;
  protected readonly componentTypes = COMPONENT_TYPES;
  protected readonly controlError = controlError;
  protected readonly busy = signal(false);
  protected readonly recipe = signal<Recipe | null>(null);
  /** A new recipe, or the active version for whoever manages recipes. */
  protected readonly editable = computed(() => {
    const recipe = this.recipe();
    return this.canManage && (!this.id() || !!recipe?.isActive);
  });
  protected readonly newVersion = computed(() => savesNewVersion(this.recipe()));
  protected readonly canToggle = computed(() => this.canManage && !!this.recipe());

  protected readonly lines = new FormArray<ComponentLine>([], minLinesValidator(1));
  protected readonly form = new FormGroup({
    output: new FormControl<ItemOption | null>(null, Validators.required),
    yieldQty: new FormControl<number | null>(null, Validators.required),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    lines: this.lines,
  });
  protected readonly newLine = () => this.createLine();

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) void this.load(id);
      else this.lines.push(this.createLine());
    });
    effect(() => {
      if (this.editable()) this.form.enable({ emitEvent: false });
      else this.form.disable({ emitEvent: false });
      // The product of an existing recipe does not change: a new product is a new recipe.
      if (this.recipe()) this.form.controls.output.disable({ emitEvent: false });
    });
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const recipe = this.recipe();
    const { output, yieldQty, notes } = this.form.getRawValue();
    const lines: Schemas['RecipeLineRequest'][] = this.lines.getRawValue().map((l) => ({
      componentItemId: l.item!.id,
      quantity: l.quantity!,
      wastePct: l.wastePct ?? 0,
    }));
    if (recipe && this.newVersion()) {
      const confirmed = await this.confirmService.confirm({
        title: `Guardar creará la versión ${recipe.recipeVersion + 1}`,
        message: `La versión ${recipe.recipeVersion} ya se usó en órdenes de producción: se conserva para ellas y queda inactiva; la nueva versión será la activa.`,
        confirmLabel: `Crear versión ${recipe.recipeVersion + 1}`,
      });
      if (!confirmed) return;
    }

    this.busy.set(true);
    try {
      const saved = await firstValueFrom(
        recipe
          ? this.api.update(recipe.id, {
              version: recipe.version,
              yieldQty: yieldQty!,
              notes: notes.trim() || null,
              lines,
            })
          : this.api.create({
              outputItemId: output!.id,
              yieldQty: yieldQty!,
              notes: notes.trim() || null,
              lines,
            }),
      );
      this.notifier.info(
        recipe && saved.id !== recipe.id
          ? `Se creó la versión ${saved.recipeVersion} de la receta de ${saved.outputSku}.`
          : `Receta de ${saved.outputSku} guardada.`,
      );
      if (saved.id === this.id()) this.show(saved);
      else await this.router.navigate(['/produccion/recetas', saved.id]);
    } catch (error) {
      this.formErrors.apply(this.form, error);
    } finally {
      this.busy.set(false);
    }
  }

  protected async toggleActive(): Promise<void> {
    const recipe = this.recipe();
    if (!recipe) return;
    const activate = !recipe.isActive;
    const confirmed = await this.confirmService.confirm({
      title: activate ? 'Activar esta versión' : 'Desactivar esta versión',
      message: activate
        ? `La versión ${recipe.recipeVersion} será la receta de ${recipe.outputSku} para las nuevas órdenes. Si hay otra versión activa, desactívala antes.`
        : `${recipe.outputSku} se queda sin receta activa: no se podrán crear órdenes de producción de este producto hasta activar una versión.`,
      confirmLabel: activate ? 'Activar' : 'Desactivar',
      destructive: !activate,
    });
    if (!confirmed) return;
    this.busy.set(true);
    try {
      const saved = await firstValueFrom(
        activate
          ? this.api.activate(recipe.id, recipe.version)
          : this.api.deactivate(recipe.id, recipe.version),
      );
      this.show(saved);
      this.notifier.info(
        `Versión ${saved.recipeVersion} ${activate ? 'activada' : 'desactivada'}.`,
      );
    } catch {
      // The error interceptor shows why (another active version, 409…).
    } finally {
      this.busy.set(false);
    }
  }

  private async load(id: string): Promise<void> {
    this.show(await firstValueFrom(this.api.get(id)));
  }

  /** Fills the form with a version; each component brings its item for the picker. */
  private show(recipe: Recipe): void {
    const output: ItemOption = {
      id: recipe.outputItemId,
      sku: recipe.outputSku,
      name: recipe.outputName,
      type: recipe.outputType,
      presentation: null,
      baseUomCode: recipe.outputUomCode,
      tracksLots: false,
      shelfLifeDays: null,
      productionAreaId: null,
    };
    // Reuses the line controls already on screen (re-creating them all re-renders the editor).
    while (this.lines.length > recipe.lines.length)
      this.lines.removeAt(this.lines.length - 1, { emitEvent: false });
    while (this.lines.length < recipe.lines.length)
      this.lines.push(this.createLine(), { emitEvent: false });
    recipe.lines.forEach((line, i) => {
      this.lines.at(i).setValue({
        item: {
          id: line.componentItemId,
          sku: line.sku,
          name: line.name,
          type: line.type,
          presentation: null,
          baseUomCode: line.baseUomCode,
          tracksLots: false,
          shelfLifeDays: null,
          productionAreaId: null,
        },
        quantity: line.quantity,
        wastePct: line.wastePct,
      });
    });
    this.form.patchValue({ output, yieldQty: recipe.yieldQty, notes: recipe.notes ?? '' });
    this.form.markAsPristine();
    this.recipe.set(recipe);
    this.breadcrumbs.setCurrent(`${recipe.outputSku} v${recipe.recipeVersion}`);
  }

  private createLine(): ComponentLine {
    return new FormGroup({
      item: new FormControl<ItemOption | null>(null, Validators.required),
      quantity: new FormControl<number | null>(null, Validators.required),
      wastePct: new FormControl<number | null>(0),
    });
  }
}
