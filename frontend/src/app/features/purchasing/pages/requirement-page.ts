import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import type { ApiEnum } from '../../../core/api/api';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { fromIsoDate, toIsoDate } from '../../../shared/forms/dates';
import { QtyPipe, formatQty } from '../../../shared/pipes/pipes';
import {
  MaterialRequirementsApi,
  RequirementRow,
  RequisitionsApi,
} from '../data-access/purchasing-api';

type Status = ApiEnum<'RequirementStatus'>;

const GROUPS: readonly { value: Status; label: string }[] = [
  { value: 'ToBuy', label: 'Por comprar' },
  { value: 'ToProduce', label: 'Por producir' },
  { value: 'Covered', label: 'Cubiertos' },
];

/**
 * /compras/requerimiento (frontend §7.6, RN-50): what the plant's open production orders up to a date need of each
 * component — required, minimum, stock, in transit (purchase orders and requisitions), shortage and the suggestion in
 * whole purchase units with the preferred supplier — grouped in to buy, to produce (semi-finished, D-04) and covered.
 * **"Crear requisición sugerida"** makes a draft requisition of the chosen rows to buy (all of them when none is chosen).
 */
@Component({
  selector: 'app-requirement-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    PageHeader,
    QtyPipe,
  ],
  templateUrl: './requirement-page.html',
  styleUrl: './requirement-page.scss',
})
export class RequirementPage {
  private readonly api = inject(MaterialRequirementsApi);
  private readonly requisitions = inject(RequisitionsApi);
  private readonly router = inject(Router);
  private readonly confirmService = inject(ConfirmService);
  private readonly notifier = inject(Notifier);
  protected readonly plant = inject(LocationContextService).plant;
  protected readonly canRequest = inject(AuthService).can('purchasing.requisitions.manage');
  protected readonly groupOptions = GROUPS;

  protected readonly to = new FormControl<Date | null>(null);
  private readonly appliedTo = signal<Date | null>(null);
  protected readonly group = signal<Status>('ToBuy');
  protected readonly chosen = signal<Set<string>>(new Set());
  protected readonly expanded = signal<Set<string>>(new Set());
  protected readonly busy = signal(false);

  protected readonly requirement = rxResource({
    params: () => ({ plant: this.plant()?.id, to: this.appliedTo() }),
    stream: ({ params }) =>
      params.plant ? this.api.get(params.plant, toIsoDate(params.to)) : of(null),
  });
  private readonly rows = computed(() =>
    this.requirement.hasValue() && this.requirement.value() ? this.requirement.value()!.rows : [],
  );
  protected readonly counts = computed(() => {
    const counts: Record<Status, number> = { ToBuy: 0, ToProduce: 0, Covered: 0 };
    for (const row of this.rows()) counts[row.status]++;
    return counts;
  });
  protected readonly visible = computed(() =>
    this.rows()
      .filter((r) => r.status === this.group())
      .sort((a, b) => a.sku.localeCompare(b.sku)),
  );

  constructor() {
    // The date used by the server (today + 7) fills the horizon the first time.
    effect(() => {
      const requirement = this.requirement.hasValue() ? this.requirement.value() : null;
      if (requirement && !this.to.value)
        this.to.setValue(fromIsoDate(requirement.to), { emitEvent: false });
    });
    this.to.valueChanges.subscribe((date) => {
      this.appliedTo.set(date);
      this.chosen.set(new Set());
    });
  }

  protected toggleChosen(row: RequirementRow, checked: boolean): void {
    const next = new Set(this.chosen());
    if (checked) next.add(row.itemId);
    else next.delete(row.itemId);
    this.chosen.set(next);
  }

  protected toggleExpanded(row: RequirementRow): void {
    const next = new Set(this.expanded());
    if (next.has(row.itemId)) next.delete(row.itemId);
    else next.add(row.itemId);
    this.expanded.set(next);
  }

  protected async createRequisition(): Promise<void> {
    const plant = this.plant();
    if (!plant) return;
    const toBuy = this.rows().filter((r) => r.status === 'ToBuy');
    const chosen = this.chosen();
    const rows = chosen.size > 0 ? toBuy.filter((r) => chosen.has(r.itemId)) : toBuy;
    if (rows.length === 0) return;
    const confirmed = await this.confirmService.confirm({
      title: 'Crear requisición sugerida',
      message:
        'Se crea una requisición en borrador con lo que falta, en unidades de compra completas y con el proveedor preferido; la revisas antes de enviarla.',
      summary: rows.map((r) => ({
        label: r.sku,
        value: `${formatQty(r.suggestedPurchaseQty, r.purchaseUomCode)}${r.preferredSupplierName ? ' · ' + r.preferredSupplierName : ''}`,
      })),
      confirmLabel: 'Crear requisición',
    });
    if (!confirmed) return;
    this.busy.set(true);
    try {
      const requisition = await firstValueFrom(
        this.requisitions.suggested({
          locationId: plant.id,
          to: toIsoDate(this.to.value),
          neededBy: null,
          itemIds: chosen.size > 0 ? rows.map((r) => r.itemId) : null,
        }),
      );
      this.notifier.info(`Requisición ${requisition.folio} creada en borrador.`);
      await this.router.navigate(['/compras/requisiciones', requisition.id]);
    } catch {
      // The error interceptor shows why.
    } finally {
      this.busy.set(false);
    }
  }
}
