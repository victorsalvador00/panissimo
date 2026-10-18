import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { QtyInput, parseQty } from './qty-input';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QtyInput, ReactiveFormsModule],
  template: `<app-qty-input
    [formControl]="qty"
    label="Cantidad"
    [unit]="unit()"
    [max]="max()"
    [allowZero]="allowZero()"
  />`,
})
class Host {
  readonly qty = new FormControl<number | null>(null);
  readonly unit = signal<string | null>('kg');
  readonly max = signal<number | null>(null);
  readonly allowZero = signal(false);
}

async function setup() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
  const type = async (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  return { fixture, host: fixture.componentInstance, input, type };
}

describe('QtyInput', () => {
  it('parses es-MX numbers', () => {
    expect(parseQty('1,234.5')).toBe(1234.5);
    expect(parseQty(' 3 ')).toBe(3);
    expect(parseQty('')).toBeNull();
    expect(parseQty('abc')).toBeNaN();
    expect(parseQty('1.2.3')).toBeNaN();
  });

  it('writes the number to the parent control and validates it there', async () => {
    const { host, type } = await setup();
    await type('12.5');
    expect(host.qty.value).toBe(12.5);
    expect(host.qty.valid).toBe(true);

    await type('0');
    expect(host.qty.errors).toEqual({ positive: true });

    await type('abc');
    expect(host.qty.value).toBeNull();
    expect(host.qty.errors).toEqual({ number: true });

    await type('1.23456');
    expect(host.qty.errors).toEqual({ decimals: { digits: 4 } });
  });

  it('accepts only whole pieces, a maximum and zero when allowed', async () => {
    const { host, type, fixture } = await setup();
    host.unit.set('pza');
    await fixture.whenStable();
    await type('2.5');
    expect(host.qty.errors).toEqual({ decimals: { digits: 0 } });

    host.max.set(10);
    await fixture.whenStable();
    await type('11');
    expect(host.qty.errors).toEqual({ maxQty: { max: 10 } });

    host.allowZero.set(true);
    await fixture.whenStable();
    await type('0');
    expect(host.qty.valid).toBe(true);
  });

  it('shows the value of the parent control and uses a numeric keyboard for pieces', async () => {
    const { host, input, fixture } = await setup();
    host.qty.setValue(7);
    host.unit.set('pza');
    await fixture.whenStable();
    expect(input.value).toBe('7');
    expect(input.getAttribute('inputmode')).toBe('numeric');
  });
});
