import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import type { ItemOption } from '../../../shared/data-access/item-lookup.service';
import type { RecipeDto, RecipeLine, RecipeLineRequest } from '../data-access/recipes.api';

/** Solo intermedios y terminados llevan receta. */
export const canHaveRecipe = (item: ItemOption): boolean => item.type !== 'RawMaterial';

export type RecipeLineForm = FormGroup<{
  component: FormControl<ItemOption | null>;
  /** Por rendimiento de la receta, en la unidad base del componente. */
  quantity: FormControl<number | null>;
  /** Merma esperada, 0 a 100 con 2 decimales. */
  wastePct: FormControl<number | null>;
}>;

export interface RecipeLineValue {
  component: ItemOption | null;
  quantity: number | null;
  wastePct: number | null;
}

export function createRecipeLine(value?: Partial<RecipeLineValue>): RecipeLineForm {
  return new FormGroup({
    component: new FormControl<ItemOption | null>(value?.component ?? null, Validators.required),
    quantity: new FormControl<number | null>(value?.quantity ?? null, Validators.required),
    wastePct: new FormControl<number | null>(value?.wastePct ?? 0, Validators.required),
  });
}

/**
 * El componente de una línea guardada como `ItemOption` (lo que usa `app-item-picker`). La receta
 * no trae lotes ni vida útil, que el editor no necesita.
 */
export function componentOption(line: RecipeLine): ItemOption {
  return {
    id: line.componentItemId,
    sku: line.sku,
    name: line.name,
    type: line.type,
    baseUomCode: line.baseUomCode,
    tracksLots: false,
    shelfLifeDays: null,
  };
}

/** Un artículo no puede ser componente de su propia receta. */
export function notOutputValidator(outputId: () => string | null | undefined): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const id = outputId();
    const lines = (control as FormArray<RecipeLineForm>).controls;
    return id && lines.some((line) => line.controls.component.value?.id === id)
      ? { server: 'Un artículo no puede ser componente de su propia receta.' }
      : null;
  };
}

export function toRecipeLines(lines: RecipeLineValue[]): RecipeLineRequest[] {
  return lines.map((line) => ({
    componentItemId: line.component!.id,
    quantity: line.quantity ?? 0,
    wastePct: line.wastePct ?? 0,
  }));
}

export interface RecipeContent {
  yieldQty: number;
  notes: string | null;
  lines: RecipeLineRequest[];
}

/** Contenido guardado de la receta, en la forma de la petición (para activar o desactivar sin cambios). */
export function contentOf(recipe: RecipeDto): RecipeContent {
  return {
    yieldQty: recipe.yieldQty,
    notes: recipe.notes,
    lines: recipe.lines.map((line) => ({
      componentItemId: line.componentItemId,
      quantity: line.quantity,
      wastePct: line.wastePct,
    })),
  };
}

/** ¿Lo capturado difiere de lo guardado? El orden de las líneas no cuenta. */
export function hasChanges(recipe: RecipeDto, content: RecipeContent): boolean {
  const saved = contentOf(recipe);
  const key = (line: RecipeLineRequest) =>
    `${line.componentItemId}|${line.quantity}|${line.wastePct}`;
  const savedLines = new Set(saved.lines.map(key));
  return (
    saved.yieldQty !== content.yieldQty ||
    (saved.notes ?? '') !== (content.notes ?? '') ||
    saved.lines.length !== content.lines.length ||
    content.lines.some((line) => !savedLines.has(key(line)))
  );
}

/**
 * RN-10: aviso al editar la versión activa de una receta que ya se usó en órdenes de producción.
 * `null` si guardar edita la misma versión.
 */
export function newVersionNotice(recipe: RecipeDto | null): string | null {
  if (!recipe?.isActive || !recipe.isUsed) {
    return null;
  }
  const version = recipe.recipeVersion;
  return (
    `Esta receta ya se usó en órdenes de producción. Guardar creará la versión ${version + 1}; ` +
    `las órdenes existentes conservan la versión ${version}.`
  );
}
