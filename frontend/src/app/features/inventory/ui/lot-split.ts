import {
  AbstractControl,
  FormControl,
  FormGroup,
  FormRecord,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';

/**
 * Reparto manual de una cantidad entre lotes (despacho de traspasos, consumo de producción). Sin
 * reparto, el backend usa FEFO (o el lote planeado).
 */

/** Redondeo a 4 decimales, como el backend. */
export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export type LotQty = FormGroup<{
  lotId: FormControl<string>;
  quantity: FormControl<number | null>;
}>;

export type LotSplit = FormGroup<{
  /** `false` = automático (FEFO o el lote planeado); `true` = reparto manual en `lots`. */
  manual: FormControl<boolean>;
  lots: FormRecord<LotQty>;
}>;

export function createLotQty(lotId: string): LotQty {
  return new FormGroup({
    lotId: new FormControl(lotId, { nonNullable: true }),
    quantity: new FormControl<number | null>(0),
  });
}

/**
 * En reparto manual, lo repartido entre lotes debe sumar la cantidad de la línea. La cantidad puede
 * cambiar mientras se captura (ej. el consumo real de producción): pásala como función.
 */
export function lotsSumValidator(expected: number | (() => number)): ValidatorFn {
  const target = typeof expected === 'function' ? expected : () => expected;
  return (control: AbstractControl): ValidationErrors | null => {
    const line = control as LotSplit;
    if (!line.controls.manual.value) {
      return null;
    }
    const total = lotsTotal(Object.values(line.controls.lots.getRawValue()));
    const value = round4(target());
    return total === value ? null : { lotsSum: { expected: value, total } };
  };
}

export function lotsTotal(lots: { quantity: number | null }[]): number {
  return round4(lots.reduce((sum, lot) => sum + (lot.quantity ?? 0), 0));
}

/** Lotes con cantidad > 0 del reparto, en la forma de las peticiones. */
export function chosenLots(
  lots: Record<string, { lotId: string; quantity: number | null }>,
): { lotId: string; quantity: number }[] {
  return Object.values(lots)
    .filter((lot) => (lot.quantity ?? 0) > 0)
    .map((lot) => ({ lotId: lot.lotId, quantity: lot.quantity! }));
}
