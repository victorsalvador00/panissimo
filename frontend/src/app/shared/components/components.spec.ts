import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { DateAdapter } from '@angular/material/core';
import { EsMxDateAdapter, provideAppDates } from '../../core/i18n/date-adapter';
import { ConcurrencyDialog } from './concurrency-dialog/concurrency-dialog';
import { ConflictHandler } from './dialogs.service';
import { ShortagesDialog } from './shortages-dialog/shortages-dialog';
import { Plexus } from './plexus/plexus';
import { Stamp } from './stamp/stamp';
import { StatusTag, statusColor } from './status-tag/status-tag';

describe('app-status-tag', () => {
  it('usa los colores de la spec §4', () => {
    expect(statusColor('Draft')).toBe('gray');
    expect(statusColor('Released')).toBe('blue');
    expect(statusColor('Dispatched')).toBe('yellow');
    expect(statusColor('Posted')).toBe('green');
    expect(statusColor('ReceivedWithDiscrepancies')).toBe('orange');
    expect(statusColor('Rejected')).toBe('red');
  });

  it('muestra la etiqueta en español con su color', async () => {
    const fixture = TestBed.createComponent(StatusTag);
    fixture.componentRef.setInput('status', 'PendingApproval');
    fixture.componentRef.setInput('kind', 'PurchaseOrderStatus');
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toBe('Por aprobar');
    expect(el.classList).toContain('tag-yellow');
  });
});

describe('app-stamp', () => {
  async function render(at: string | null, by: string | null): Promise<string> {
    const fixture = TestBed.createComponent(Stamp);
    fixture.componentRef.setInput('at', at);
    fixture.componentRef.setInput('by', by);
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ').trim();
  }

  it('muestra la fecha y quién hizo el paso', async () => {
    expect(await render('2026-10-06T14:30:00', 'Laura Méndez')).toMatch(
      /^06\/10\/2026 14:30 · Laura Méndez$/,
    );
  });

  it('sin nombre muestra solo la fecha; sin fecha, un guion', async () => {
    expect(await render('2026-10-06T14:30:00', null)).toBe('06/10/2026 14:30');
    expect(await render(null, null)).toBe('—');
  });
});

describe('ConflictHandler', () => {
  let open: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    open = vi.fn().mockReturnValue({ afterClosed: () => of(true) });
    TestBed.configureTestingModule({ providers: [{ provide: MatDialog, useValue: { open } }] });
  });

  const conflict = (error: object) => new HttpErrorResponse({ status: 409, error });

  it('409 insufficient_stock abre el diálogo de faltantes', () => {
    const shortages = [
      { itemId: 'a', sku: 'X', name: 'X', lotId: null, requested: 2, available: 1 },
    ];
    const handled = TestBed.inject(ConflictHandler).handle(
      conflict({ status: 409, code: 'insufficient_stock', shortages }),
    );

    expect(handled).toBe(true);
    expect(open).toHaveBeenCalledWith(
      ShortagesDialog,
      expect.objectContaining({ data: expect.objectContaining({ shortages }) }),
    );
  });

  it('409 concurrency ofrece recargar y llama a reload', () => {
    const reload = vi.fn();
    const handled = TestBed.inject(ConflictHandler).handle(
      conflict({ status: 409, code: 'concurrency' }),
      { reload },
    );

    expect(handled).toBe(true);
    expect(open).toHaveBeenCalledWith(ConcurrencyDialog, expect.anything());
    expect(reload).toHaveBeenCalled();
  });

  it('otros errores los deja a la pantalla', () => {
    const handled = TestBed.inject(ConflictHandler).handle(
      new HttpErrorResponse({ status: 422, error: { code: 'po_not_approved' } }),
    );
    expect(handled).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});

describe('EsMxDateAdapter', () => {
  let adapter: EsMxDateAdapter;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppDates()] });
    adapter = TestBed.inject(DateAdapter) as EsMxDateAdapter;
  });

  it('interpreta dd/MM/yyyy', () => {
    const date = adapter.parse('05/09/2026')!;
    expect([date.getDate(), date.getMonth(), date.getFullYear()]).toEqual([5, 8, 2026]);
  });

  it('rechaza fechas imposibles y acepta vacío', () => {
    expect(adapter.isValid(adapter.parse('31/02/2026')!)).toBe(false);
    expect(adapter.isValid(adapter.parse('hola')!)).toBe(false);
    expect(adapter.parse('')).toBeNull();
  });

  it('muestra dd/MM/yyyy en el campo y la semana empieza en lunes', () => {
    expect(
      adapter.format(new Date(2026, 8, 5), { year: 'numeric', month: '2-digit', day: '2-digit' }),
    ).toBe('05/09/2026');
    expect(adapter.getFirstDayOfWeek()).toBe(1);
  });
});

describe('app-plexus', () => {
  it('es decorativo y no falla sin canvas (jsdom)', async () => {
    const fixture = TestBed.createComponent(Plexus);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('canvas')).not.toBeNull();
  });
});
