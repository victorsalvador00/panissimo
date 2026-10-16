import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  LOCALE_ID,
  Signal,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { filter, map, Observable, of, startWith, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier.service';
import { AuditPanel } from '../../../shared/components/audit-panel/audit-panel';
import { ConfirmService, ConflictHandler } from '../../../shared/components/dialogs.service';
import { ItemPicker } from '../../../shared/components/item-picker/item-picker';
import { LineColumnDef, LinesEditor } from '../../../shared/components/lines-editor/lines-editor';
import {
  minLinesValidator,
  uniqueLinesValidator,
} from '../../../shared/components/lines-editor/lines-validators';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import type { ItemOption } from '../../../shared/data-access/item-lookup.service';
import { FormErrors } from '../../../shared/forms/form-errors.service';
import { formatQty, QtyPipe } from '../../../shared/pipes/qty.pipe';
import { StatusLabelPipe } from '../../../shared/pipes/status-label.pipe';
import { RecipeDto, RecipesApi } from '../data-access/recipes.api';
import {
  canHaveRecipe,
  componentOption,
  contentOf,
  createRecipeLine,
  hasChanges,
  newVersionNotice,
  notOutputValidator,
  RecipeContent,
  RecipeLineForm,
  toRecipeLines,
} from '../ui/recipe-lines';
import { Stamp } from '../../../shared/components/stamp/stamp';

/**
 * Receta de un producto (spec frontend §7.4). Sin `id` crea la versión 1. Con `id`: la versión
 * activa se edita (si ya se usó, guardar crea la N+1, RN-10) o se desactiva; una versión anterior
 * se ve en solo lectura y se puede reactivar. Sin `production.recipes.manage`, todo es de lectura.
 */
@Component({
  selector: 'app-recipe-page',
  imports: [
    Stamp,
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    PageHeader,
    ItemPicker,
    QtyInput,
    LinesEditor,
    LineColumnDef,
    StatusTag,
    AuditPanel,
    QtyPipe,
    StatusLabelPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recipe-page.html',
  styleUrl: './recipe-page.scss',
})
export class RecipePage {
  private readonly api = inject(RecipesApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);
  private readonly confirmService = inject(ConfirmService);
  private readonly conflicts = inject(ConflictHandler);
  private readonly locale = inject(LOCALE_ID);

  /** Versión a ver o editar (ruta `:id`); sin él, receta nueva. */
  readonly id = input<string>();

  protected readonly canManage = inject(AuthService).can('production.recipes.manage');
  protected readonly recipe = signal<RecipeDto | null>(null);
  protected readonly loadError = signal(false);
  protected readonly busy = signal(false);

  /** Se edita una receta nueva o la versión activa, con permiso. */
  protected readonly editable = computed(
    () => this.canManage && (!this.id() || this.recipe()?.isActive === true),
  );
  protected readonly notice = computed(() =>
    this.editable() ? newVersionNotice(this.recipe()) : null,
  );
  protected readonly outputFilter = canHaveRecipe;

  protected readonly form = new FormGroup({
    output: new FormControl<ItemOption | null>(null, Validators.required),
    yieldQty: new FormControl<number | null>(null, Validators.required),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1000) }),
    lines: new FormArray<RecipeLineForm>([], {
      validators: [
        minLinesValidator(1),
        uniqueLinesValidator('component'),
        // `outputId` aún no existe cuando el arreglo se valida al construirse.
        notOutputValidator((): string | undefined => this.outputId?.()),
      ],
    }),
  });

  private readonly output: Signal<ItemOption | null> = toSignal(
    this.form.controls.output.valueChanges.pipe(startWith(this.form.controls.output.value)),
    { initialValue: null },
  );
  private readonly outputId = computed(
    (): string | undefined => this.recipe()?.outputItemId ?? this.output()?.id,
  );
  /** Unidad del rendimiento: la unidad base del producto. */
  protected readonly outputUom = computed(
    () => this.recipe()?.outputUomCode ?? this.output()?.baseUomCode ?? null,
  );

  /** Al crear: la receta activa que ya tenga el producto elegido (RN-10, solo una por artículo). */
  protected readonly existing = rxResource({
    params: () => (this.id() ? null : this.output()?.id),
    stream: ({ params }): Observable<string | null> =>
      params
        ? this.api
            .list({ page: 1, pageSize: 1 }, { outputItemId: params })
            .pipe(map((page) => page.items[0]?.id ?? null))
        : of(null),
  });

  protected readonly versions = rxResource({
    params: () => this.recipe()?.outputItemId,
    stream: ({ params }) => this.api.versions(params),
  });

  protected readonly newLine = () => createRecipeLine();

  constructor() {
    // El producto cambia la validación de las líneas (no puede ser su propio componente).
    effect(() => {
      this.outputId();
      untracked(() => this.form.controls.lines.updateValueAndValidity());
    });
    effect(() => {
      const id = this.id();
      untracked(() => (id ? this.load(id) : this.reset(null)));
    });
  }

  protected submit(): void {
    if (this.form.invalid || this.busy() || this.existing.value()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const content: RecipeContent = {
      yieldQty: value.yieldQty!,
      notes: value.notes.trim() || null,
      lines: toRecipeLines(value.lines),
    };
    const recipe = this.recipe();
    if (!recipe) {
      this.save(this.api.create({ outputItemId: value.output!.id, ...content }), null);
      return;
    }
    if (!hasChanges(recipe, content)) {
      this.notifier.success('No hay cambios que guardar.');
      return;
    }
    const request$ = this.api.update(recipe.id, {
      version: recipe.version,
      isActive: true,
      ...content,
    });
    const notice = newVersionNotice(recipe);
    if (!notice) {
      this.save(request$, recipe);
      return;
    }
    this.confirmService
      .confirm({
        title: `¿Crear la versión ${recipe.recipeVersion + 1} de ${recipe.outputSku}?`,
        message: notice,
        items: [
          {
            label: 'Rendimiento',
            value: formatQty(content.yieldQty, this.locale, recipe.outputUomCode),
          },
          { label: 'Componentes', value: String(content.lines.length) },
        ],
        confirmLabel: `Crear versión ${recipe.recipeVersion + 1}`,
      })
      .pipe(filter(Boolean))
      .subscribe(() => this.save(request$, recipe));
  }

  private save(request$: Observable<RecipeDto>, previous: RecipeDto | null): void {
    this.busy.set(true);
    request$.subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.notifier.success(
          previous && saved.id !== previous.id
            ? `Se creó la versión ${saved.recipeVersion} de ${saved.outputSku}.`
            : `Receta de ${saved.outputSku} guardada.`,
        );
        if (saved.id === this.id()) {
          this.reset(saved);
          this.versions.reload();
        } else {
          void this.router.navigate(['/produccion/recetas', saved.id]);
        }
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.formErrors.handle(error, this.form, {
          reload: () => previous && this.load(previous.id),
        });
      },
    });
  }

  protected deactivate(): void {
    const recipe = this.recipe();
    if (!recipe) {
      return;
    }
    this.changeActive(recipe, false, {
      title: `¿Desactivar la receta de ${recipe.outputSku}?`,
      message:
        'El producto se quedará sin receta activa y no se podrán crear órdenes de producción hasta activar una versión. Las órdenes existentes no cambian.',
      confirmLabel: 'Desactivar',
      done: `Receta de ${recipe.outputSku} desactivada.`,
    });
  }

  protected activate(): void {
    const recipe = this.recipe();
    if (!recipe) {
      return;
    }
    this.changeActive(recipe, true, {
      title: `¿Activar la versión ${recipe.recipeVersion} de ${recipe.outputSku}?`,
      message:
        'Las nuevas órdenes de producción usarán esta versión. Si hay otra versión activa, primero desactívala.',
      confirmLabel: 'Activar',
      done: `Versión ${recipe.recipeVersion} de ${recipe.outputSku} activada.`,
    });
  }

  private changeActive(
    recipe: RecipeDto,
    isActive: boolean,
    text: { title: string; message: string; confirmLabel: string; done: string },
  ): void {
    this.confirmService
      .confirm({
        title: text.title,
        message: text.message,
        confirmLabel: text.confirmLabel,
        cancelLabel: 'Volver',
        tone: isActive ? undefined : 'warn',
      })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.busy.set(true);
          return this.api.update(recipe.id, {
            version: recipe.version,
            isActive,
            ...contentOf(recipe),
          });
        }),
      )
      .subscribe({
        next: (saved) => {
          this.busy.set(false);
          this.notifier.success(text.done);
          this.reset(saved);
          this.versions.reload();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.conflicts.handle(error, { reload: () => this.load(recipe.id) });
        },
      });
  }

  private load(id: string): void {
    this.loadError.set(false);
    this.recipe.set(null);
    this.api.get(id).subscribe({
      next: (recipe) => this.reset(recipe),
      error: () => this.loadError.set(true),
    });
  }

  /** Llena el formulario con la receta (o lo deja vacío para una nueva). */
  private reset(recipe: RecipeDto | null): void {
    this.form.reset({
      output: null,
      yieldQty: recipe?.yieldQty ?? null,
      notes: recipe?.notes ?? '',
    });
    const lines = this.form.controls.lines;
    lines.clear({ emitEvent: false });
    (recipe?.lines ?? [null]).forEach((line) =>
      lines.push(
        createRecipeLine(
          line
            ? { component: componentOption(line), quantity: line.quantity, wastePct: line.wastePct }
            : undefined,
        ),
        { emitEvent: false },
      ),
    );
    lines.updateValueAndValidity();
    // Al editar, el producto no cambia: se muestra fijo y no se valida.
    if (recipe) {
      this.form.controls.output.disable({ emitEvent: false });
    } else {
      this.form.controls.output.enable({ emitEvent: false });
    }
    this.recipe.set(recipe);
  }
}
