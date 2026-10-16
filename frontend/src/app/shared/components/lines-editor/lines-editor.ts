import { BreakpointObserver } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  Directive,
  ElementRef,
  inject,
  Injector,
  input,
  LOCALE_ID,
  TemplateRef,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { map, startWith, switchMap } from 'rxjs';
import { formatMxn } from '../../pipes/mxn.pipe';
import { formatQty } from '../../pipes/qty.pipe';
import { linesErrorMessage } from './lines-validators';

export interface LineContext<L extends AbstractControl = AbstractControl> {
  $implicit: L;
  index: number;
}

/**
 * Columna del editor:
 * `<ng-template appLineColumn="Cantidad" [appLineColumnOf]="lines" let-line let-i="index">…</ng-template>`.
 * `appLineColumnOf` (el mismo FormArray) solo sirve para tipar `line` en la plantilla, así
 * `line.controls.quantity` se verifica al compilar.
 */
@Directive({ selector: 'ng-template[appLineColumn]' })
export class LineColumnDef<L extends AbstractControl = AbstractControl> {
  readonly header = input.required<string>({ alias: 'appLineColumn' });
  readonly appLineColumnOf = input<FormArray<L>>();
  /** Ancho CSS de la columna en escritorio (ej. `160px`). */
  readonly width = input<string>();
  readonly align = input<'start' | 'end'>('start');
  readonly template = inject(TemplateRef);

  static ngTemplateContextGuard<L extends AbstractControl>(
    _dir: LineColumnDef<L>,
    _ctx: unknown,
  ): _ctx is LineContext<L> {
    return true;
  }
}

/**
 * Tabla editable de líneas de documento (spec frontend §8): agregar, quitar, validar y totales.
 * En celular cada línea es una tarjeta. Las validaciones del arreglo (mínimo de líneas, repetidas)
 * van en el `FormArray` con `minLinesValidator` / `uniqueLinesValidator`.
 */
@Component({
  selector: 'app-lines-editor',
  imports: [NgTemplateOutlet, MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lines-editor.html',
  styleUrl: './lines-editor.scss',
})
export class LinesEditor<L extends AbstractControl = AbstractControl> {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);
  private readonly locale = inject(LOCALE_ID);

  readonly lines = input.required<FormArray<L>>();
  readonly createLine = input.required<() => L>();
  readonly addLabel = input('Agregar línea');
  readonly readonly = input(false);
  /** Nunca se quitan líneas por debajo de este número (ej. 1). */
  readonly minLines = input(0);
  readonly totalLabel = input('Total');
  readonly total = input<((values: ReturnType<L['getRawValue']>[]) => number) | null>(null);
  readonly totalFormat = input<'qty' | 'mxn'>('mxn');
  readonly totalUnit = input<string | null>(null);

  protected readonly columns = contentChildren(LineColumnDef);

  protected readonly isMobile = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 767.98px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  /** Se reevalúa con cada cambio del arreglo (valores, líneas agregadas o quitadas, estado). */
  private readonly snapshot = toSignal(
    toObservable(this.lines).pipe(
      switchMap((array) =>
        array.events.pipe(
          startWith(null),
          map(() => ({ values: array.getRawValue(), controls: [...array.controls] })),
        ),
      ),
    ),
  );

  protected readonly controls = computed(() => this.snapshot()?.controls ?? []);

  protected readonly totalText = computed(() => {
    const fn = this.total();
    const values = this.snapshot()?.values;
    if (!fn || !values) {
      return null;
    }
    const value = fn(values as ReturnType<L['getRawValue']>[]);
    return this.totalFormat() === 'qty'
      ? formatQty(value, this.locale, this.totalUnit())
      : formatMxn(value, this.locale);
  });

  protected readonly arrayError = computed(() => {
    this.snapshot();
    const array = this.lines();
    return array.touched || array.dirty ? linesErrorMessage(array.errors) : '';
  });

  protected add(): void {
    const array = this.lines();
    array.push(this.createLine()());
    array.markAsDirty();
    const index = array.length - 1;
    afterNextRender(() => this.focusLine(index), { injector: this.injector });
  }

  protected remove(index: number): void {
    const array = this.lines();
    if (array.length <= this.minLines()) {
      return;
    }
    array.removeAt(index);
    array.markAsDirty();
    array.markAsTouched();
  }

  protected canRemove(): boolean {
    return !this.readonly() && this.controls().length > this.minLines();
  }

  private focusLine(index: number): void {
    const row = this.host.nativeElement.querySelectorAll<HTMLElement>('[data-line]')[index];
    row?.querySelector<HTMLElement>('input, mat-select, textarea')?.focus();
  }
}
