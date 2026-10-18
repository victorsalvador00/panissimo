import { DOCUMENT, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { fromEvent, firstValueFrom } from 'rxjs';
import type { Schemas } from '../../../core/api/api';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { MxnPipe, QtyPipe } from '../../../shared/pipes/pipes';
import { CountsApi, PhysicalCount, PhysicalCountLine } from '../data-access/inventory-api';
import { AddCountLineDialog, AddCountLineResult } from '../ui/add-count-line-dialog';
import { CountAutosave } from '../ui/count-autosave';

type LineFilter = 'all' | 'pending' | 'counted';

/**
 * /inventario/conteos/:id (frontend §7.3, RN-06). Draft: start (snapshot) or cancel. In progress: blind capture by
 * cards (the expected quantity is not shown), fixed search, filters, autosave, "Agregar artículo", review of the
 * differences and close ("Faltan N" while lines are pending). Closed: the differences and the movements posted.
 */
@Component({
  selector: 'app-count-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    PageHeader,
    QtyInput,
    StatusTag,
    Stamp,
    QtyPipe,
    MxnPipe,
  ],
  templateUrl: './count-page.html',
  styleUrl: './count-page.scss',
  // Enter jumps to the next quantity; leaving a field saves what is pending.
  host: { '(keydown.enter)': 'nextQty($event)', '(focusout)': 'flushOnBlur()' },
})
export class CountPage {
  readonly id = input.required<string>();

  private readonly api = inject(CountsApi);
  private readonly confirmService = inject(ConfirmService);
  private readonly notifier = inject(Notifier);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  private readonly dialog = inject(MatDialog);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);

  protected readonly count = signal<PhysicalCount | null>(null);
  protected readonly view = signal<'capture' | 'review'>('capture');
  protected readonly search = new FormControl('', { nonNullable: true });
  private readonly searchText = signal('');
  protected readonly filter = signal<LineFilter>('all');
  protected readonly busy = signal(false);
  protected readonly onlyDifferences = signal(false);

  /** One control per line with what the counter typed; the autosave takes its changes. */
  private readonly controls = new Map<string, FormControl<number | null>>();
  /** Counted quantities as typed (signal, so the filters and "Faltan N" follow the typing). */
  private readonly typed = signal<Record<string, number | null>>({});
  protected autosave: CountAutosave<PhysicalCount> | null = null;

  private readonly loaded = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });

  protected readonly lines = computed(() => this.count()?.lines ?? []);
  protected readonly isCounted = (line: PhysicalCountLine) => this.countedOf(line) !== null;
  protected readonly pending = computed(
    () => this.lines().filter((l) => !this.isCounted(l)).length,
  );
  protected readonly countedTotal = computed(() => this.lines().length - this.pending());
  protected readonly visibleLines = computed(() => {
    const term = this.searchText().trim().toLowerCase();
    const filter = this.filter();
    return this.lines().filter((line) => {
      if (filter === 'pending' && this.isCounted(line)) return false;
      if (filter === 'counted' && !this.isCounted(line)) return false;
      return (
        !term ||
        line.sku.toLowerCase().includes(term) ||
        line.itemName.toLowerCase().includes(term) ||
        (line.lotNumber ?? '').toLowerCase().includes(term)
      );
    });
  });
  protected readonly reviewLines = computed(() =>
    this.lines()
      .map((line) => ({ line, counted: this.countedOf(line), difference: this.differenceOf(line) }))
      .filter((row) => !this.onlyDifferences() || (row.difference ?? 0) !== 0),
  );
  protected readonly differences = computed(
    () => this.lines().filter((l) => (this.differenceOf(l) ?? 0) !== 0).length,
  );

  constructor() {
    effect(() => {
      if (this.loaded.hasValue()) this.show(this.loaded.value());
    });
    this.search.valueChanges.pipe(takeUntilDestroyed()).subscribe((q) => this.searchText.set(q));
    // An app sent to the background (phone) saves what is pending.
    fromEvent(this.document, 'visibilitychange')
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.document.visibilityState === 'hidden') void this.autosave?.flush();
      });
    inject(DestroyRef).onDestroy(() => {
      void this.autosave?.flush();
      this.autosave?.dispose();
    });
  }

  protected control(line: PhysicalCountLine): FormControl<number | null> {
    let control = this.controls.get(line.id);
    if (!control) {
      control = new FormControl<number | null>(line.countedQty);
      this.controls.set(line.id, control);
      control.valueChanges.subscribe((value) => {
        this.typed.update((typed) => ({ ...typed, [line.id]: value }));
        this.autosave?.change(line.id, value);
      });
    }
    return control;
  }

  protected countedOf(line: PhysicalCountLine): number | null {
    const typed = this.typed();
    return line.id in typed ? typed[line.id] : line.countedQty;
  }

  protected differenceOf(line: PhysicalCountLine): number | null {
    const counted = this.countedOf(line);
    return counted === null ? null : counted - line.snapshotQty;
  }

  protected flushOnBlur(): void {
    void this.autosave?.flush();
  }

  /** Enter goes to the next quantity (frontend §4.3). */
  protected nextQty(event: Event): void {
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

  protected async start(): Promise<void> {
    const count = this.count();
    if (!count) return;
    const confirmed = await this.confirmService.confirm({
      title: 'Iniciar conteo',
      message:
        'Se toma la existencia actual de cada artículo de la ubicación. Durante el conteo no se muestra lo esperado: captura lo que cuentes.',
      confirmLabel: 'Iniciar conteo',
    });
    if (confirmed) await this.run(() => this.api.start(count.id, count.version));
  }

  protected async cancel(): Promise<void> {
    const count = this.count();
    if (!count) return;
    const confirmed = await this.confirmService.confirm({
      title: 'Cancelar conteo',
      message: 'El conteo se descarta y no se registra ninguna diferencia.',
      confirmLabel: 'Cancelar conteo',
      cancelLabel: 'Volver',
      destructive: true,
    });
    if (confirmed) {
      await this.autosave?.flush();
      await this.run(() => this.api.cancel(count.id, this.count()!.version));
    }
  }

  protected async addLine(): Promise<void> {
    const count = this.count();
    if (!count) return;
    const result = await firstValueFrom(
      this.dialog
        .open<AddCountLineDialog, undefined, AddCountLineResult>(AddCountLineDialog, {
          width: '480px',
          maxWidth: '95vw',
        })
        .afterClosed(),
    );
    if (!result) return;
    await this.autosave?.flush();
    const request: Schemas['AddCountLineRequest'] = { version: this.count()!.version, ...result };
    if (await this.run(() => this.api.addLine(count.id, request))) {
      this.filter.set('all');
      this.search.setValue('');
      this.notifier.info('Artículo agregado al conteo.');
    }
  }

  protected async review(): Promise<void> {
    await this.autosave?.flush();
    this.view.set('review');
  }

  protected async close(): Promise<void> {
    const count = this.count();
    if (!count || this.pending() > 0) return;
    const confirmed = await this.confirmService.confirm({
      title: 'Cerrar conteo',
      message:
        'Se registra un ajuste por la diferencia de cada línea (contado − existencia al iniciar).',
      summary: [
        { label: 'Líneas', value: String(this.lines().length) },
        { label: 'Con diferencia', value: String(this.differences()) },
      ],
      confirmLabel: 'Cerrar conteo',
    });
    if (!confirmed) return;
    await this.autosave?.flush();
    if (this.autosave?.state() === 'error') return;
    if (await this.run(() => this.api.close(count.id, this.count()!.version)))
      this.notifier.info(`Conteo ${count.folio} cerrado.`);
  }

  protected retrySave(): void {
    void this.autosave?.flush();
  }

  /** Runs a state change and shows the returned count; false when it failed (the interceptor said why). */
  private async run(action: () => ReturnType<CountsApi['start']>): Promise<boolean> {
    this.busy.set(true);
    try {
      this.show(await firstValueFrom(action()));
      return true;
    } catch {
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  private show(count: PhysicalCount): void {
    this.count.set(count);
    this.breadcrumbs.setCurrent(count.folio);
    if (count.status !== 'InProgress') {
      this.view.set('capture');
      return;
    }
    if (!this.autosave)
      this.autosave = new CountAutosave<PhysicalCount>(
        count.version,
        (version, counts) =>
          firstValueFrom(
            this.api.update(count.id, {
              version,
              categoryId: count.categoryId,
              notes: count.notes,
              counts: [...counts].map(([lineId, countedQty]) => ({
                lineId,
                itemId: null,
                lotId: null,
                lotNumber: null,
                expirationDate: null,
                countedQty,
              })),
            }),
          ),
        (saved) => this.count.set(saved),
      );
    else this.autosave.setVersion(count.version);
  }
}
