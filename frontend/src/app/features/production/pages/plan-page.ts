import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { debounceTime, firstValueFrom, of } from 'rxjs';
import type { ApiEnum } from '../../../core/api/api';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { ItemPhoto } from '../../../shared/components/item-photo/item-photo';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { documentLink } from '../../../shared/data-access/document-links';
import { fromIsoDate, toIsoDate } from '../../../shared/forms/dates';
import { ENUM_LABELS } from '../../../shared/pipes/labels';
import { QtyPipe, StatusLabelPipe, formatQty } from '../../../shared/pipes/pipes';
import { plantFactories } from '../data-access/plant-factories';
import { GeneratedOrder, PlanRow, ProductionPlanApi } from '../data-access/production-api';
import { groupPlan, offMultiple, planKey } from '../ui/plan-rules';

type Shift = ApiEnum<'Shift'>;

interface Selected {
  row: PlanRow;
  quantity: FormControl<number | null>;
  shift: FormControl<Shift | null>;
}

/** Document type of each demand, for its link. */
const DEMAND_DOCS = {
  BranchOrderLine: 'BranchOrder',
  CustomerOrderLine: 'CustomerOrder',
  ParentOrder: 'ProductionOrder',
} as const;

/**
 * /produccion/plan (frontend §7.4.1, RN-70, RN-71): the plant's net demand by date and factory (RN-49) — branch and customer
 * orders, stock replenishment and parent orders — with stock, open orders and what to produce. Rows with something to
 * produce are selected with an editable quantity (the multiple is a hint) and an optional shift; **"Generar OP (n)"**
 * creates the draft orders linked to the order lines they attend.
 */
@Component({
  selector: 'app-plan-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ItemPhoto,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    PageHeader,
    QtyInput,
    QtyPipe,
    StatusLabelPipe,
  ],
  templateUrl: './plan-page.html',
  styleUrl: './plan-page.scss',
})
export class PlanPage {
  /** `?q=`: a product to look for (the requirement links its semi-finished goods to produce). */
  readonly q = input<string>();

  private readonly api = inject(ProductionPlanApi);
  private readonly confirmService = inject(ConfirmService);
  private readonly notifier = inject(Notifier);
  protected readonly plant = inject(LocationContextService).plant;
  protected readonly canGenerate = inject(AuthService).can('production.orders.manage');
  protected readonly shifts = Object.entries(ENUM_LABELS.Shift).map(([value, label]) => ({
    value: value as Shift,
    label,
  }));

  protected readonly filters = new FormGroup({
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
    factoryId: new FormControl<string | null>(null),
    q: new FormControl('', { nonNullable: true }),
  });
  private readonly applied = signal(this.filters.getRawValue());

  protected readonly plan = rxResource({
    params: () => ({ plant: this.plant()?.id, filters: this.applied() }),
    stream: ({ params }) => {
      const f = params.filters;
      return params.plant
        ? this.api.get({
            locationId: params.plant,
            from: toIsoDate(f.from),
            to: toIsoDate(f.to),
            factoryId: f.factoryId,
            q: f.q.trim() || null,
          })
        : of(null);
    },
  });
  protected readonly groups = computed(() =>
    this.plan.hasValue() && this.plan.value() ? groupPlan(this.plan.value()!.rows) : [],
  );
  protected readonly factories = plantFactories();

  protected readonly selected = signal<Map<string, Selected>>(new Map());
  protected readonly expanded = signal<Set<string>>(new Set());
  protected readonly generated = signal<GeneratedOrder[] | null>(null);
  protected readonly busy = signal(false);
  /** Bumps on every edit of a selected quantity. */
  private readonly edits = signal(0);

  constructor() {
    // The range used by the server (default days) fills the date filters the first time.
    effect(() => {
      const plan = this.plan.hasValue() ? this.plan.value() : null;
      const { from, to } = this.filters.controls;
      if (plan && !from.value && !to.value)
        this.filters.patchValue(
          { from: fromIsoDate(plan.from), to: fromIsoDate(plan.to) },
          { emitEvent: false },
        );
    });
    effect(() => {
      const q = this.q();
      if (q) untracked(() => this.filters.controls.q.setValue(q));
    });
    this.filters.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe(() => this.applied.set(this.filters.getRawValue()));
    // A new plan keeps the chosen rows that are still to produce and drops the rest.
    effect(() => {
      const plan = this.plan.hasValue() ? this.plan.value() : null;
      if (!plan) return;
      const still = new Set(plan.rows.filter((r) => this.selectable(r)).map((r) => planKey(r)));
      const current = untracked(this.selected);
      if ([...current.keys()].some((key) => !still.has(key)))
        this.selected.set(new Map([...current].filter(([key]) => still.has(key))));
    });
  }

  protected key = planKey;

  protected selectable(row: PlanRow): boolean {
    return this.canGenerate && row.suggestedQty > 0 && row.hasActiveRecipe;
  }

  protected isSelected(row: PlanRow): boolean {
    return this.selected().has(planKey(row));
  }

  protected selection(row: PlanRow): Selected | undefined {
    return this.selected().get(planKey(row));
  }

  protected toggle(row: PlanRow, checked: boolean): void {
    const next = new Map(this.selected());
    if (checked) {
      const quantity = new FormControl<number | null>(row.suggestedQty);
      quantity.valueChanges.subscribe(() => this.edits.update((n) => n + 1));
      next.set(planKey(row), { row, quantity, shift: new FormControl<Shift | null>(null) });
    } else next.delete(planKey(row));
    this.selected.set(next);
  }

  protected toggleExpanded(row: PlanRow): void {
    const next = new Set(this.expanded());
    const key = planKey(row);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.expanded.set(next);
  }

  protected multipleHint(row: PlanRow): boolean {
    this.edits();
    return offMultiple(this.selection(row)?.quantity.value ?? null, row.productionMultiple);
  }

  protected demandLink(type: keyof typeof DEMAND_DOCS, id: string): string[] | null {
    return documentLink(DEMAND_DOCS[type], id);
  }

  protected async generate(): Promise<void> {
    const plant = this.plant();
    const chosen = [...this.selected().values()];
    if (!plant || chosen.length === 0) return;
    if (chosen.some((c) => !c.quantity.value || c.quantity.value <= 0)) {
      chosen.forEach((c) => c.quantity.markAsTouched());
      this.notifier.error('Cada renglón elegido necesita una cantidad mayor que cero.');
      return;
    }
    const confirmed = await this.confirmService.confirm({
      title: `Generar ${chosen.length === 1 ? 'una orden' : chosen.length + ' órdenes'} de producción`,
      message: 'Se crean en borrador, ligadas a los pedidos que atienden; no apartan existencia.',
      summary: chosen.map((c) => ({
        label: `${c.row.sku} · ${new Date(`${c.row.date}T00:00`).toLocaleDateString('es-MX')}`,
        value: `${formatQty(c.quantity.value, c.row.uomCode)} · ${c.row.factoryName ?? 'sin fábrica'}`,
      })),
      confirmLabel: 'Generar',
    });
    if (!confirmed) return;
    this.busy.set(true);
    try {
      const orders = await firstValueFrom(
        this.api.generate({
          locationId: plant.id,
          lines: chosen.map((c) => ({
            itemId: c.row.itemId,
            date: c.row.date,
            shift: c.shift.value,
            quantity: c.quantity.value!,
            // RN-72: only order lines are linked; a parent OP is shown but never linked.
            demandLineIds: c.row.demandLines
              .filter((d) => d.type !== 'ParentOrder')
              .map((d) => d.lineId),
          })),
        }),
      );
      this.generated.set(orders);
      this.selected.set(new Map());
      this.plan.reload();
    } catch {
      // The error interceptor shows why (a product without an active recipe blocks all).
    } finally {
      this.busy.set(false);
    }
  }
}
