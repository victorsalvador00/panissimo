import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { applyServerErrors, toControlPath } from './server-errors';

describe('applyServerErrors (400 → controles)', () => {
  function buildForm() {
    return new FormGroup({
      reason: new FormControl('Correction'),
      lines: new FormArray(
        [0, 1, 2].map(
          () => new FormGroup({ itemId: new FormControl('x'), quantity: new FormControl(0) }),
        ),
      ),
    });
  }

  it('convierte la clave del backend en ruta de controles', () => {
    expect(toControlPath('lines[2].quantity')).toEqual(['lines', 2, 'quantity']);
    expect(toControlPath('Lines[0].ItemId')).toEqual(['lines', 0, 'itemId']);
    expect(toControlPath('reason')).toEqual(['reason']);
  });

  it('asigna los errores a los controles, incluidas las líneas', () => {
    const form = buildForm();

    const unmapped = applyServerErrors(form, {
      status: 400,
      errors: {
        reason: ['El motivo es obligatorio.'],
        'lines[2].quantity': ['La cantidad no puede ser cero.'],
      },
    });

    expect(unmapped).toEqual([]);
    expect(form.get('reason')?.getError('server')).toBe('El motivo es obligatorio.');
    expect(form.get(['lines', 2, 'quantity'])?.getError('server')).toBe(
      'La cantidad no puede ser cero.',
    );
    expect(form.get(['lines', 2, 'quantity'])?.touched).toBe(true);
    expect(form.get(['lines', 0, 'quantity'])?.errors).toBeNull();
  });

  it('devuelve los mensajes que no corresponden a ningún control', () => {
    const form = buildForm();

    const unmapped = applyServerErrors(form, {
      errors: { locationId: ['No tienes acceso a esa ubicación.'], 'lines[9].quantity': ['Mal.'] },
    });

    expect(unmapped).toEqual(['No tienes acceso a esa ubicación.', 'Mal.']);
  });

  it('sin `errors` devuelve el detail', () => {
    expect(applyServerErrors(buildForm(), { detail: 'Solicitud inválida.' })).toEqual([
      'Solicitud inválida.',
    ]);
  });
});
