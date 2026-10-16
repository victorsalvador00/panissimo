import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormArray, FormControl } from '@angular/forms';
import { provideHttpTesting, signIn } from '../../core/auth/testing';
import { provideAppLocale } from '../../core/i18n/locale';
import { qtyLimitsValidator } from '../../shared/components/qty-input/qty-input';
import type { ItemOption } from '../../shared/data-access/item-lookup.service';
import type { RecipeDto, RecipeListItem } from './data-access/recipes.api';
import { RecipePage } from './pages/recipe-page';
import {
  canHaveRecipe,
  componentOption,
  contentOf,
  createRecipeLine,
  hasChanges,
  newVersionNotice,
  notOutputValidator,
  RecipeLineForm,
  toRecipeLines,
} from './ui/recipe-lines';

const flour: ItemOption = {
  id: 'har',
  sku: 'HAR-001',
  name: 'Harina',
  type: 'RawMaterial',
  baseUomCode: 'kg',
  tracksLots: true,
  shelfLifeDays: 180,
};

const buildRecipe = (overrides: Partial<RecipeDto> = {}): RecipeDto => ({
  id: 'r2',
  outputItemId: 'pan',
  outputSku: 'PAN-001',
  outputName: 'Pan de caja',
  outputUomCode: 'pza',
  recipeVersion: 2,
  isActive: true,
  isUsed: true,
  yieldQty: 10,
  notes: null,
  lines: [
    {
      id: 'l1',
      componentItemId: 'har',
      sku: 'HAR-001',
      name: 'Harina',
      type: 'RawMaterial',
      baseUomCode: 'kg',
      quantity: 2.5,
      wastePct: 3,
      hasRecipe: false,
    },
    {
      id: 'l2',
      componentItemId: 'mas',
      sku: 'MAS-001',
      name: 'Masa madre',
      type: 'Intermediate',
      baseUomCode: 'kg',
      quantity: 0.5,
      wastePct: 0,
      hasRecipe: false,
    },
  ],
  createdAt: '2026-09-20T10:00:00Z',
  createdBy: null,
  createdByName: null,
  updatedAt: null,
  version: 7,
  ...overrides,
});

const versionRow = (recipe: RecipeDto): RecipeListItem => ({
  id: recipe.id,
  outputItemId: recipe.outputItemId,
  outputSku: recipe.outputSku,
  outputName: recipe.outputName,
  recipeVersion: recipe.recipeVersion,
  isActive: recipe.isActive,
  isUsed: recipe.isUsed,
  yieldQty: recipe.yieldQty,
  outputUomCode: recipe.outputUomCode,
  lineCount: recipe.lines.length,
  createdAt: recipe.createdAt,
  createdBy: recipe.createdBy,
  createdByName: recipe.createdByName,
  updatedAt: recipe.updatedAt,
});

describe('recetas: líneas y versiones (RN-10)', () => {
  it('solo intermedios y terminados llevan receta', () => {
    expect(canHaveRecipe(flour)).toBe(false);
    expect(canHaveRecipe({ ...flour, type: 'Intermediate' })).toBe(true);
    expect(canHaveRecipe({ ...flour, type: 'FinishedGood' })).toBe(true);
  });

  it('el aviso de nueva versión aparece solo en la versión activa ya usada', () => {
    expect(newVersionNotice(buildRecipe())).toBe(
      'Esta receta ya se usó en órdenes de producción. Guardar creará la versión 3; ' +
        'las órdenes existentes conservan la versión 2.',
    );
    expect(newVersionNotice(buildRecipe({ isUsed: false }))).toBeNull();
    expect(newVersionNotice(buildRecipe({ isActive: false }))).toBeNull();
    expect(newVersionNotice(null)).toBeNull();
  });

  it('un producto no puede ser componente de su propia receta', () => {
    let outputId: string | null = 'pan';
    const lines = new FormArray<RecipeLineForm>(
      [createRecipeLine({ component: flour, quantity: 1 })],
      { validators: notOutputValidator(() => outputId) },
    );
    expect(lines.errors).toBeNull();
    lines.push(createRecipeLine({ component: { ...flour, id: 'pan' }, quantity: 1 }));
    expect(lines.errors).toEqual({
      server: 'Un artículo no puede ser componente de su propia receta.',
    });
    outputId = null;
    lines.updateValueAndValidity();
    expect(lines.errors).toBeNull();
  });

  it('arma las líneas de la petición; la merma vacía es 0', () => {
    expect(
      toRecipeLines([
        { component: flour, quantity: 2.5, wastePct: 3 },
        { component: { ...flour, id: 'azu' }, quantity: 1, wastePct: null },
      ]),
    ).toEqual([
      { componentItemId: 'har', quantity: 2.5, wastePct: 3 },
      { componentItemId: 'azu', quantity: 1, wastePct: 0 },
    ]);
  });

  it('detecta cambios sin importar el orden de las líneas', () => {
    const recipe = buildRecipe();
    const same = contentOf(recipe);
    expect(hasChanges(recipe, { ...same, lines: [...same.lines].reverse() })).toBe(false);
    expect(hasChanges(recipe, { ...same, yieldQty: 12 })).toBe(true);
    expect(hasChanges(recipe, { ...same, notes: 'Hornear a 180 °C' })).toBe(true);
    expect(hasChanges(recipe, { ...same, lines: same.lines.slice(1) })).toBe(true);
    expect(
      hasChanges(recipe, {
        ...same,
        lines: same.lines.map((l, i) => (i === 0 ? { ...l, wastePct: 5 } : l)),
      }),
    ).toBe(true);
  });

  it('el componente guardado se convierte en opción del selector', () => {
    const option = componentOption(buildRecipe().lines[1]);
    expect(option).toEqual(
      expect.objectContaining({ id: 'mas', sku: 'MAS-001', type: 'Intermediate' }),
    );
  });

  it('la merma va de 0 a 100 con máximo 2 decimales', () => {
    const control = new FormControl<number | null>(
      null,
      qtyLimitsValidator(
        () => 100,
        () => 2,
      ),
    );
    control.setValue(12.5);
    expect(control.errors).toBeNull();
    control.setValue(100.5);
    expect(control.errors).toEqual({ qtyMax: { max: 100 } });
    control.setValue(1.255);
    expect(control.errors).toEqual({ qtyDecimals: { max: 2 } });
  });
});

describe('RecipePage', () => {
  let http: HttpTestingController;

  afterEach(() => {
    http.verify();
    document.querySelectorAll('.cdk-overlay-container').forEach((el) => (el.innerHTML = ''));
  });

  function setUp(permissions: string[]): void {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting(), provideAppLocale()] });
    http = TestBed.inject(HttpTestingController);
    signIn({ permissions });
  }

  async function open(recipe: RecipeDto): Promise<ComponentFixture<RecipePage>> {
    const fixture = TestBed.createComponent(RecipePage);
    fixture.componentRef.setInput('id', recipe.id);
    fixture.detectChanges();
    http.expectOne(`/api/v1/recipes/${recipe.id}`).flush(recipe);
    // El historial se pide al cargar la receta; `whenStable` esperaría esa petición.
    TestBed.tick();
    http
      .expectOne((req) => req.url === '/api/v1/recipes' && req.params.get('outputItemId') === 'pan')
      .flush({ items: [versionRow(recipe)], page: 1, pageSize: 100, total: 1 });
    await fixture.whenStable();
    return fixture;
  }

  const button = (el: HTMLElement, text: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);

  it('al editar una receta usada avisa y confirma que guardar creará la versión N+1', async () => {
    setUp(['production.view', 'production.recipes.manage']);
    const fixture = await open(buildRecipe());
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('Guardar creará la versión 3');
    const yieldInput = el.querySelector<HTMLInputElement>('app-qty-input input')!;
    expect(yieldInput.value).toBe('10');
    yieldInput.value = '12';
    yieldInput.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    button(el, 'Guardar como versión 3')!.click();
    await fixture.whenStable();
    const dialog = document.querySelector('mat-dialog-container')!;
    expect(dialog.textContent).toContain('¿Crear la versión 3 de PAN-001?');
    expect(dialog.textContent).toContain('las órdenes existentes conservan la versión 2');
    // Nada se envía hasta confirmar.
    http.expectNone((req) => req.method === 'PUT');
  });

  it('una receta sin usar se edita sin aviso de versión', async () => {
    setUp(['production.view', 'production.recipes.manage']);
    const fixture = await open(buildRecipe({ isUsed: false }));
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Guardar creará');
    expect(button(el, 'Guardar')).toBeDefined();
  });

  it('sin permiso de gestión la receta se ve en solo lectura', async () => {
    setUp(['production.view']);
    const fixture = await open(buildRecipe());
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('form')).toBeNull();
    expect(el.textContent).not.toContain('Guardar creará');
    expect(el.textContent).toContain('Masa madre');
    expect(el.textContent).toContain('sin receta activa');
    expect(button(el, 'Desactivar receta')).toBeUndefined();
  });

  it('una versión anterior es de solo lectura y se puede reactivar', async () => {
    setUp(['production.view', 'production.recipes.manage']);
    const fixture = await open(buildRecipe({ id: 'r1', recipeVersion: 1, isActive: false }));
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('form')).toBeNull();
    expect(el.textContent).toContain('Versión anterior en solo lectura');
    expect(button(el, 'Activar esta versión')).toBeDefined();
  });
});
