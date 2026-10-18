import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { QtyInput } from '../qty-input/qty-input';
import { LineColumn, LinesEditor, minLinesValidator, uniqueLinesValidator } from './lines-editor';

const line = (item: string | null = null, qty: number | null = null) =>
  new FormGroup({ item: new FormControl(item), qty: new FormControl(qty) });

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LinesEditor, LineColumn, QtyInput, ReactiveFormsModule],
  template: `
    <app-lines-editor [lines]="lines" [newLine]="newLine">
      <ng-template
        appLineColumn="qty"
        header="Cantidad"
        [appLineColumnOf]="lines"
        let-line
        let-i="index"
      >
        <app-qty-input [formControl]="line.controls.qty" [ariaLabel]="'Cantidad ' + (i + 1)" />
      </ng-template>
    </app-lines-editor>
  `,
})
class Host {
  readonly lines = new FormArray([line('a', 1), line('b', 2)], minLinesValidator(1));
  readonly newLine = () => line();
}

describe('lines validators', () => {
  it('requires a minimum of lines', () => {
    expect(new FormArray([], minLinesValidator(1)).errors).toEqual({ minLines: { min: 1 } });
    expect(new FormArray([line()], minLinesValidator(1)).errors).toBeNull();
  });

  it('lists the repeated lines, ignoring lines without a key', () => {
    const lines = new FormArray([line('a'), line('b'), line('a'), line(), line()], {
      validators: uniqueLinesValidator((l) => l.value.item),
    });
    expect(lines.errors).toEqual({ duplicateLines: { lines: [1, 3] } });
  });
});

describe('LinesEditor', () => {
  it('adds and removes lines, but not below the minimum', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const host = fixture.componentInstance;

    (element.querySelector('.footer button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(host.lines.length).toBe(3);
    expect(element.querySelectorAll('tbody tr').length).toBe(3);

    (element.querySelector('[aria-label="Quitar línea 1"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(host.lines.value.map((l) => l.item)).toEqual(['b', null]);

    host.lines.removeAt(1);
    await fixture.whenStable();
    expect(
      (element.querySelector('[aria-label="Quitar línea 1"]') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('repaints when the page changes the lines', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    fixture.componentInstance.lines.push(line('c', 3));
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr').length).toBe(3);
  });

  it('Enter in a quantity jumps to the next one', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const inputs = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(
      'input.pan-qty-input',
    );
    inputs[0].focus();
    inputs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.activeElement).toBe(inputs[1]);
  });
});
