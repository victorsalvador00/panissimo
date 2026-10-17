import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { Notifier } from '../../core/http/notifier';
import { FormErrors, applyServerErrors, toControlPath } from './form-errors';

function documentForm() {
  return new FormGroup({
    notes: new FormControl(''),
    lines: new FormArray([0, 1, 2].map(() => new FormGroup({ quantity: new FormControl(1) }))),
  });
}

function badRequest(errors?: Record<string, string[]>) {
  return new HttpErrorResponse({
    status: 400,
    error: {
      title: 'Solicitud inválida',
      status: 400,
      code: 'validation',
      detail: 'Datos inválidos.',
      errors,
    },
  });
}

describe('FormErrors', () => {
  const notifier = { error: vi.fn(), info: vi.fn() };

  beforeEach(() => {
    notifier.error.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: Notifier, useValue: notifier }] });
  });

  it('maps camelCase keys with indexes to control paths', () => {
    expect(toControlPath('lines[2].quantity')).toEqual(['lines', 2, 'quantity']);
    expect(toControlPath('Notes')).toEqual(['notes']);
  });

  it('puts each 400 message on its control, lines included', () => {
    const form = documentForm();
    const unmatched = applyServerErrors(form, {
      notes: ['Máximo 500 caracteres.'],
      'lines[2].quantity': ['La cantidad debe ser mayor que 0.'],
      version: ['Falta la versión.'],
    });
    expect(form.controls.notes.errors).toEqual({ server: 'Máximo 500 caracteres.' });
    expect(form.controls.notes.touched).toBe(true);
    expect(form.controls.lines.at(2).controls.quantity.errors).toEqual({
      server: 'La cantidad debe ser mayor que 0.',
    });
    expect(form.controls.lines.at(0).controls.quantity.errors).toBeNull();
    expect(unmatched).toEqual(['Falta la versión.']);
  });

  it('sends what matches no control to a notice', () => {
    const handled = TestBed.inject(FormErrors).apply(
      documentForm(),
      badRequest({ '': ['El documento no tiene líneas.'] }),
    );
    expect(handled).toBe(true);
    expect(notifier.error).toHaveBeenCalledWith('El documento no tiene líneas.');
  });

  it('shows the detail of a 400 without errors and ignores other statuses', () => {
    const formErrors = TestBed.inject(FormErrors);
    expect(formErrors.apply(documentForm(), badRequest())).toBe(true);
    expect(notifier.error).toHaveBeenCalledWith('Datos inválidos.');

    notifier.error.mockReset();
    expect(formErrors.apply(documentForm(), new HttpErrorResponse({ status: 422 }))).toBe(false);
    expect(notifier.error).not.toHaveBeenCalled();
  });
});
