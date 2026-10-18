import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ConflictHandler, isConflictWithDialog } from './conflict-handler';
import { errorInterceptor } from './error.interceptor';
import { Notifier } from './notifier';
import { toProblem } from './problem-details';

const conflict = (code: string) =>
  new HttpErrorResponse({ status: 409, error: { title: 'x', status: 409, code, detail: 'd' } });

describe('ConflictHandler', () => {
  it('takes only the 409 that have a dialog', () => {
    expect(isConflictWithDialog(toProblem(conflict('concurrency')))).toBe(true);
    expect(isConflictWithDialog(toProblem(conflict('insufficient_stock')))).toBe(true);
    expect(isConflictWithDialog(toProblem(conflict('duplicate')))).toBe(false);
  });

  it('the error interceptor opens the dialog instead of a notice', async () => {
    const notifier = { error: vi.fn(), info: vi.fn() };
    const conflicts = { handle: vi.fn((error: unknown) => isConflictWithDialog(toProblem(error))) };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: Notifier, useValue: notifier },
        { provide: ConflictHandler, useValue: conflicts },
      ],
    });
    const http = TestBed.inject(HttpClient);
    const backend = TestBed.inject(HttpTestingController);

    const stale = firstValueFrom(http.put('/api/v1/items/1', {}));
    backend
      .expectOne('/api/v1/items/1')
      .flush(
        { title: 'Conflicto', status: 409, code: 'concurrency', detail: 'Cambió.' },
        { status: 409, statusText: 'Conflict' },
      );
    await expect(stale).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(conflicts.handle).toHaveBeenCalledOnce();
    expect(notifier.error).not.toHaveBeenCalled();

    const duplicate = firstValueFrom(http.post('/api/v1/items', {}));
    backend
      .expectOne('/api/v1/items')
      .flush(
        { title: 'Duplicado', status: 409, code: 'duplicate', detail: 'Ya existe.' },
        { status: 409, statusText: 'Conflict' },
      );
    await expect(duplicate).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(notifier.error).toHaveBeenCalledWith('Ya existe.');
  });
});
