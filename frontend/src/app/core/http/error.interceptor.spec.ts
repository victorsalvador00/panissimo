import { HttpErrorResponse } from '@angular/common/http';
import { noticeFor } from './error.interceptor';

const problem = (status: number, extra: Record<string, unknown> = {}) =>
  new HttpErrorResponse({ status, error: { title: 'x', status, ...extra } });

describe('noticeFor', () => {
  it('leaves 400 to the form and 401 to the session', () => {
    expect(noticeFor(problem(400, { code: 'validation' }))).toBeNull();
    expect(noticeFor(problem(401))).toBeNull();
  });

  it('gives the fixed message for 403', () => {
    expect(noticeFor(problem(403))).toBe('No tienes permiso para esta acción.');
  });

  it('shows the backend detail for 404, 409 and 422', () => {
    expect(
      noticeFor(problem(422, { code: 'invalid_state', detail: 'La OC ya está cerrada.' })),
    ).toBe('La OC ya está cerrada.');
    expect(noticeFor(problem(409, { code: 'duplicate', detail: 'Registro duplicado.' }))).toBe(
      'Registro duplicado.',
    );
  });

  it('adds the trace id to server errors and explains network failures', () => {
    expect(
      noticeFor(problem(500, { detail: 'Ocurrió un error inesperado.', traceId: 'abc' })),
    ).toBe('Ocurrió un error inesperado. (Folio: abc)');
    expect(noticeFor(new HttpErrorResponse({ status: 0 }))).toContain('No hay conexión');
  });
});
