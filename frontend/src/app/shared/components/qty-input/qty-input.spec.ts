import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { parseQty, qtyErrorMessage, QtyInput, qtyValidator } from './qty-input';

describe('qtyValidator y parseQty', () => {
  const check = (value: number | null, allowNegative = false) =>
    qtyValidator(allowNegative)(new FormControl(value));

  it('acepta positivos con hasta 4 decimales', () => {
    expect(check(12.5)).toBeNull();
    expect(check(0.0001)).toBeNull();
    expect(check(null)).toBeNull();
  });

  it('rechaza cero, negativos, NaN y más de 4 decimales', () => {
    expect(check(0)).toEqual({ qtyPositive: true });
    expect(check(-1)).toEqual({ qtyPositive: true });
    expect(check(Number.NaN)).toEqual({ qtyInvalid: true });
    expect(check(1.23456)).toEqual({ qtyDecimals: true });
  });

  it('con signo acepta negativos pero no cero', () => {
    expect(check(-2.5, true)).toBeNull();
    expect(check(0, true)).toEqual({ qtyPositive: true });
  });

  it('con allowZero (conteos) acepta cero pero no negativos', () => {
    const zero = (value: number) => qtyValidator(false, true)(new FormControl(value));
    expect(zero(0)).toBeNull();
    expect(zero(3)).toBeNull();
    expect(zero(-1)).toEqual({ qtyPositive: true });
    expect(qtyErrorMessage({ qtyPositive: true }, false, true)).toBe(
      'La cantidad no puede ser negativa.',
    );
  });

  it('interpreta el texto capturado', () => {
    expect(parseQty('12.5')).toBe(12.5);
    expect(parseQty(' 12,5 ')).toBe(12.5);
    expect(parseQty('-3')).toBe(-3);
    expect(parseQty('')).toBeNull();
    expect(parseQty('abc')).toBeNaN();
    expect(parseQty('1.2.3')).toBeNaN();
  });
});

@Component({
  imports: [QtyInput, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-qty-input [formControl]="first" label="Primera" unit="kg" />
    <app-qty-input [formControl]="second" label="Segunda" unit="kg" />
  `,
})
class Host {
  first = new FormControl<number | null>(null, Validators.required);
  second = new FormControl<number | null>(null);
}

describe('app-qty-input', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const inputs = el.querySelectorAll<HTMLInputElement>('input');
    return { fixture, el, host: fixture.componentInstance, inputs };
  }

  it('escribe el número en el control y muestra la unidad', async () => {
    const { host, inputs, el } = await render();
    inputs[0].value = '12.5';
    inputs[0].dispatchEvent(new Event('input'));

    expect(host.first.value).toBe(12.5);
    expect(inputs[0].getAttribute('inputmode')).toBe('decimal');
    expect(el.textContent).toContain('kg');
  });

  it('muestra el error en español al tocar el campo', async () => {
    const { fixture, host, inputs, el } = await render();
    inputs[0].value = '0';
    inputs[0].dispatchEvent(new Event('input'));
    inputs[0].dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(host.first.hasError('qtyPositive')).toBe(true);
    expect(el.querySelector('mat-error')?.textContent).toContain(
      'La cantidad debe ser mayor a cero.',
    );
  });

  it('muestra "Captura la cantidad" cuando el formulario marca todo como tocado', async () => {
    const { fixture, host, el } = await render();
    host.first.markAsTouched();
    await fixture.whenStable();

    expect(el.querySelector('mat-error')?.textContent).toContain('Captura la cantidad.');
  });

  it('Enter pasa a la siguiente cantidad', async () => {
    const { inputs } = await render();
    inputs[0].focus();
    inputs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(document.activeElement).toBe(inputs[1]);
  });

  it('refleja el valor inicial del control', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.second.setValue(3.25);
    await fixture.whenStable();
    const inputs = (fixture.nativeElement as HTMLElement).querySelectorAll('input');
    expect(inputs[1].value).toBe('3.25');
  });
});
