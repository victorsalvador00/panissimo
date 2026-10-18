import { BreakpointObserver } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  TemplateRef,
  booleanAttribute,
  contentChildren,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, ValidationErrors, ValidatorFn } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Subscription, map } from 'rxjs';

/** Context of a line column: the line's control and its index. */
export interface LineContext<T extends AbstractControl = AbstractControl> {
  $implicit: T;
  index: number;
}

/**
 * A column of the lines editor: `<ng-template appLineColumn="qty" header="Cantidad" [appLineColumnOf]="lines"
 * let-line let-i="index">`. `appLineColumnOf` (the same FormArray) only types `line` in the template.
 */
@Directive({ selector: 'ng-template[appLineColumn]' })
export class LineColumn<C extends AbstractControl = AbstractControl> {
  readonly name = input.required<string>({ alias: 'appLineColumn' });
  readonly appLineColumnOf = input<FormArray<C> | null>(null);
  readonly header = input('');
  /** CSS width of the column on desktop (`8rem`, `30%`); flexible by default. */
  readonly width = input<string | null>(null);
  readonly template = inject<TemplateRef<LineContext>>(TemplateRef);

  static ngTemplateContextGuard<C extends AbstractControl>(
    _dir: LineColumn<C>,
    _ctx: unknown,
  ): _ctx is LineContext<C> {
    return true;
  }
}

/**
 * Editable document lines (frontend §8) over a FormArray: one row per line on desktop and one card per line on
 * phones, add and remove buttons, the array errors (`minLinesValidator`, `uniqueLinesValidator`) and a footer for
 * totals (`[linesFooter]`). Enter in a quantity jumps to the next one (frontend §4.3).
 */
@Component({
  selector: 'app-lines-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, MatButtonModule, MatIconModule],
  templateUrl: './lines-editor.html',
  styleUrl: './lines-editor.scss',
  host: { '(keydown.enter)': 'focusNextQty($event)' },
})
export class LinesEditor {
  readonly lines = input.required<FormArray>();
  /** Creates the control of a new line. */
  readonly newLine = input.required<() => AbstractControl>();
  readonly addLabel = input('Agregar línea');
  /** Lines that cannot be removed (the remove button disables at this count). */
  readonly minLines = input(1);
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly added = output<number>();

  protected readonly columns = contentChildren(LineColumn);
  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 767.98px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Lines added or removed by the page (not by these buttons) also repaint the editor.
    const changeDetector = inject(ChangeDetectorRef);
    const destroyRef = inject(DestroyRef);
    let subscription: Subscription | undefined;
    effect(() => {
      subscription?.unsubscribe();
      subscription = this.lines()
        .events.pipe(takeUntilDestroyed(destroyRef))
        .subscribe(() => changeDetector.markForCheck());
    });
  }

  protected add(): void {
    this.lines().push(this.newLine()());
    this.added.emit(this.lines().length - 1);
  }

  protected remove(index: number): void {
    this.lines().removeAt(index);
    this.lines().markAsDirty();
  }

  protected arrayErrors(): string[] {
    const errors = this.lines().errors;
    if (!errors || !(this.lines().touched || this.lines().dirty)) return [];
    const messages: string[] = [];
    if (errors['minLines']) {
      const min = (errors['minLines'] as { min: number }).min;
      messages.push(min === 1 ? 'Agrega al menos una línea.' : `Agrega al menos ${min} líneas.`);
    }
    if (errors['duplicateLines']) {
      const lines = (errors['duplicateLines'] as { lines: number[] }).lines;
      messages.push(`Hay líneas repetidas: ${lines.join(', ')}.`);
    }
    return messages;
  }

  protected focusNextQty(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target?.classList.contains('pan-qty-input')) return;
    const inputs = [
      ...this.host.nativeElement.querySelectorAll<HTMLInputElement>('input.pan-qty-input'),
    ];
    const next = inputs[inputs.indexOf(target as HTMLInputElement) + 1];
    if (next) {
      event.preventDefault();
      next.focus();
      next.select();
    }
  }
}

/** At least `min` lines. */
export function minLinesValidator(min = 1): ValidatorFn {
  return (array: AbstractControl): ValidationErrors | null =>
    array instanceof FormArray && array.length < min ? { minLines: { min } } : null;
}

/**
 * No two lines with the same key (an item, an item + lot). Lines without a key are ignored. The error lists the line
 * numbers (1-based) that repeat.
 */
export function uniqueLinesValidator(
  key: (line: AbstractControl) => string | null | undefined,
): ValidatorFn {
  return (array: AbstractControl): ValidationErrors | null => {
    if (!(array instanceof FormArray)) return null;
    const seen = new Map<string, number[]>();
    array.controls.forEach((line, index) => {
      const value = key(line);
      if (value) seen.set(value, [...(seen.get(value) ?? []), index + 1]);
    });
    const repeated = [...seen.values()].filter((indexes) => indexes.length > 1).flat();
    return repeated.length > 0
      ? { duplicateLines: { lines: repeated.sort((a, b) => a - b) } }
      : null;
  };
}
