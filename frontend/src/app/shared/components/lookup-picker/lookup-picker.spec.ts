import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { LookupPicker } from './lookup-picker';

interface Supplier {
  id: string;
  name: string;
}

const suppliers: Supplier[] = [
  { id: 's1', name: 'Harinas del Bajío' },
  { id: 's2', name: 'Lácteos San Juan' },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LookupPicker, ReactiveFormsModule],
  template: `<app-lookup-picker
    [formControl]="supplier"
    label="Proveedor"
    [search]="search"
    [displayWith]="name"
  />`,
})
class Host {
  readonly supplier = new FormControl<Supplier | null>(null);
  readonly queries: string[] = [];
  readonly search = (q: string) => {
    this.queries.push(q);
    return of(suppliers.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())));
  };
  readonly name = (s: Supplier) => s.name;
}

describe('LookupPicker', () => {
  it('searches after a pause, takes the chosen option and rejects free text', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const host = fixture.componentInstance;
    const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;

    input.value = 'har';
    input.dispatchEvent(new Event('input'));
    input.value = 'hari';
    input.dispatchEvent(new Event('input'));
    // Typing faster than the 250 ms pause sends only the last text.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(host.queries).toEqual(['hari']);

    expect(host.supplier.errors).toEqual({ notFromList: true });
    expect(host.supplier.value).toBeNull();

    host.supplier.setValue(suppliers[0]);
    await fixture.whenStable();
    expect(input.value).toBe('Harinas del Bajío');
    expect(host.supplier.valid).toBe(true);
  });
});
