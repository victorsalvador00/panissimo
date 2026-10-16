import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { provideAppLocale } from '../../../core/i18n/locale';
import { LineColumnDef, LinesEditor } from './lines-editor';
import { minLinesValidator, uniqueLinesValidator } from './lines-validators';

type Line = FormGroup<{
  itemId: FormControl<string | null>;
  quantity: FormControl<number | null>;
  unitCost: FormControl<number | null>;
}>;

function line(
  itemId: string | null = null,
  quantity: number | null = null,
  unitCost: number | null = null,
): Line {
  return new FormGroup({
    itemId: new FormControl(itemId, Validators.required),
    quantity: new FormControl(quantity, Validators.required),
    unitCost: new FormControl(unitCost),
  });
}

@Component({
  imports: [LinesEditor, LineColumnDef, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-lines-editor [lines]="lines" [createLine]="create" [minLines]="1" [total]="total">
      <ng-template appLineColumn="Cantidad" [appLineColumnOf]="lines" let-line>
        <input [formControl]="line.controls.quantity" type="number" />
      </ng-template>
    </app-lines-editor>
  `,
})
class Host {
  lines = new FormArray<Line>([line('a', 2, 10)], {
    validators: [minLinesValidator(1), uniqueLinesValidator('itemId')],
  });
  create = () => line();
  total = (values: ReturnType<Line['getRawValue']>[]) =>
    values.reduce((sum, l) => sum + (l.quantity ?? 0) * (l.unitCost ?? 0), 0);
}

describe('app-lines-editor', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideAppLocale()] }));

  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const totalText = () => el.querySelector('[data-total]')?.textContent?.trim();
    const rows = () => el.querySelectorAll('tbody tr').length;
    const click = async (text: string) => {
      const button = Array.from(el.querySelectorAll('button')).find(
        (b) => b.textContent?.includes(text) || b.getAttribute('aria-label')?.includes(text),
      );
      button!.click();
      await fixture.whenStable();
    };
    return { fixture, el, host: fixture.componentInstance, totalText, rows, click };
  }

  it('calcula el total y lo actualiza al cambiar una línea', async () => {
    const { fixture, host, totalText } = await render();
    expect(totalText()).toBe('$20.00');

    host.lines.at(0).controls.quantity.setValue(3.5);
    await fixture.whenStable();
    expect(totalText()).toBe('$35.00');
  });

  it('agrega y quita líneas; el total las incluye', async () => {
    const { fixture, host, rows, click, totalText } = await render();

    await click('Agregar línea');
    expect(rows()).toBe(2);
    host.lines.at(1).setValue({ itemId: 'b', quantity: 1, unitCost: 5.25 });
    await fixture.whenStable();
    expect(totalText()).toBe('$25.25');

    await click('Quitar línea 1');
    expect(rows()).toBe(1);
    expect(totalText()).toBe('$5.25');
  });

  it('no permite quitar por debajo de minLines', async () => {
    const { el } = await render();
    expect(el.querySelector('[aria-label="Quitar línea 1"]')).toBeNull();
  });

  it('valida líneas repetidas y muestra el mensaje', async () => {
    const { fixture, host, el } = await render();

    host.lines.push(line('a', 1, 1));
    host.lines.markAsTouched();
    await fixture.whenStable();

    expect(host.lines.hasError('duplicateLines')).toBe(true);
    expect(el.querySelector('[role=alert]')?.textContent).toContain(
      'Hay líneas repetidas (línea 2)',
    );
  });

  it('valida el mínimo de líneas', () => {
    const empty = new FormArray<Line>([], { validators: minLinesValidator(1) });
    expect(empty.getError('minLines')).toEqual({ min: 1 });
  });

  it('una línea incompleta invalida el documento', async () => {
    const { fixture, host, click } = await render();
    await click('Agregar línea');
    await fixture.whenStable();
    expect(host.lines.valid).toBe(false);
    host.lines.at(1).setValue({ itemId: 'b', quantity: 1, unitCost: null });
    expect(host.lines.valid).toBe(true);
  });

  it('uniqueLinesValidator acepta objetos con id (valor de app-item-picker)', () => {
    const array = new FormArray([
      new FormGroup({ item: new FormControl({ id: 'x' }) }),
      new FormGroup({ item: new FormControl({ id: 'x' }) }),
    ]);
    expect(uniqueLinesValidator('item')(array)).toEqual({ duplicateLines: { indexes: [1] } });
  });
});
