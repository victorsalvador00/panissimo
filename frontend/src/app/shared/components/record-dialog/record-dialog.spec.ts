import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { Notifier } from '../../../core/http/notifier';
import { RecordDialog, RecordDialogData } from './record-dialog';

function setup(data: Partial<RecordDialogData<unknown>>) {
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: { title: 'Prueba', value: {}, ...data } },
      { provide: MatDialogRef, useValue: { close } },
      { provide: Notifier, useValue: { error: vi.fn(), info: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(RecordDialog);
  return { fixture, close, element: fixture.nativeElement as HTMLElement };
}

const submit = (element: HTMLElement) =>
  (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();

describe('RecordDialog', () => {
  it('sends trimmed, upper-cased codes, numbers and null for empty optional fields', async () => {
    const save = vi.fn((value: Record<string, unknown>) => of(value));
    const { fixture, close, element } = setup({
      fields: [
        { key: 'code', label: 'Código', type: 'text', required: true, uppercase: true },
        { key: 'sortOrder', label: 'Orden', type: 'number', required: true },
        { key: 'address', label: 'Dirección', type: 'textarea' },
      ],
      value: { code: ' suc-03 ', sortOrder: '20' },
      save,
    });
    await fixture.whenStable();
    submit(element);
    await fixture.whenStable();

    expect(save).toHaveBeenCalledWith({ code: 'SUC-03', sortOrder: 20, address: null });
    expect(close).toHaveBeenCalledWith({ code: 'SUC-03', sortOrder: 20, address: null });
  });

  it('shows a field only when it applies, and does not send it otherwise', async () => {
    const save = vi.fn((value: Record<string, unknown>) => of(value));
    const { fixture, element } = setup({
      fields: [
        { key: 'type', label: 'Tipo', type: 'select', options: [] },
        {
          key: 'parentLocationId',
          label: 'Pertenece a',
          type: 'select',
          required: true,
          visibleWhen: (v) => v['type'] === 'Warehouse',
        },
      ],
      value: { type: 'Branch' },
      save,
    });
    await fixture.whenStable();
    expect(element.textContent).not.toContain('Pertenece a');

    submit(element);
    await fixture.whenStable();
    expect(save).toHaveBeenCalledWith({ type: 'Branch', parentLocationId: null });
  });

  it('keeps the dialog open and puts the 400 on its field', async () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: {
        title: 'Solicitud inválida',
        status: 400,
        code: 'validation',
        errors: { code: ['El código ya existe.'] },
      },
    });
    const { fixture, close, element } = setup({
      fields: [{ key: 'code', label: 'Código', type: 'text', required: true }],
      value: { code: 'PLANTA' },
      save: () => throwError(() => error),
    });
    await fixture.whenStable();
    submit(element);
    await fixture.whenStable();

    expect(close).not.toHaveBeenCalled();
    expect(element.querySelector('mat-error')?.textContent).toContain('El código ya existe.');
  });
});
