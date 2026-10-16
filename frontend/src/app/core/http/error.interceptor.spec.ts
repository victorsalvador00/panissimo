import { HttpClient, HttpContext } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpTesting } from '../auth/testing';
import { MESSAGES, SKIP_ERROR_TOAST } from './error.interceptor';
import { Notifier } from './notifier.service';

describe('errorInterceptor', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  let notify: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    notify = vi.fn();
    TestBed.configureTestingModule({
      providers: [...provideHttpTesting(), { provide: Notifier, useValue: { error: notify } }],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
  });

  afterEach(() => http.verify());

  function fail(status: number, body: object | null = null, context?: HttpContext): unknown {
    let received: unknown;
    client.get('/items', { context }).subscribe({ error: (e) => (received = e) });
    http.expectOne('/api/v1/items').flush(body, { status, statusText: 'x' });
    return received;
  }

  it('403 avisa que no hay permiso', () => {
    fail(403);
    expect(notify).toHaveBeenCalledWith(MESSAGES.forbidden);
  });

  it('422 avisa con el detail del backend', () => {
    fail(422, { code: 'po_not_approved', detail: 'La orden no está aprobada.' });
    expect(notify).toHaveBeenCalledWith('La orden no está aprobada.');
  });

  it('500 avisa con el traceId para soporte', () => {
    fail(500, { traceId: 'abc:123' });
    expect(notify).toHaveBeenCalledWith(`${MESSAGES.unexpected} Código para soporte: abc:123`);
  });

  it('error de red avisa que no hay conexión', () => {
    client.get('/items').subscribe({ error: () => undefined });
    http.expectOne('/api/v1/items').error(new ProgressEvent('error'));
    expect(notify).toHaveBeenCalledWith(MESSAGES.network);
  });

  it('400 y 409 se reenvían al componente sin aviso', () => {
    const error = fail(400, { errors: { name: ['Obligatorio.'] } });
    fail(409, { code: 'insufficient_stock', shortages: [] });
    expect(notify).not.toHaveBeenCalled();
    expect(error).toBeTruthy();
  });

  it('SKIP_ERROR_TOAST deja el aviso a la pantalla', () => {
    fail(403, null, new HttpContext().set(SKIP_ERROR_TOAST, true));
    expect(notify).not.toHaveBeenCalled();
  });
});
