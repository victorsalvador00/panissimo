import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  LOCALE_ID,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  FormRecord,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router, RouterLink } from '@angular/router';
import { catchError, debounceTime, filter, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { Notifier } from '../../../core/http/notifier.service';
import { ConfirmService, ConflictHandler } from '../../../shared/components/dialogs.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { formatMxn, MxnPipe } from '../../../shared/pipes/mxn.pipe';
import { formatQty, QtyPipe } from '../../../shared/pipes/qty.pipe';
import { LotStock, StockApi } from '../../inventory/data-access/stock.api';
import { lotsTotal } from '../../inventory/ui/lot-split';
import {
  ProductionOrderDto,
  ProductionOrderLine,
  ProductionOrdersApi,
} from '../data-access/production-orders.api';
import { RecipesApi } from '../data-access/recipes.api';
import {
  addLots,
  CompleteLine,
  completionSummary,
  createCompleteLine,
  prefillActuals,
  toCompleteRequest,
} from '../ui/production-order-lines';

/**
 * Completar una orden liberada (spec frontend §7.4, RN-12 y RN-13): cantidad producida, consumo real
 * por componente prellenado con el teórico para lo producido, reparto opcional por lotes y resumen
 * de costo y merma antes de confirmar. Todo se registra en una sola transacción en el backend.
 */
@Component({
  selector: 'app-production-order-complete-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    MatButtonModule,
    MatSlideToggleModule,
    PageHeader,
    QtyInput,
    QtyPipe,
    MxnPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './production-order-complete-page.html',
  styleUrl: './production-order-complete-page.scss',
})
export class ProductionOrderCompletePage {
  private readonly api = inject(ProductionOrdersApi);
  private readonly recipes = inject(RecipesApi);
  private readonly stock = inject(StockApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly confirmService = inject(ConfirmService);
  private readonly conflicts = inject(ConflictHandler);
  private readonly locale = inject(LOCALE_ID);

  readonly id = input.required<string>();

  protected readonly order = signal<ProductionOrderDto | null>(null);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  /** Lotes vigentes con existencia en la ubicación, por componente. */
  protected readonly lots = signal<Map<string, LotStock[]>>(new Map());

  protected readonly form = new FormGroup({
    producedQty: new FormControl<number | null>(null, Validators.required),
    lines: new FormRecord<CompleteLine>({}),
  });

  private readonly value = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );
  /** La explosión se pide al dejar de escribir la cantidad producida. */
  private readonly producedQty = toSignal(
    this.form.controls.producedQty.valueChanges.pipe(debounceTime(300)),
    { initialValue: null },
  );

  /** Teórico para la cantidad producida (RN-13), disponible y costo promedio en la ubicación. */
  protected readonly explosion = rxResource({
    params: () => {
      const order = this.order();
      const qty = this.producedQty();
      return order && qty && qty > 0 && this.form.controls.producedQty.valid
        ? { recipeId: order.recipeId, qty, locationId: order.locationId }
        : undefined;
    },
    stream: ({ params }) => this.recipes.explode(params.recipeId, params.qty, params.locationId),
  });

  protected readonly summary = computed(() => {
    const explosion = this.explosion.value();
    const value = this.value();
    if (!explosion) {
      return null;
    }
    const actuals = Object.fromEntries(
      Object.entries(value.lines).map(([id, line]) => [id, line.actualQty]),
    );
    return completionSummary(explosion.lines, actuals, value.producedQty);
  });

  /** Hasta que llega el teórico de la cantidad capturada, no se puede confirmar. */
  protected readonly pending = computed(
    () =>
      this.explosion.isLoading() ||
      this.value().producedQty !== this.producedQty() ||
      !this.explosion.value(),
  );

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
    effect(() => {
      const explosion = this.explosion.value();
      untracked(
        () => explosion && prefillActuals(this.form.controls.lines.controls, explosion.lines),
      );
    });
  }

  protected lineForm(line: ProductionOrderLine): CompleteLine {
    return this.form.controls.lines.controls[line.componentItemId];
  }

  protected lotsOf(line: ProductionOrderLine): LotStock[] {
    return this.lots().get(line.componentItemId) ?? [];
  }

  protected lineSummary(line: ProductionOrderLine) {
    return this.summary()?.lines.find((l) => l.componentItemId === line.componentItemId) ?? null;
  }

  protected available(line: ProductionOrderLine): number | null {
    return (
      this.explosion.value()?.lines.find((l) => l.componentItemId === line.componentItemId)
        ?.available ?? null
    );
  }

  protected assigned(line: ProductionOrderLine): number {
    const value = this.value().lines[line.componentItemId];
    return value ? lotsTotal(Object.values(value.lots.lots)) : 0;
  }

  protected submit(): void {
    const order = this.order();
    const summary = this.summary();
    if (!order || !summary || this.form.invalid || this.pending() || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const produced = value.producedQty!;
    const request = toCompleteRequest(order.version, produced, value.lines);
    const lotLabels = this.lotLabels();
    this.confirmService
      .confirm({
        title: `¿Completar la orden ${order.folio}?`,
        message:
          'Se descontarán los componentes y entrará el producto a la existencia. No se puede deshacer.',
        items: [
          { label: 'Producto', value: `${order.outputSku} · ${order.outputName}` },
          {
            label: 'Producido',
            value: formatQty(produced, this.locale, order.outputUomCode),
          },
          ...(order.outputTracksLots ? [{ label: 'Lote de salida', value: order.folio }] : []),
          {
            label: 'Costo estimado',
            value: `${formatMxn(summary.estimatedTotalCost, this.locale)} (${formatMxn(summary.estimatedUnitCost, this.locale)} / ${order.outputUomCode})`,
          },
          { label: 'Merma estimada', value: formatMxn(summary.wasteCost, this.locale) },
        ],
        lines: {
          headers: ['Componente', 'Teórico', 'Real', 'Merma'],
          rows: order.lines.map((line) => {
            const s = summary.lines.find((l) => l.componentItemId === line.componentItemId);
            const uom = line.baseUomCode;
            return [
              `${line.sku} · ${line.name}`,
              formatQty(s?.theoreticalQty, this.locale, uom),
              formatQty(s?.actualQty, this.locale, uom),
              formatQty(s?.wasteQty, this.locale, uom),
            ];
          }),
          alignEnd: [1, 2, 3],
        },
        confirmLabel: 'Completar',
      })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.saving.set(true);
          return this.api.complete(order.id, request);
        }),
      )
      .subscribe({
        next: (completed) => {
          this.saving.set(false);
          this.notifier.success(
            `Orden ${completed.folio} completada: entraron ${formatQty(completed.producedQty, this.locale, completed.outputUomCode)}.`,
          );
          void this.router.navigate(['/produccion/ordenes', completed.id]);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.conflicts.handle(error, {
            reload: () => this.load(order.id),
            lotLabels,
            units: Object.fromEntries(order.lines.map((l) => [l.componentItemId, l.baseUomCode])),
          });
        },
      });
  }

  private lotLabels(): Record<string, string> {
    const labels: Record<string, string> = {};
    this.lots().forEach((lots) =>
      lots.forEach((lot) => lot.lotId && lot.lotNumber && (labels[lot.lotId] = lot.lotNumber)),
    );
    return labels;
  }

  private load(id: string): void {
    this.loadError.set(false);
    this.api.get(id).subscribe({
      next: (order) => {
        const lines = this.form.controls.lines;
        Object.keys(lines.controls).forEach((key) => lines.removeControl(key));
        order.lines.forEach((line) => lines.addControl(line.componentItemId, createCompleteLine()));
        this.form.controls.producedQty.setValue(order.plannedQty);
        this.order.set(order);
        if (order.status === 'Released') {
          this.loadLots(order);
        }
      },
      error: () => this.loadError.set(true),
    });
  }

  /** Lotes para el reparto manual. Sin `inventory.view` no se ofrece (se usa FEFO). */
  private loadLots(order: ProductionOrderDto): void {
    const itemIds = order.lines.map((line) => line.componentItemId);
    forkJoin(
      itemIds.map((itemId) =>
        this.stock.lots(order.locationId, itemId).pipe(catchError(() => of([] as LotStock[]))),
      ),
    ).subscribe((results) => {
      const lots = new Map(
        itemIds.map((itemId, i) => [
          itemId,
          results[i].filter((lot) => lot.lotId && !lot.isExpired && lot.quantity > 0),
        ]),
      );
      lots.forEach((itemLots, itemId) =>
        addLots(
          this.form.controls.lines.controls[itemId],
          itemLots.map((lot) => lot.lotId!),
        ),
      );
      this.lots.set(lots);
    });
  }
}
