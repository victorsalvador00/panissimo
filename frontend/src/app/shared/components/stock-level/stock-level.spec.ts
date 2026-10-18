import { TestBed } from '@angular/core/testing';
import { StockLevel } from './stock-level';

async function render(onHand: number, min: number | null, max: number | null) {
  const fixture = TestBed.createComponent(StockLevel);
  fixture.componentRef.setInput('onHand', onHand);
  fixture.componentRef.setInput('min', min);
  fixture.componentRef.setInput('max', max);
  fixture.componentRef.setInput('unit', 'kg');
  await fixture.whenStable();
  return (fixture.nativeElement as HTMLElement).textContent?.trim() ?? '';
}

describe('StockLevel', () => {
  it('says the level in words, not only with color', async () => {
    expect(await render(5, null, null)).toBe('Sin mín/máx');
    expect(await render(0, 10, 40)).toContain('Sin existencia');
    expect(await render(5, 10, 40)).toContain('Bajo mínimo');
    expect(await render(20, 10, 40)).toContain('Normal');
    expect(await render(50, 10, 40)).toContain('Sobre máximo');
  });

  it('reads the range to screen readers', async () => {
    expect(await render(20, 10, 40)).toContain('Mínimo 10 kg, máximo 40 kg');
  });
});
