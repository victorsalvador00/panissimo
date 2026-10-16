import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  LOCALE_ID,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { debounceTime, filter, firstValueFrom, map, Subject } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier.service';
import { toProblem } from '../../../core/http/problem-details';
import { AuditPanel } from '../../../shared/components/audit-panel/audit-panel';
import { ConfirmService, ConflictHandler } from '../../../shared/components/dialogs.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { MxnPipe } from '../../../shared/pipes/mxn.pipe';
import { formatQty, QtyPipe } from '../../../shared/pipes/qty.pipe';
import { CategoriesApi } from '../../catalog/data-access/categories.api';
import {
  CountInput,
  PhysicalCountDto,
  PhysicalCountLine,
  PhysicalCountsApi,
} from '../data-access/physical-counts.api';
import { AddCountLineDialog } from '../ui/add-count-line-dialog';
import {
  CountFilter,
  countProgress,
  countUpdateRequest,
  filterLines,
  linesWithDifference,
  PendingCounts,
  toCountInputs,
} from '../ui/count-lines';
import { Stamp } from '../../../shared/components/stamp/stamp';

type SaveState = 'saved' | 'pending' | 'saving' | 'error';

/** Espera tras la última tecla antes de guardar la captura. */
export const AUTOSAVE_DELAY_MS = 1000;

/**
 * Conteo físico (spec frontend §7.3, RN-06): borrador → iniciar (snapshot) → capturar lo contado
 * (se guarda solo) → revisar diferencias → cerrar. La captura es "a ciegas": la existencia del
 * sistema solo se ve al revisar, para no influir en lo que se cuenta.
 */
@Component({
  selector: 'app-count-detail-page',
  imports: [
    Stamp,
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    PageHeader,
    StatusTag,
    QtyInput,
    AuditPanel,
    QtyPipe,
    MxnPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './count-detail-page.html',
  styleUrl: './count-detail-page.scss',
})
export class CountDetailPage {
  private readonly api = inject(PhysicalCountsApi);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly dialog = inject(MatDialog);
  private readonly confirmService = inject(ConfirmService);
  private readonly conflicts = inject(ConflictHandler);
  private readonly notifier = inject(Notifier);
  private readonly locale = inject(LOCALE_ID);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly id = input.required<string>();

  protected readonly canCount = inject(AuthService).can('inventory.count');
  protected readonly count = signal<PhysicalCountDto | null>(null);
  protected readonly loadError = signal(false);
  protected readonly busy = signal(false);
  protected readonly saveState = signal<SaveState>('saved');
  protected readonly reviewing = signal(false);
  protected readonly search = signal('');
  protected readonly filter = signal<CountFilter>('all');

  protected readonly draftForm = new FormGroup({
    categoryId: new FormControl<string | null>(null),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
  });

  protected readonly categories = rxResource({
    stream: () =>
      this.categoriesApi.list({ page: 1, pageSize: 100 }).pipe(map((page) => page.items)),
  });

  protected readonly categoryName = computed(() => {
    const categoryId = this.count()?.categoryId;
    if (!categoryId) {
      return 'Todas las categorías';
    }
    return this.categories.value()?.find((c) => c.id === categoryId)?.name ?? 'Categoría';
  });

  protected readonly editable = computed(
    () => this.canCount && this.count()?.status === 'InProgress',
  );

  /** Cantidades por línea (captura). */
  private readonly controls = new Map<string, FormControl<number | null>>();
  private readonly pending = new PendingCounts();
  /** Cambia cada vez que cambia `pending` (el mapa no es un signal). */
  private readonly pendingTick = signal(0);
  private readonly edits = new Subject<void>();
  /** Guardados en serie: cada uno usa la versión que devolvió el anterior. */
  private saveChain: Promise<boolean> = Promise.resolve(true);

  protected readonly lines = computed(() => this.count()?.lines ?? []);
  protected readonly visibleLines = computed(() => {
    this.pendingTick();
    return filterLines(this.lines(), this.search(), this.filter(), this.pending.view);
  });
  protected readonly progress = computed(() => {
    this.pendingTick();
    return countProgress(this.lines(), this.pending.view);
  });
  protected readonly differences = computed(() => linesWithDifference(this.lines()));

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
    this.edits
      .pipe(debounceTime(AUTOSAVE_DELAY_MS), takeUntilDestroyed())
      .subscribe(() => void this.flush());

    // En celular, cambiar de app o bloquear la pantalla no debe perder lo capturado.
    const onHidden = () => document.visibilityState === 'hidden' && void this.flush();
    document.addEventListener('visibilitychange', onHidden);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', onHidden);
      void this.flush();
    });
  }

  protected control(lineId: string): FormControl<number | null> {
    return this.controls.get(lineId)!;
  }

  protected isCounted(line: PhysicalCountLine): boolean {
    this.pendingTick();
    return (this.pending.view.get(line.id) ?? line.countedQty) !== null;
  }

  protected setFilter(value: CountFilter | null): void {
    this.filter.set(value ?? 'all');
  }

  // --- Borrador ---

  protected saveDraft(): void {
    void this.saveDraftAsync().then((count) => count && this.notifier.success('Conteo guardado.'));
  }

  protected async start(): Promise<void> {
    const draft = await this.saveDraftAsync();
    if (!draft) {
      return;
    }
    await this.run(this.api.start(draft.id, draft.version), (count) =>
      this.notifier.success(
        `Conteo iniciado con ${count.lines.length} ${count.lines.length === 1 ? 'línea' : 'líneas'}.`,
      ),
    );
  }

  private async saveDraftAsync(): Promise<PhysicalCountDto | null> {
    const count = this.count();
    if (!count || this.draftForm.invalid) {
      this.draftForm.markAllAsTouched();
      return null;
    }
    if (this.draftForm.pristine) {
      return count;
    }
    const value = this.draftForm.getRawValue();
    return this.run(
      this.api.update(count.id, {
        version: count.version,
        categoryId: value.categoryId,
        notes: value.notes.trim() || null,
        counts: null,
      }),
    );
  }

  // --- Captura ---

  /** Guarda de inmediato lo pendiente (al salir de un campo, antes de revisar o agregar). */
  protected flush(): Promise<boolean> {
    this.saveChain = this.saveChain.then(() => this.saveOnce());
    return this.saveChain;
  }

  private async saveOnce(): Promise<boolean> {
    const count = this.count();
    if (!count || count.status !== 'InProgress' || this.pending.size === 0) {
      return this.saveState() !== 'error';
    }
    const sent = this.pending.take();
    this.saveState.set('saving');
    try {
      const updated = await firstValueFrom(
        this.api.update(count.id, countUpdateRequest(count, toCountInputs(sent))),
      );
      this.pending.ack(sent);
      this.pendingTick.update((tick) => tick + 1);
      this.apply(updated);
      this.saveState.set(this.pending.size ? 'pending' : 'saved');
      return true;
    } catch (error) {
      this.saveState.set('error');
      this.handleError(error);
      return false;
    }
  }

  protected addLine(): void {
    this.dialog
      .open<AddCountLineDialog, void, CountInput>(AddCountLineDialog, {
        width: '520px',
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed()
      .pipe(filter(Boolean))
      .subscribe(async (input) => {
        if (!(await this.flush())) {
          return;
        }
        const count = this.count()!;
        const updated = await this.run(
          this.api.update(count.id, countUpdateRequest(count, [input])),
        );
        if (updated) {
          this.notifier.success('Artículo agregado al conteo.');
        }
      });
  }

  // --- Revisión y cierre ---

  protected async review(): Promise<void> {
    if (!(await this.flush())) {
      return;
    }
    if (this.progress().missing > 0) {
      this.filter.set('pending');
      this.search.set('');
      return;
    }
    this.reviewing.set(true);
    this.host.nativeElement.scrollIntoView?.({ block: 'start' });
  }

  protected backToCapture(): void {
    this.reviewing.set(false);
  }

  protected close(): void {
    const count = this.count();
    if (!count) {
      return;
    }
    const differences = this.differences();
    this.confirmService
      .confirm({
        title: `¿Cerrar el conteo ${count.folio}?`,
        message: differences.length
          ? 'Se ajustará la existencia a lo contado. Un conteo cerrado no se puede reabrir.'
          : 'No hay diferencias: la existencia no cambia. Un conteo cerrado no se puede reabrir.',
        items: [
          { label: 'Líneas contadas', value: String(count.lines.length) },
          { label: 'Con diferencia', value: String(differences.length) },
        ],
        lines: differences.length
          ? {
              headers: ['Artículo', 'Lote', 'Diferencia'],
              rows: differences.map((line) => [
                `${line.sku} · ${line.itemName}`,
                line.lotNumber ?? '—',
                this.signedQty(line.difference ?? 0, line.baseUomCode),
              ]),
              alignEnd: [2],
            }
          : undefined,
        confirmLabel: 'Cerrar conteo',
      })
      .pipe(filter(Boolean))
      .subscribe(async () => {
        const closed = await this.run(this.api.close(count.id, count.version));
        if (closed) {
          this.reviewing.set(false);
          this.notifier.success(
            closed.movements.length
              ? `Conteo ${closed.folio} cerrado: ${closed.movements.length === 1 ? 'se registró 1 ajuste' : `se registraron ${closed.movements.length} ajustes`}.`
              : `Conteo ${closed.folio} cerrado sin diferencias.`,
          );
        }
      });
  }

  protected cancelCount(): void {
    const count = this.count();
    if (!count) {
      return;
    }
    this.confirmService
      .confirm({
        title: `¿Cancelar el conteo ${count.folio}?`,
        message:
          count.status === 'InProgress'
            ? 'Se descarta lo capturado y la existencia no cambia. No se puede deshacer.'
            : 'El borrador ya no se podrá iniciar.',
        confirmLabel: 'Cancelar conteo',
        cancelLabel: 'Volver',
        tone: 'warn',
      })
      .pipe(filter(Boolean))
      .subscribe(async () => {
        this.pending.clear();
        this.pendingTick.update((tick) => tick + 1);
        const cancelled = await this.run(this.api.cancel(count.id, count.version));
        if (cancelled) {
          this.reviewing.set(false);
          this.notifier.success(`Conteo ${cancelled.folio} cancelado.`);
        }
      });
  }

  protected signedQty(value: number, uom: string): string {
    return `${value > 0 ? '+' : ''}${formatQty(value, this.locale, uom)}`;
  }

  // --- Carga y estado ---

  private load(id: string): void {
    this.loadError.set(false);
    this.api.get(id).subscribe({
      next: (count) => {
        this.pending.clear();
        this.pendingTick.update((tick) => tick + 1);
        this.saveState.set('saved');
        this.apply(count, true);
      },
      error: () => this.loadError.set(true),
    });
  }

  /** Ejecuta una acción que devuelve el conteo actualizado; `null` si falló (ya avisada). */
  private async run(
    request: ReturnType<PhysicalCountsApi['get']>,
    onSuccess?: (count: PhysicalCountDto) => void,
  ): Promise<PhysicalCountDto | null> {
    this.busy.set(true);
    try {
      const count = await firstValueFrom(request);
      this.apply(count, true);
      onSuccess?.(count);
      return count;
    } catch (error) {
      this.handleError(error);
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Muestra el conteo del servidor. Las líneas con captura pendiente conservan lo que el usuario
   * escribió; `resetDraft` vuelve a llenar el formulario del borrador.
   */
  private apply(count: PhysicalCountDto, resetDraft = false): void {
    for (const line of count.lines) {
      let control = this.controls.get(line.id);
      if (!control) {
        control = new FormControl<number | null>(line.countedQty);
        const lineId = line.id;
        control.valueChanges.subscribe(() => this.onEdit(lineId));
        this.controls.set(line.id, control);
      } else if (!this.pending.view.has(line.id) && control.value !== line.countedQty) {
        control.setValue(line.countedQty, { emitEvent: false });
      }
      if (count.status !== 'InProgress' || !this.canCount) {
        control.disable({ emitEvent: false });
      }
    }
    if (resetDraft) {
      this.draftForm.reset({ categoryId: count.categoryId, notes: count.notes ?? '' });
    }
    this.count.set(count);
  }

  private onEdit(lineId: string): void {
    const control = this.controls.get(lineId)!;
    const saved = this.lines().find((line) => line.id === lineId)?.countedQty ?? null;
    const value = control.value;
    // Vacío o inválido no se envía: el servidor no admite "borrar" una cantidad ya contada.
    if (control.invalid || value === null || value === saved) {
      this.pending.delete(lineId);
    } else {
      this.pending.set(lineId, value);
    }
    this.pendingTick.update((tick) => tick + 1);
    if (this.pending.size) {
      if (this.saveState() !== 'saving') {
        this.saveState.set('pending');
      }
      this.edits.next();
    } else if (this.saveState() === 'pending') {
      this.saveState.set('saved');
    }
  }

  private handleError(error: unknown): void {
    const handled = this.conflicts.handle(error, { reload: () => this.load(this.id()) });
    const problem = toProblem(error);
    if (!handled && problem?.status === 400) {
      const messages = Object.values(problem.errors ?? {}).flat();
      this.notifier.error(messages.join(' ') || problem.title || 'Revisa los datos capturados.');
    }
  }
}
